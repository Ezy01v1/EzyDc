import { lookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Descarga de URLs de terceros SIN abrir una puerta SSRF:
 *  - solo http/https y puertos 80/443;
 *  - la IP se valida en el propio `lookup` del socket (la misma que se usa para conectar),
 *    así un DNS "rebinding" no puede cambiarla entre la comprobación y la conexión;
 *  - se bloquean loopback, redes privadas, link-local (metadatos cloud 169.254.169.254), CGNAT, multicast…;
 *  - redirecciones manuales (máx. 3), cada salto revalidado;
 *  - tiempo total y bytes acotados.
 */

const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  // OJO: no añadir ::ffff:0:0/96 — BlockList lo aplica también a TODAS las IPv4.
  // Las IPv4 mapeadas (::ffff:a.b.c.d) se revalidan como IPv4 en isBlockedIp.
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, bits, 'ipv6');
}

export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return blocked.check(ip, 'ipv4');
  if (fam === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return blocked.check(mapped[1]!, 'ipv4');
    return blocked.check(ip, 'ipv6');
  }
  return true;
}

export class UnsafeUrlError extends Error {}

const safeLookup: LookupFunction = (hostname, options, cb) => {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 4);
    const list = addresses as unknown as { address: string; family: number }[];
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad || list.length === 0) return cb(new UnsafeUrlError(`Dirección no permitida: ${hostname}`), '', 4);
    // Node pide `all` en algunos caminos (happy eyeballs): respetamos el formato solicitado.
    if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof list) => void)(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
};

export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError('URL inválida');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrlError('Esquema no permitido');
  if (u.username || u.password) throw new UnsafeUrlError('Credenciales en la URL');
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (port !== 80 && port !== 443) throw new UnsafeUrlError('Puerto no permitido');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedIp(host)) throw new UnsafeUrlError('Dirección no permitida');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new UnsafeUrlError('Host no permitido');
  return u;
}

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

export async function safeFetch(
  raw: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; accept?: string } = {},
): Promise<SafeResponse> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const maxBytes = opts.maxBytes ?? 512 * 1024;
  const deadline = Date.now() + timeoutMs;
  let url = assertSafeUrl(raw);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const res = await once(url, Math.max(1, deadline - Date.now()), maxBytes, opts.accept ?? 'text/html,application/xhtml+xml');
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = assertSafeUrl(new URL(res.location, url).toString());
      continue;
    }
    return { url: url.toString(), status: res.status, contentType: res.contentType, body: res.body };
  }
  throw new UnsafeUrlError('Demasiadas redirecciones');
}

function once(
  url: URL,
  timeoutMs: number,
  maxBytes: number,
  accept: string,
): Promise<{ status: number; contentType: string; location?: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: timeoutMs,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; ezyDC-LinkPreview/1.0)',
          accept,
          'accept-language': 'es,en;q=0.8',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, contentType, location: res.headers.location, body: Buffer.alloc(0) });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            // Para previews basta con el <head>: cortamos y nos quedamos con lo leído.
            chunks.push(c.subarray(0, c.length - (size - maxBytes)));
            res.destroy();
            return resolve({ status, contentType, body: Buffer.concat(chunks) });
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Tiempo agotado')), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('timeout', () => req.destroy(new Error('Tiempo agotado')));
    req.on('error', reject);
    req.end();
  });
}
