import type { EmbedDto } from '@ezydc/shared';

/** Tarjetas de vista previa de enlaces (generadas en el servidor; aquí solo se pintan). */
export function Embeds({ items }: { items: EmbedDto[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-1 flex flex-col items-start gap-1.5">
      {items.map((e) =>
        !e.title && !e.description && e.image ? (
          // Enlace directo a una imagen: solo la imagen.
          <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="block overflow-hidden rounded-md">
            <img src={e.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-[300px] max-w-[min(400px,100%)] object-contain" />
          </a>
        ) : (
          <article
            key={e.url}
            className="grid w-full max-w-[432px] gap-1 rounded-md border-l-4 bg-surface-1 p-3"
            style={{ borderLeftColor: e.color ?? 'var(--surface-3, #3f3f46)' }}
          >
            {e.siteName && <div className="truncate text-xs text-fg-subtle">{e.siteName}</div>}
            {e.title && (
              <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="line-clamp-2 font-semibold text-accent hover:underline">
                {e.title}
              </a>
            )}
            {e.description && <p className="line-clamp-3 text-sm text-fg-muted">{e.description}</p>}
            {e.image && (
              <img
                src={e.image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="mt-1 max-h-[220px] w-full rounded object-cover"
                onError={(ev) => (ev.currentTarget.style.display = 'none')}
              />
            )}
          </article>
        ),
      )}
    </div>
  );
}
