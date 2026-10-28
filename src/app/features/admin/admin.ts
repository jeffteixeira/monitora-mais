import { Component } from '@angular/core';

import { ZardTabsImports } from '@/shared/components/tabs';

import { AdminCatalog } from './admin-catalog';
import { AdminMembers } from './admin-members';
import { AdminRewards } from './admin-rewards';
import { AdminSettings } from './admin-settings';

@Component({
  selector: 'app-admin',
  imports: [ZardTabsImports, AdminMembers, AdminCatalog, AdminRewards, AdminSettings],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Administração</h1>
    <p class="mt-1 mb-6 text-muted-foreground">Gerencie membros, catálogo, recompensas e convites desta organização.</p>

    <z-tab-group>
      <z-tab label="Membros"><div class="pt-6"><app-admin-members /></div></z-tab>
      <z-tab label="Catálogo"><div class="pt-6"><app-admin-catalog /></div></z-tab>
      <z-tab label="Recompensas"><div class="pt-6"><app-admin-rewards /></div></z-tab>
      <z-tab label="Organização"><div class="pt-6"><app-admin-settings /></div></z-tab>
    </z-tab-group>
  `,
})
export class Admin {}
