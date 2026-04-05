import { Component, inject, signal, input, output, EventEmitter, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';
import { HlmButtonDirective } from '../../ui/hlm-button.directive';
import { HlmInputDirective } from '../../ui/hlm-input.directive';
import { HlmLabelDirective } from '../../ui/hlm-label.directive';

@Component({
  selector: 'app-offering-form',
  standalone: true,
  imports: [FormsModule, HlmButtonDirective, HlmInputDirective, HlmLabelDirective],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" (click)="close.emit()">
      <div class="w-full max-w-lg rounded-lg border bg-[hsl(var(--background))] p-6 shadow-lg" (click)="$event.stopPropagation()">
        <h3 class="mb-4 text-lg font-semibold">{{ editId() ? 'Edit Offering' : 'New Offering' }}</h3>

        @if (errorMsg()) {
          <div class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{{ errorMsg() }}</div>
        }

        <form (ngSubmit)="onSubmit()" class="space-y-4">
          <div>
            <label hlmLabel>Title</label>
            <input hlmInput [(ngModel)]="title" name="title" required placeholder="e.g. Wedding Essentials" />
          </div>
          <div>
            <label hlmLabel>Description</label>
            <textarea [(ngModel)]="description" name="description" rows="3"
              class="w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm"></textarea>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label hlmLabel>Price (USD)</label>
              <input hlmInput type="number" [(ngModel)]="priceUsd" name="priceUsd" step="0.01" min="0" required placeholder="2500.00" />
            </div>
            <div>
              <label hlmLabel>Duration (minutes)</label>
              <input hlmInput type="number" [(ngModel)]="durationMinutes" name="durationMinutes" min="1" required placeholder="360" />
            </div>
          </div>
          <div>
            <label hlmLabel>Tags (comma-separated)</label>
            <input hlmInput [(ngModel)]="tagsInput" name="tags" placeholder="e.g. Wedding, Outdoor, Premium" />
          </div>
          <div>
            <label hlmLabel>Visibility</label>
            <select [(ngModel)]="visibility" name="visibility"
              class="w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm">
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="restricted">Restricted to specific clients</option>
            </select>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button hlmBtn variant="outline" type="button" (click)="close.emit()">Cancel</button>
            <button hlmBtn type="submit" [disabled]="submitting()">
              {{ submitting() ? 'Saving...' : (editId() ? 'Update' : 'Create') }}
            </button>
          </div>
        </form>

        <!-- Add-ons section (shown after creation or when editing) -->
        @if (editId()) {
          <!-- Add-ons -->
          <div class="mt-6 border-t pt-4">
            <h4 class="mb-2 text-sm font-medium">Add-ons</h4>
            @for (addon of addons(); track addon.id) {
              <div class="mb-2 flex items-center justify-between rounded border px-3 py-2 text-sm">
                <div>{{ addon.name }} — {{ (addon.priceCents / 100).toFixed(2) }} {{ addon.unitDescription }}</div>
                <button (click)="deleteAddon(addon.id)" class="text-xs text-red-600 hover:underline">Remove</button>
              </div>
            }
            <div class="mt-2 flex gap-2">
              <input [(ngModel)]="newAddonName" placeholder="Name" class="flex-1 rounded border px-2 py-1 text-sm" />
              <input [(ngModel)]="newAddonPrice" type="number" placeholder="Price" step="0.01" class="w-20 rounded border px-2 py-1 text-sm" />
              <input [(ngModel)]="newAddonUnit" placeholder="per hour" class="w-24 rounded border px-2 py-1 text-sm" />
              <button (click)="addAddon()" class="rounded bg-[hsl(var(--accent))] px-2 py-1 text-xs">Add</button>
            </div>
          </div>

          <!-- Status Actions -->
          <div class="mt-4 border-t pt-4">
            <h4 class="mb-2 text-sm font-medium">Status: {{ currentStatus() }}</h4>
            <div class="flex gap-2">
              @if (currentStatus() === 'draft') {
                <button (click)="changeStatus('active')" class="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">Publish</button>
                <button (click)="changeStatus('archived')" class="rounded bg-gray-500 px-3 py-1 text-xs text-white hover:bg-gray-600">Archive</button>
              }
              @if (currentStatus() === 'active') {
                <button (click)="changeStatus('archived')" class="rounded bg-gray-500 px-3 py-1 text-xs text-white hover:bg-gray-600">Archive</button>
              }
            </div>
          </div>

          <!-- Restricted Client Access (only when visibility = restricted) -->
          @if (visibility === 'restricted') {
            <div class="mt-4 border-t pt-4">
              <h4 class="mb-2 text-sm font-medium">Client Access</h4>
              @for (userId of accessUserIds(); track userId) {
                <div class="mb-1 flex items-center justify-between rounded border px-3 py-1.5 text-xs">
                  <span class="font-mono">{{ userId }}</span>
                  <button (click)="revokeAccess(userId)" class="text-red-600 hover:underline">Revoke</button>
                </div>
              }
              <div class="mt-2 flex gap-2">
                <input [(ngModel)]="newAccessUserId" placeholder="Client User ID" class="flex-1 rounded border px-2 py-1 text-xs font-mono" />
                <button (click)="grantAccess()" class="rounded bg-[hsl(var(--accent))] px-2 py-1 text-xs">Grant Access</button>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class OfferingFormComponent implements OnInit {
  private http = inject(HttpClient);
  private notifications = inject(NotificationService);

  orgId = input.required<string>();
  editId = input<string | null>(null);
  close = output();
  saved = output();

  title = '';
  description = '';
  priceUsd = 0;
  durationMinutes = 0;
  tagsInput = '';
  visibility = 'public';
  submitting = signal(false);
  errorMsg = signal('');
  addons = signal<any[]>([]);
  currentStatus = signal('draft');
  accessUserIds = signal<string[]>([]);
  newAddonName = '';
  newAddonPrice = 0;
  newAddonUnit = '';
  newAccessUserId = '';

  ngOnInit(): void {
    if (this.editId()) this.loadOffering();
  }

  async loadOffering(): Promise<void> {
    const res = await firstValueFrom(this.http.get<any>(`/api/v1/offerings/${this.editId()}`));
    this.title = res.title;
    this.description = res.description || '';
    this.priceUsd = res.basePriceCents / 100;
    this.durationMinutes = res.durationMinutes;
    this.tagsInput = (res.tags || []).join(', ');
    this.visibility = res.visibility;
    this.addons.set(res.addons || []);
    this.currentStatus.set(res.status || 'draft');
    if (res.access) {
      this.accessUserIds.set(res.access.map((a: any) => a.userId));
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMsg.set('');
    this.submitting.set(true);
    try {
      const tags = this.tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const payload = {
        title: this.title, description: this.description,
        basePriceCents: Math.round(this.priceUsd * 100),
        durationMinutes: this.durationMinutes, tags, visibility: this.visibility,
        orgId: this.orgId(),
      };

      if (this.editId()) {
        await firstValueFrom(this.http.put(`/api/v1/offerings/${this.editId()}`, payload));
        this.notifications.success('Offering updated');
      } else {
        const res = await firstValueFrom(this.http.post<any>('/api/v1/offerings', payload));
        this.notifications.success('Offering created');
      }
      this.saved.emit();
      this.close.emit();
    } catch (err) {
      this.errorMsg.set(err instanceof HttpErrorResponse ? (err.error?.message || 'Save failed') : 'Save failed');
    } finally {
      this.submitting.set(false);
    }
  }

  async addAddon(): Promise<void> {
    if (!this.editId() || !this.newAddonName) return;
    try {
      await firstValueFrom(this.http.post(`/api/v1/offerings/${this.editId()}/addons`, {
        name: this.newAddonName, priceCents: Math.round(this.newAddonPrice * 100), unitDescription: this.newAddonUnit || 'each',
      }));
      this.newAddonName = ''; this.newAddonPrice = 0; this.newAddonUnit = '';
      this.loadOffering();
    } catch { this.notifications.error('Failed to add add-on'); }
  }

  async deleteAddon(addonId: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/offerings/${this.editId()}/addons/${addonId}`));
      this.addons.update(list => list.filter(a => a.id !== addonId));
    } catch { this.notifications.error('Failed to remove add-on'); }
  }

  async changeStatus(status: string): Promise<void> {
    try {
      await firstValueFrom(this.http.patch(`/api/v1/offerings/${this.editId()}/status`, { status }));
      this.currentStatus.set(status);
      this.notifications.success(`Offering ${status === 'active' ? 'published' : 'archived'}`);
      this.saved.emit();
    } catch (err) {
      this.notifications.error(err instanceof HttpErrorResponse ? (err.error?.message || 'Status change failed') : 'Status change failed');
    }
  }

  async grantAccess(): Promise<void> {
    if (!this.newAccessUserId.trim()) return;
    try {
      await firstValueFrom(this.http.post(`/api/v1/offerings/${this.editId()}/access`, {
        userIds: [this.newAccessUserId.trim()],
      }));
      this.accessUserIds.update(list => [...list, this.newAccessUserId.trim()]);
      this.newAccessUserId = '';
      this.notifications.success('Access granted');
    } catch { this.notifications.error('Failed to grant access'); }
  }

  async revokeAccess(userId: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/offerings/${this.editId()}/access/${userId}`));
      this.accessUserIds.update(list => list.filter(id => id !== userId));
      this.notifications.success('Access revoked');
    } catch { this.notifications.error('Failed to revoke access'); }
  }
}
