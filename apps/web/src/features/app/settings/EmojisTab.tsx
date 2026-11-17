import { EMOJI_TYPES, type EmojiDto, MAX_EMOJI_BYTES, MAX_EMOJIS_PER_SERVER, type ServerDetail, type UploadTicket } from '@ezydc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { emojisKey } from '../../../lib/emoji';
import { putToR2 } from '../../../lib/upload';

/** Reduce a 128×128 máx. (los emojis se ven a 22–48 px). GIF se deja intacto para no perder la animación. */
async function shrink(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 128 / Math.max(bmp.width, bmp.height));
  if (s === 1 && file.size <= MAX_EMOJI_BYTES) {
    bmp.close();
    return file;
  }
  const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.9 });
  return new File([blob], 'emoji.webp', { type: blob.type });
}

export function EmojisTab({ server }: { server: ServerDetail }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = ['emojis', server.id] as const;
  const { data: emojis = [] } = useQuery({ queryKey: key, queryFn: () => api<EmojiDto[]>(`/servers/${server.id}/emojis`) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: emojisKey, exact: true });
  };

  async function upload(file: File) {
    setError(null);
    if (!(EMOJI_TYPES as readonly string[]).includes(file.type) && !/^image\/(jpeg|avif)$/.test(file.type)) {
      setError('Usa PNG, GIF, WebP o JPG');
      return;
    }
    setBusy(true);
    try {
      const f = await shrink(file);
      if (f.size > MAX_EMOJI_BYTES) throw new Error('La imagen pesa más de 256 KB (en GIF, redúcelo antes)');
      if (!(EMOJI_TYPES as readonly string[]).includes(f.type)) throw new Error('Tu navegador no pudo convertir la imagen');
      const name =
        file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .slice(0, 32)
          .padEnd(2, '_') || 'emoji';
      const t = await api<UploadTicket>(`/servers/${server.id}/emojis/upload`, { method: 'POST', body: { contentType: f.type, size: f.size } });
      await putToR2(t, f, () => {});
      await api(`/servers/${server.id}/emojis`, { method: 'POST', body: { name, uploadId: t.uploadId } });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function rename(e: EmojiDto, name: string) {
    if (name === e.name) return;
    setError(null);
    try {
      await api(`/servers/${server.id}/emojis/${e.id}`, { method: 'PATCH', body: { name } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    refresh();
  }

  async function remove(e: EmojiDto) {
    if (!window.confirm(`¿Eliminar :${e.name}:?`)) return;
    await api(`/servers/${server.id}/emojis/${e.id}`, { method: 'DELETE' }).catch(() => {});
    refresh();
  }

  const full = emojis.length >= MAX_EMOJIS_PER_SERVER;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Emojis</h1>
      <p className="mb-4 text-sm text-fg-muted">
        Úsalos escribiendo <code>:nombre:</code> o desde el selector. PNG, GIF o WebP · máx. 256 KB · {emojis.length}/{MAX_EMOJIS_PER_SERVER}.
      </p>
      <button className="btn-primary mb-4" disabled={busy || full} onClick={() => input.current?.click()}>
        {busy ? 'Subiendo…' : full ? 'Límite alcanzado' : 'Subir emoji'}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/gif,image/webp,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
      {error && <p className="mb-4 rounded bg-danger/15 px-3 py-2 text-sm text-danger">{error}</p>}
      {emojis.length === 0 ? (
        <p className="text-sm text-fg-subtle">Este servidor aún no tiene emojis propios.</p>
      ) : (
        <ul className="divide-y divide-surface-3">
          {emojis.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <img src={e.url} alt={e.name} className="h-8 w-8 object-contain" />
              <span className="text-fg-subtle">:</span>
              <input
                className="input max-w-56 py-1 text-sm"
                defaultValue={e.name}
                maxLength={32}
                aria-label={`Nombre de ${e.name}`}
                onBlur={(ev) => void rename(e, ev.target.value.trim())}
                onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()}
              />
              <span className="text-fg-subtle">:</span>
              <button className="ml-auto text-sm text-danger hover:underline" onClick={() => void remove(e)}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
