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
          <button (click)="showRuleForm.set(true)" class="rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))]">+ New Rule</button>

          @if (showRuleForm() || editingRuleId()) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-4 space-y-2">
              <h4 class="text-sm font-semibold">{{ editingRuleId() ? 'Edit Rule' : 'Create Rule' }}</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label class="text-xs">Rule Key</label><input [(ngModel)]="ruleFormKey" [disabled]="!!editingRuleId()" class="w-full rounded border px-2 py-1 text-sm" /></div>
                <div><label class="text-xs">Limit</label><input [(ngModel)]="ruleFormLimit" type="number" class="w-full rounded border px-2 py-1 text-sm" /></div>
                <div><label class="text-xs">Window</label>
                  <select [(ngModel)]="ruleFormWindow" class="w-full rounded border px-2 py-1 text-sm">
                    <option value="minute">minute</option><option value="hour">hour</option><option value="day">day</option>
                  </select>
                </div>
                <div><label class="text-xs">Cooldown (sec)</label><input [(ngModel)]="ruleFormCooldown" type="number" class="w-full rounded border px-2 py-1 text-sm" /></div>
                <div><label class="text-xs">Effective From</label><input [(ngModel)]="ruleFormFrom" type="datetime-local" class="w-full rounded border px-2 py-1 text-sm" /></div>
                <div><label class="text-xs">Effective To (optional)</label><input [(ngModel)]="ruleFormTo" type="datetime-local" class="w-full rounded border px-2 py-1 text-sm" /></div>
                <div><label class="text-xs">Canary %</label><input [(ngModel)]="ruleFormCanary" type="number" min="0" max="100" class="w-full rounded border px-2 py-1 text-sm" /></div>
              </div>
              <div class="flex gap-2">
                <button (click)="submitRule()" class="rounded bg-[hsl(var(--primary))] px-3 py-1 text-sm text-[hsl(var(--primary-foreground))]">{{ editingRuleId() ? 'Update' : 'Create' }}</button>
                <button (click)="cancelRuleForm()" class="rounded border px-3 py-1 text-sm">Cancel</button>
              </div>
            </div>
          }

          @for (rule of rules(); track rule.id) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium">{{ rule.ruleKey }}</span>
                  <span class="ml-2 text-xs text-[hsl(var(--muted-foreground))]">v{{ rule.version }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <button (click)="editRule(rule)" class="rounded border px-2 py-0.5 text-xs hover:bg-[hsl(var(--accent))]">Edit</button>
                  <button (click)="deleteRule(rule.id)" class="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">Delete</button>
                  <span class="rounded-full px-2 py-0.5 text-xs"
                    [class]="rule.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'">
                    {{ rule.status }}
                  </span>
                </div>
              </div>
              <div class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                Limit: {{ rule.config?.limit }} / {{ rule.config?.window }}
                @if (rule.config?.cooldownSeconds) { · Cooldown: {{ rule.config.cooldownSeconds }}s }
                · Canary: {{ rule.canaryPercent }}%
                @if (rule.effectiveFrom) { · From: {{ rule.effectiveFrom | date:'MM/dd/yyyy' }} }
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

      <!-- Org Members Tab -->
      @if (activeTab() === 'Org Members') {
        <div class="space-y-4">
          <div class="flex gap-2 rounded-lg border bg-[hsl(var(--card))] p-4">
            <input [(ngModel)]="newMemberOrgId" placeholder="Organization ID (UUID)" class="flex-1 rounded border px-3 py-1.5 text-sm font-mono" />
            <input [(ngModel)]="newMemberUserId" placeholder="User ID (UUID)" class="flex-1 rounded border px-3 py-1.5 text-sm font-mono" />
            <button (click)="addOrgMember()" class="rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))]">Add Member</button>
          </div>
          <div class="space-y-2">
            @for (member of orgMembers(); track member.id) {
              <div class="flex items-center justify-between rounded-lg border bg-[hsl(var(--card))] p-3">
                <div class="text-sm">
                  <span class="font-mono text-xs">Org: {{ member.orgId?.substring(0, 8) }}...</span>
                  <span class="ml-2 font-mono text-xs">User: {{ member.userId?.substring(0, 8) }}...</span>
                  <span class="ml-2 text-xs text-[hsl(var(--muted-foreground))]">{{ member.roleInOrg }}</span>
                </div>
                <button (click)="removeOrgMember(member.orgId, member.userId)" class="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Remove</button>
              </div>
            }
            @if (orgMembers().length === 0) {
              <p class="text-sm text-[hsl(var(--muted-foreground))]">No org members</p>
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

  tabs = ['Roles', 'Rules', 'Audit', 'Config', 'Sessions', 'Whitelist', 'Org Members'];
  activeTab = signal('Roles');

  roles = signal<any[]>([]);
  rules = signal<any[]>([]);
  auditLogs = signal<any[]>([]);
  configEntries = signal<any[]>([]);
  sessions = signal<any[]>([]);
  whitelistEntries = signal<any[]>([]);
  newWhitelistRuleKey = '';
  newWhitelistUserId = '';
  orgMembers = signal<any[]>([]);
  newMemberOrgId = '';
  newMemberUserId = '';
  showRuleForm = signal(false);
  editingRuleId = signal<string | null>(null);
  ruleFormKey = ''; ruleFormLimit = 20; ruleFormWindow = 'day';
  ruleFormCooldown = 0; ruleFormFrom = ''; ruleFormTo = ''; ruleFormCanary = 100;
  editingRole = signal<string | null>(null);
  editingPermissions = signal<string[]>([]);
  allPermissions = signal<string[]>([]);

  ngOnInit(): void { this.loadAll(); }

  async loadAll(): Promise<void> {
    const results = await Promise.allSettled([
      firstValueFrom(this.http.get<any>('/api/v1/admin/roles')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/rules')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/audit?limit=50')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/config')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/sessions')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/whitelist')),
      firstValueFrom(this.http.get<any>('/api/v1/admin/org-members')),
    ]);

    const [rolesRes, rulesRes, auditRes, configRes, sessRes, wlRes] = results;
    if (rolesRes.status === 'fulfilled') {
      this.roles.set(rolesRes.value.data);
      if (rolesRes.value.allPermissions) {
        this.allPermissions.set(rolesRes.value.allPermissions.sort());
      }
    }
    if (rulesRes.status === 'fulfilled') this.rules.set(rulesRes.value.data);
    if (auditRes.status === 'fulfilled') this.auditLogs.set(auditRes.value.data);
    if (configRes.status === 'fulfilled') this.configEntries.set(configRes.value.data);
    if (sessRes.status === 'fulfilled') this.sessions.set(sessRes.value.data);
    if (wlRes.status === 'fulfilled') this.whitelistEntries.set(wlRes.value.data);
    const omRes = results[6];
    if (omRes && omRes.status === 'fulfilled') this.orgMembers.set((omRes as any).value.data);
  }

  async revokeSession(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/admin/sessions/${id}`));
      this.sessions.update(list => list.filter(s => s.id !== id));
      this.notifications.success('Session revoked');
    } catch { this.notifications.error('Failed to revoke session'); }
  }

  editRule(rule: any): void {
    this.editingRuleId.set(rule.id);
    this.ruleFormKey = rule.ruleKey;
    this.ruleFormLimit = rule.config?.limit || 20;
    this.ruleFormWindow = rule.config?.window || 'day';
    this.ruleFormCooldown = rule.config?.cooldownSeconds || 0;
    this.ruleFormFrom = rule.effectiveFrom ? new Date(rule.effectiveFrom).toISOString().slice(0, 16) : '';
    this.ruleFormTo = rule.effectiveTo ? new Date(rule.effectiveTo).toISOString().slice(0, 16) : '';
    this.ruleFormCanary = rule.canaryPercent ?? 100;
    this.showRuleForm.set(false);
  }

  cancelRuleForm(): void {
    this.showRuleForm.set(false); this.editingRuleId.set(null);
    this.ruleFormKey = ''; this.ruleFormLimit = 20; this.ruleFormWindow = 'day';
    this.ruleFormCooldown = 0; this.ruleFormFrom = ''; this.ruleFormTo = ''; this.ruleFormCanary = 100;
  }

  async submitRule(): Promise<void> {
    const config = { limit: this.ruleFormLimit, window: this.ruleFormWindow, ...(this.ruleFormCooldown > 0 ? { cooldownSeconds: this.ruleFormCooldown } : {}) };
    try {
      if (this.editingRuleId()) {
        await firstValueFrom(this.http.put(`/api/v1/admin/rules/${this.editingRuleId()}`, {
          config, canaryPercent: this.ruleFormCanary,
          ...(this.ruleFormFrom ? { effectiveFrom: new Date(this.ruleFormFrom).toISOString() } : {}),
          ...(this.ruleFormTo ? { effectiveTo: new Date(this.ruleFormTo).toISOString() } : {}),
        }));
        this.notifications.success('Rule updated');
      } else {
        await firstValueFrom(this.http.post('/api/v1/admin/rules', {
          ruleKey: this.ruleFormKey, config, canaryPercent: this.ruleFormCanary,
          effectiveFrom: this.ruleFormFrom ? new Date(this.ruleFormFrom).toISOString() : new Date().toISOString(),
          ...(this.ruleFormTo ? { effectiveTo: new Date(this.ruleFormTo).toISOString() } : {}),
        }));
        this.notifications.success('Rule created');
      }
      this.cancelRuleForm(); this.loadAll();
    } catch (err: any) { this.notifications.error(err?.error?.message || 'Failed'); }
  }

  async deleteRule(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/admin/rules/${id}`));
      this.rules.update(list => list.filter(r => r.id !== id));
      this.notifications.success('Rule deleted');
    } catch { this.notifications.error('Failed to delete rule'); }
  }

  editRole(role: any): void {
    this.editingRole.set(role.role);
    this.editingPermissions.set([...role.permissions]);
    // allPermissions is loaded from backend API on init — includes full catalog
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

  async addOrgMember(): Promise<void> {
    if (!this.newMemberOrgId.trim() || !this.newMemberUserId.trim()) return;
    try {
      const res = await firstValueFrom(this.http.post<any>('/api/v1/admin/org-members', {
        orgId: this.newMemberOrgId.trim(), userId: this.newMemberUserId.trim(),
      }));
      this.orgMembers.update(list => [res, ...list]);
      this.newMemberOrgId = ''; this.newMemberUserId = '';
      this.notifications.success('Member added');
    } catch (err: any) { this.notifications.error(err?.error?.message || 'Failed to add member'); }
  }

  async removeOrgMember(orgId: string, userId: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/admin/org-members/${orgId}/${userId}`));
      this.orgMembers.update(list => list.filter(m => !(m.orgId === orgId && m.userId === userId)));
      this.notifications.success('Member removed');
    } catch { this.notifications.error('Failed to remove member'); }
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
