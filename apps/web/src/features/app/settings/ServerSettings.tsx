import { hasPermission, Permission, type ServerDetail } from '@ezydc/shared';
import { useState } from 'react';
import { EmojisTab } from './EmojisTab';
import { MembersTab } from './MembersTab';
import { RolesTab } from './RolesTab';
import { SettingsShell } from './SettingsShell';

type TabId = 'roles' | 'members' | 'emojis';

export default function ServerSettings({ server, onClose }: { server: ServerDetail; onClose: () => void }) {
  const perms = BigInt(server.myPermissions);
  const tabs: { id: TabId; label: string }[] = [
    ...(hasPermission(perms, Permission.MANAGE_ROLES)
      ? [
          { id: 'roles' as const, label: 'Roles' },
          { id: 'members' as const, label: 'Miembros' },
        ]
      : []),
    ...(hasPermission(perms, Permission.MANAGE_EMOJIS) ? [{ id: 'emojis' as const, label: 'Emojis' }] : []),
  ];
  const [tab, setTab] = useState<TabId>(tabs[0]?.id ?? 'emojis');
  return (
    <SettingsShell title={server.name} tabs={tabs} active={tab} onTab={setTab} onClose={onClose}>
      {tab === 'roles' ? <RolesTab server={server} /> : tab === 'members' ? <MembersTab server={server} /> : <EmojisTab server={server} />}
    </SettingsShell>
  );
}
