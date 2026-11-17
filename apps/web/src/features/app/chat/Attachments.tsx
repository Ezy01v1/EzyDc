import type { AttachmentDto } from '@ezydc/shared';
import { formatBytes } from '../../../lib/upload';

const MAX_W = 400;
const MAX_H = 300;

/** Caja con el tamaño final ya reservado (ancho/alto medidos al subir): el chat no salta al cargar. */
function box(a: AttachmentDto): { width: number; height: number } | undefined {
  if (!a.width || !a.height) return undefined;
  const s = Math.min(1, MAX_W / a.width, MAX_H / a.height);
  return { width: Math.round(a.width * s), height: Math.round(a.height * s) };
}

export function Attachments({ items }: { items: AttachmentDto[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-1 flex flex-col items-start gap-1.5">
      {items.map((a) => (
        <Attachment key={a.id} a={a} />
      ))}
    </div>
  );
}

function Attachment({ a }: { a: AttachmentDto }) {
  const size = box(a);
  if (a.contentType.startsWith('image/') && a.url) {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block max-w-full overflow-hidden rounded-md bg-surface-0" style={size}>
        <img
          src={a.url}
          alt={a.filename}
          loading="lazy"
          decoding="async"
          width={size?.width}
          height={size?.height}
          className="h-full max-h-[300px] w-full max-w-[400px] object-contain"
        />
      </a>
    );
  }
  if (a.contentType.startsWith('video/') && a.url) {
    return (
      <video
        src={a.url}
        controls
        preload="metadata"
        className="max-h-[300px] max-w-full rounded-md bg-black"
        style={size ?? { width: MAX_W, height: 225 }}
      />
    );
  }
  if (a.contentType.startsWith('audio/') && a.url) {
    return (
      <div className="w-full max-w-sm rounded-md bg-surface-1 p-2">
        <div className="mb-1 truncate text-sm">{a.filename}</div>
        <audio src={a.url} controls preload="none" className="w-full" />
      </div>
    );
  }
  return (
    <div className="flex w-full max-w-sm items-center gap-3 rounded-md border border-surface-0 bg-surface-1 p-3">
      <span className="text-3xl" aria-hidden>
        📄
      </span>
      <div className="min-w-0 flex-1">
        {a.url ? (
          <a href={a.url} download={a.filename} target="_blank" rel="noopener noreferrer" className="block truncate text-accent hover:underline">
            {a.filename}
          </a>
        ) : (
          <span className="block truncate">{a.filename}</span>
        )}
        <span className="text-xs text-fg-subtle">{formatBytes(a.size)}</span>
      </div>
    </div>
  );
}
