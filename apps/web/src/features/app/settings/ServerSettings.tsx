import type { ServerDetail } from '@ezydc/shared';
import { useState } from 'react';
import { MembersTab } from './MembersTab';
import { RolesTab } from './RolesTab';
import { SettingsShell } from './SettingsShell';

type TabId = 'roles' | 'members';

export default function ServerSettings({ server, onClose }: { server: ServerDetail; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('roles');
  return (
    <SettingsShell
      title={server.name}
      tabs={[
        { id: 'roles', label: 'Roles' },
        { id: 'members', label: 'Miembros' },
      ]}
      active={tab}
      onTab={setTab}
      onClose={onClose}
    >
      {tab === 'roles' ? <RolesTab server={server} /> : <MembersTab server={server} />}
    </SettingsShell>
  );
}
