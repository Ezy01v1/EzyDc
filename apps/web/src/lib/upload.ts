import type { UploadTicket } from '@ezydc/shared';

const MAX_DIM = 2560;
const COMPRESS_OVER = 512 * 1024;

export interface PreparedFile {
  file: File;
  width?: number;
  height?: number;
}

/**
 * Antes de subir: mide imágenes (el chat reserva su hueco y no "salta" al cargar) y
 * recomprime fotos grandes a WebP en el navegador (menos MB para todos, sin coste de servidor).
 * GIF se deja tal cual (perdería la animación).
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  if (!/^image\/(png|jpeg|webp|avif)$/.test(file.type)) {
    if (file.type.startsWith('video/')) return { file, ...(await videoSize(file)) };
    if (file.type === 'image/gif') return { file, ...(await imageSize(file)) };
    return { file };
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return { file };
  }
  const { width, height } = bmp;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  if (file.size <= COMPRESS_OVER && scale === 1) {
    bmp.close();
    return { file, width, height };
  }
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
  if (blob.type !== 'image/webp' || blob.size >= file.size) return { file, width, height }; // sin WebP o no compensa
  const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
  return { file: new File([blob], name, { type: 'image/webp' }), width: w, height: h };
}

function imageSize(file: File): Promise<{ width?: number; height?: number }> {
  return createImageBitmap(file)
    .then((b) => {
      const r = { width: b.width, height: b.height };
      b.close();
      return r;
    })
    .catch(() => ({}));
}

function videoSize(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (r: { width?: number; height?: number }) => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(v.videoWidth ? { width: v.videoWidth, height: v.videoHeight } : {});
    v.onerror = () => done({});
    v.src = url;
  });
}

/** PUT directo a R2 con progreso (fetch aún no da progreso de subida). */
export function putToR2(ticket: UploadTicket, file: File, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl);
    for (const [k, v] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Subida fallida (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Error de red al subir (¿CORS del bucket?)'));
    xhr.onabort = () => reject(new DOMException('Cancelado', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
