import type { PresenceStatus, UserPublic } from '@ezydc/shared';
import { colorFor, displayName, initials } from '../lib/format';

const PRESENCE_COLOR: Record<PresenceStatus, string> = {
  ONLINE: 'bg-ok',
  IDLE: 'bg-warn',
  DND: 'bg-danger',
  OFFLINE: 'bg-fg-subtle',
};

export function Avatar({
  user,
  size = 40,
  presence,
}: {
  user: UserPublic | null;
  size?: number;
  presence?: PresenceStatus;
}) {
  const name = displayName(user);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center rounded-full font-semibold text-white select-none"
          style={{ background: user ? colorFor(user.id) : '#555', fontSize: size * 0.38 }}
        >
          {initials(name)}
        </div>
      )}
      {presence && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 rounded-full border-[3px] border-surface-1 ${PRESENCE_COLOR[presence]}`}
          style={{ width: size * 0.38, height: size * 0.38 }}
        />
      )}
    </div>
  );
}
