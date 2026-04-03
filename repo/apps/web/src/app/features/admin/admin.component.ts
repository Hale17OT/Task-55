import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold tracking-tight">Administration</h2>

      <!-- Tabs -->
      <div class="flex gap-1 border-b">
        @for (tab of tabs; track tab) {
          <button
            (click)="activeTab.set(tab)"
            class="px-4 py-2 text-sm font-medium transition-colors"
            [class]="activeTab() === tab ? 'border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'">
            {{ tab }}
          </button>
        }
      </div>

      <!-- Roles Tab -->
      @if (activeTab() === 'Roles') {
        <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
          @if (roles().length > 0) {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="border-b">
                  <th class="py-2 text-left font-medium">Role</th>
                  <th class="py-2 text-left font-medium">Permissions</th>
                  <th class="py-2 text-left font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  @for (role of roles(); track role.role) {
                    <tr class="border-b last:border-0">
                      <td class="py-2 capitalize font-medium">{{ role.role }}</td>
                      <td class="py-2"><div class="flex flex-wrap gap-1">
                        @for (p of role.permissions; track p) {
                          <span class="rounded bg-[hsl(var(--accent))] px-1.5 py-0.5 text-xs">{{ p }}</span>
                        }
                      </div></td>
                      <td class="py-2">
                        <button (click)="editRole(role)" class="rounded border px-2 py-1 text-xs hover:bg-[hsl(var(--accent))]">Edit</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="text-sm text-[hsl(var(--muted-foreground))]">Loading roles...</p>
          }
        </div>

        @if (editingRole()) {
          <div class="mt-4 rounded-lg border bg-[hsl(var(--card))] p-4">
            <h4 class="mb-2 text-sm font-semibold capitalize">Edit Permissions: {{ editingRole() }}</h4>
            <div class="flex flex-wrap gap-2">
              @for (perm of allPermissions(); track perm) {
                <label class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs">
                  <input type="checkbox" [checked]="editingPermissions().includes(perm)"
                    (change)="togglePermission(perm)" />
                  {{ perm }}
                </label>
              }
            </div>
            <div class="mt-3 flex gap-2">
              <button (click)="saveRolePermissions()" class="rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))]">Save</button>
              <button (click)="editingRole.set(null)" class="rounded border px-3 py-1.5 text-sm">Cancel</button>
            </div>
          </div>
        }
      }

      <!-- Rules Tab -->
      @if (activeTab() === 'Rules') {
        <div class="space-y-3">
          @for (rule of rules(); track rule.id) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium">{{ rule.ruleKey }}</span>
                  <span class="ml-2 text-xs text-[hsl(var(--muted-foreground))]">v{{ rule.version }}</span>
                </div>
                <span class="rounded-full px-2 py-0.5 text-xs"
                  [class]="rule.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'">
                  {{ rule.status }}
                </span>
              </div>
              <div class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                Limit: {{ rule.config?.limit }} / {{ rule.config?.window }} · Canary: {{ rule.canaryPercent }}%
              </div>
            </div>
          }
        </div>
      }

      <!-- Audit Tab -->
      @if (activeTab() === 'Audit') {
        <div class="rounded-lg border bg-[hsl(var(--card))]">
          <div class="max-h-96 overflow-auto">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-[hsl(var(--card))]"><tr class="border-b">
                <th class="px-3 py-2 text-left font-medium">Time</th>
                <th class="px-3 py-2 text-left font-medium">Action</th>
                <th class="px-3 py-2 text-left font-medium">Resource</th>
                <th class="px-3 py-2 text-left font-medium">IP</th>
              </tr></thead>
              <tbody>
                @for (log of auditLogs(); track log.id) {
                  <tr class="border-b last:border-0 hover:bg-[hsl(var(--accent))]">
                    <td class="px-3 py-2 text-xs">{{ log.createdAt | date:'MM/dd HH:mm:ss' }}</td>
                    <td class="px-3 py-2 text-xs font-mono">{{ log.action }}</td>
                    <td class="px-3 py-2 text-xs">{{ log.resourceType }}</td>
                    <td class="px-3 py-2 text-xs">{{ log.ipAddress }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Config Tab -->
      @if (activeTab() === 'Config') {
        <div class="space-y-3">
          @for (entry of configEntries(); track entry.key) {
            <div class="flex items-center justify-between rounded-lg border bg-[hsl(var(--card))] p-4">
              <div>
                <span class="font-medium font-mono text-sm">{{ entry.key }}</span>
                <div class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{{ entry.displayValue }}</div>
              </div>
              <div class="flex items-center gap-2">
                @if (entry.isEncrypted) {
                  <button (click)="revealConfig(entry.key)" class="rounded border px-2 py-1 text-xs hover:bg-[hsl(var(--accent))]">Reveal</button>
                  <span class="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">Encrypted</span>
                }
              </div>
            </div>
          }
          @if (configEntries().length === 0) {
            <p class="text-sm text-[hsl(var(--muted-foreground))]">No config entries</p>
          }
        </div>
      }

      <!-- Sessions Tab -->
      @if (activeTab() === 'Sessions') {
        <div class="space-y-2">
          @for (session of sessions(); track session.id) {
            <div class="flex items-center justify-between rounded-lg border bg-[hsl(var(--card))] p-3">
              <div class="text-sm">
                <span class="font-mono text-xs">{{ session.tokenJti }}</span>
                <span class="ml-2 text-[hsl(var(--muted-foreground))]">{{ session.lastActivityAt | date:'MM/dd HH:mm' }}</span>
              </div>
              <button (click)="revokeSession(session.id)"
                class="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Revoke</button>
            </div>
          }
        </div>
      }

      <!-- Whitelist Tab -->
      @if (activeTab() === 'Whitelist') {
        <div class="space-y-4">
          <div class="flex gap-2 rounded-lg border bg-[hsl(var(--card))] p-4">
            <input [(ngModel)]="newWhitelistRuleKey" placeholder="Rule key (e.g. daily_upload_limit)"
              class="flex-1 rounded border px-3 py-1.5 text-sm" />
            <input [(ngModel)]="newWhitelistUserId" placeholder="User ID (UUID)"
              class="flex-1 rounded border px-3 py-1.5 text-sm font-mono" />
            <button (click)="grantWhitelist()"
              class="rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))]">Grant Bypass</button>
          </div>
          <div class="space-y-2">
            @for (entry of whitelistEntries(); track entry.id) {
              <div class="flex items-center justify-between rounded-lg border bg-[hsl(var(--card))] p-3">
                <div class="text-sm">
                  <span class="font-medium">{{ entry.ruleKey }}</span>
                  <span class="ml-2 font-mono text-xs text-[hsl(var(--muted-foreground))]">{{ entry.userId }}</span>
                  <span class="ml-2 text-xs text-[hsl(var(--muted-foreground))]">{{ entry.createdAt | date:'MM/dd/yyyy' }}</span>
                </div>
                <button (click)="revokeWhitelist(entry.id)"
                  class="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Revoke</button>
              </div>
            }
            @if (whitelistEntries().length === 0) {
              <p class="text-sm text-[hsl(var(--muted-foreground))]">No whitelist entries</p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminComponent implements OnInit {
  private http = inject(HttpClient);
  private notifications = inject(NotificationService);

  tabs = ['Roles', 'Rules', 'Audit', 'Config', 'Sessions', 'Whitelist'];
  activeTab = signal('Roles');

  roles = signal<any[]>([]);
  rules = signal<any[]>([]);
  auditLogs = signal<any[]>([]);
  configEntries = signal<any[]>([]);
  sessions = signal<any[]>([]);
  whitelistEntries = signal<any[]>([]);
  newWhitelistRuleKey = '';
  newWhitelistUserId = '';
  editingRole = signal<string | null>(null);
  editingPermissions = signal<string[]>([]);
  allPermissions = signal<string[]>([]);

  ngOnInit(): void { this.loadAll(); }

  async loadAll(): Promise<void> {
    const [rolesRes, rulesRes, auditRes, configRes, sessRes, wlRes] = await Promise.allSettled([
      firstValueFrom(this.http.get<any>('/api/v1/admin/roles')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/rules')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/audit?limit=50')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/config')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/sessions')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/whitelist')),
    ]);

    if (rolesRes.status === 'fulfilled') this.roles.set(rolesRes.value.data);
    if (rulesRes.status === 'fulfilled') this.rules.set(rulesRes.value.data);
    if (auditRes.status === 'fulfilled') this.auditLogs.set(auditRes.value.data);
    if (configRes.status === 'fulfilled') this.configEntries.set(configRes.value.data);
    if (sessRes.status === 'fulfilled') this.sessions.set(sessRes.value.data);
    if (wlRes.status === 'fulfilled') this.whitelistEntries.set(wlRes.value.data);
  }

  async revokeSession(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/admin/sessions/${id}`));
      this.sessions.update(list => list.filter(s => s.id !== id));
      this.notifications.success('Session revoked');
    } catch { this.notifications.error('Failed to revoke session'); }
  }

  editRole(role: any): void {
    this.editingRole.set(role.role);
    this.editingPermissions.set([...role.permissions]);
    // Collect all known permissions from all roles
    const allPerms = new Set<string>();
    for (const r of this.roles()) {
      for (const p of r.permissions) allPerms.add(p);
    }
    this.allPermissions.set([...allPerms].sort());
  }

  togglePermission(perm: string): void {
    this.editingPermissions.update(list =>
      list.includes(perm) ? list.filter(p => p !== perm) : [...list, perm],
    );
  }

  async saveRolePermissions(): Promise<void> {
    const role = this.editingRole();
    if (!role) return;
    try {
      await firstValueFrom(this.http.put(`/api/v1/admin/roles/${role}/permissions`, {
        permissions: this.editingPermissions(),
      }));
      this.editingRole.set(null);
      this.loadAll();
      this.notifications.success('Role permissions updated');
    } catch { this.notifications.error('Failed to update role permissions'); }
  }

  async grantWhitelist(): Promise<void> {
    if (!this.newWhitelistRuleKey.trim() || !this.newWhitelistUserId.trim()) return;
    try {
      const res = await firstValueFrom(this.http.post<any>('/api/v1/admin/whitelist', {
        ruleKey: this.newWhitelistRuleKey.trim(),
        userId: this.newWhitelistUserId.trim(),
      }));
      this.whitelistEntries.update(list => [res, ...list]);
      this.newWhitelistRuleKey = '';
      this.newWhitelistUserId = '';
      this.notifications.success('Whitelist bypass granted');
    } catch (err: any) {
      this.notifications.error(err?.error?.message || 'Failed to grant whitelist');
    }
  }

  async revokeWhitelist(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/admin/whitelist/${id}`));
      this.whitelistEntries.update(list => list.filter(e => e.id !== id));
      this.notifications.success('Whitelist entry revoked');
    } catch { this.notifications.error('Failed to revoke whitelist entry'); }
  }

  async revealConfig(key: string): Promise<void> {
    const password = prompt('Enter your password to reveal this value:');
    if (!password) return;
    try {
      const res = await firstValueFrom(this.http.post<any>(`/api/v1/admin/config/${key}/reveal`, { password }));
      this.configEntries.update(list => list.map(e => e.key === key ? { ...e, displayValue: res.value } : e));
      this.notifications.success('Value revealed (will re-mask on reload)');
    } catch (err: any) {
      this.notifications.error(err?.error?.message || 'Reveal failed — check your password');
    }
  }
}
