import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold tracking-tight">Events</h2>
        @if (canManage()) {
          <button (click)="showCreateForm.set(true)" class="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90">+ New Event</button>
        }
      </div>

      <!-- Create/Edit Form -->
      @if (showCreateForm() || editingEvent()) {
        <div class="rounded-lg border bg-[hsl(var(--card))] p-4 space-y-3">
          <h3 class="text-sm font-semibold">{{ editingEvent() ? 'Edit Event' : 'New Event' }}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label class="text-xs font-medium">Title</label><input [(ngModel)]="formTitle" class="w-full rounded border px-3 py-1.5 text-sm" /></div>
            <div><label class="text-xs font-medium">Event Type</label><input [(ngModel)]="formEventType" placeholder="wedding, corporate, portrait..." class="w-full rounded border px-3 py-1.5 text-sm" /></div>
            <div><label class="text-xs font-medium">Scheduled At</label><input [(ngModel)]="formScheduledAt" type="datetime-local" class="w-full rounded border px-3 py-1.5 text-sm" /></div>
            <div><label class="text-xs font-medium">Duration (min)</label><input [(ngModel)]="formDuration" type="number" min="1" class="w-full rounded border px-3 py-1.5 text-sm" /></div>
            <div><label class="text-xs font-medium">Channel</label><input [(ngModel)]="formChannel" placeholder="website, referral, walk-in..." class="w-full rounded border px-3 py-1.5 text-sm" /></div>
            <div><label class="text-xs font-medium">Tags (comma-separated)</label><input [(ngModel)]="formTags" class="w-full rounded border px-3 py-1.5 text-sm" /></div>
          </div>
          <div><label class="text-xs font-medium">Description</label><textarea [(ngModel)]="formDescription" rows="2" class="w-full rounded border px-3 py-1.5 text-sm"></textarea></div>
          <div class="flex gap-2">
            <button (click)="submitEvent()" [disabled]="submitting()" class="rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))]">{{ submitting() ? 'Saving...' : (editingEvent() ? 'Update' : 'Create') }}</button>
            <button (click)="cancelForm()" class="rounded border px-3 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="space-y-4">
          @for (i of [1,2,3]; track i) {
            <div class="h-20 animate-pulse rounded-lg border bg-[hsl(var(--card))]"></div>
          }
        </div>
      } @else {
        <div class="space-y-3">
          @for (event of events(); track event.id) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
              <div class="flex items-start justify-between">
                <div>
                  <h3 class="font-medium">{{ event.title }}</h3>
                  <div class="mt-1 flex flex-wrap gap-4 text-sm text-[hsl(var(--muted-foreground))]">
                    <span class="capitalize">{{ event.eventType }}</span>
                    <span>{{ event.scheduledAt | date:'MM/dd/yyyy h:mm a' }}</span>
                    <span>{{ event.durationMinutes }} min</span>
                    <span class="capitalize">{{ event.channel }}</span>
                  </div>
                  @if (event.tags?.length) {
                    <div class="mt-2 flex flex-wrap gap-1">
                      @for (tag of event.tags; track tag) {
                        <span class="rounded-full bg-[hsl(var(--accent))] px-2 py-0.5 text-xs">{{ tag }}</span>
                      }
                    </div>
                  }
                </div>
                <div class="flex items-center gap-2">
                  @if (isClient() && !isTerminal(event.status)) {
                    <button (click)="register(event.id)" [disabled]="registering()"
                      class="rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50">Register</button>
                  }
                  @if (canManage() && !isTerminal(event.status)) {
                    <button (click)="editEvent(event)" class="rounded border px-2 py-1 text-xs hover:bg-[hsl(var(--accent))]">Edit</button>
                    @if (event.status === 'scheduled') {
                      <button (click)="changeStatus(event.id, 'confirmed')" class="rounded bg-green-100 px-2 py-1 text-xs text-green-800 hover:bg-green-200">Confirm</button>
                    }
                    @if (event.status === 'confirmed') {
                      <button (click)="changeStatus(event.id, 'completed')" class="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800 hover:bg-blue-200">Complete</button>
                    }
                  }
                  @if (canManage()) {
                    <button (click)="toggleRegistrations(event.id)" class="rounded border px-2 py-1 text-xs hover:bg-[hsl(var(--accent))]">
                      {{ expandedEvent() === event.id ? 'Hide' : 'Registrations' }}
                    </button>
                  }
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" [class]="statusClass(event.status)">{{ event.status }}</span>
                </div>
              </div>

              @if (registrationMessage()[event.id]) {
                <div class="mt-2 rounded border px-3 py-2 text-xs"
                  [class]="registrationMessage()[event.id].type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'">
                  {{ registrationMessage()[event.id].text }}
                </div>
              }

              @if (expandedEvent() === event.id) {
                <div class="mt-3 border-t pt-3">
                  <div class="mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">Registrations</div>
                  @for (reg of registrations(); track reg.id) {
                    <div class="mb-1 flex items-center justify-between rounded border px-3 py-1.5 text-xs">
                      <div>
                        <span class="font-mono">{{ reg.clientId.substring(0, 8) }}...</span>
                        <span class="ml-2 capitalize">{{ reg.status }}</span>
                      </div>
                      <div class="flex gap-1">
                        @if (reg.status === 'registered') {
                          <button (click)="updateRegStatus(reg.id, 'confirmed')" class="rounded bg-green-100 px-2 py-0.5 text-green-800">Confirm</button>
                          <button (click)="updateRegStatus(reg.id, 'cancelled')" class="rounded bg-red-100 px-2 py-0.5 text-red-800">Cancel</button>
                        }
                        @if (reg.status === 'confirmed') {
                          <button (click)="updateRegStatus(reg.id, 'attended')" class="rounded bg-blue-100 px-2 py-0.5 text-blue-800">Attended</button>
                          <button (click)="updateRegStatus(reg.id, 'no_show')" class="rounded bg-yellow-100 px-2 py-0.5 text-yellow-800">No-show</button>
                        }
                      </div>
                    </div>
                  }
                  @if (registrations().length === 0) {
                    <div class="text-xs text-[hsl(var(--muted-foreground))]">No registrations yet</div>
                  }
                </div>
              }
            </div>
          }
          @if (events().length === 0) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-8 text-center text-[hsl(var(--muted-foreground))]">No events found</div>
          }
        </div>
      }
    </div>
  `,
})
export class EventsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private notifications = inject(NotificationService);

  events = signal<any[]>([]);
  loading = signal(true);
  registering = signal(false);
  submitting = signal(false);
  registrationMessage = signal<Record<string, { type: string; text: string }>>({});
  expandedEvent = signal<string | null>(null);
  registrations = signal<any[]>([]);
  showCreateForm = signal(false);
  editingEvent = signal<string | null>(null);

  formTitle = '';
  formEventType = '';
  formScheduledAt = '';
  formDuration = 60;
  formChannel = 'website';
  formTags = '';
  formDescription = '';
  private orgId = '';

  isClient = () => this.auth.role() === 'client';
  canManage = () => ['merchant', 'operations', 'administrator'].includes(this.auth.role());
  isTerminal = (status: string) => status === 'completed' || status === 'cancelled';

  ngOnInit(): void {
    this.load();
    this.loadOrgId();
  }

  private async loadOrgId(): Promise<void> {
    try {
      const session = await firstValueFrom(this.http.get<any>('/api/v1/auth/session'));
      this.orgId = session.orgId || '';
    } catch { /* fallback */ }
  }

  async load(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<any>('/api/v1/events'));
      this.events.set(res.data);
    } finally { this.loading.set(false); }
  }

  editEvent(event: any): void {
    this.editingEvent.set(event.id);
    this.formTitle = event.title;
    this.formEventType = event.eventType;
    this.formScheduledAt = event.scheduledAt ? new Date(event.scheduledAt).toISOString().slice(0, 16) : '';
    this.formDuration = event.durationMinutes;
    this.formChannel = event.channel;
    this.formTags = (event.tags || []).join(', ');
    this.formDescription = event.description || '';
    this.showCreateForm.set(false);
  }

  cancelForm(): void {
    this.showCreateForm.set(false);
    this.editingEvent.set(null);
    this.formTitle = ''; this.formEventType = ''; this.formScheduledAt = '';
    this.formDuration = 60; this.formChannel = 'website'; this.formTags = ''; this.formDescription = '';
  }

  async submitEvent(): Promise<void> {
    this.submitting.set(true);
    const tags = this.formTags.split(',').map(t => t.trim()).filter(Boolean);
    try {
      if (this.editingEvent()) {
        await firstValueFrom(this.http.put(`/api/v1/events/${this.editingEvent()}`, {
          title: this.formTitle, description: this.formDescription,
          scheduledAt: new Date(this.formScheduledAt).toISOString(),
          durationMinutes: this.formDuration, channel: this.formChannel, tags,
        }));
        this.notifications.success('Event updated');
      } else {
        await firstValueFrom(this.http.post('/api/v1/events', {
          title: this.formTitle, eventType: this.formEventType, description: this.formDescription,
          scheduledAt: new Date(this.formScheduledAt).toISOString(),
          durationMinutes: this.formDuration, channel: this.formChannel, tags, orgId: this.orgId,
        }));
        this.notifications.success('Event created');
      }
      this.cancelForm();
      this.load();
    } catch (err) {
      this.notifications.error(err instanceof HttpErrorResponse ? (err.error?.message || 'Save failed') : 'Save failed');
    } finally { this.submitting.set(false); }
  }

  async changeStatus(eventId: string, status: string): Promise<void> {
    try {
      await firstValueFrom(this.http.patch(`/api/v1/events/${eventId}/status`, { status }));
      this.events.update(list => list.map(e => e.id === eventId ? { ...e, status } : e));
      this.notifications.success(`Event ${status}`);
    } catch (err) {
      this.notifications.error(err instanceof HttpErrorResponse ? (err.error?.message || 'Failed') : 'Failed');
    }
  }

  async register(eventId: string): Promise<void> {
    this.registering.set(true);
    try {
      const res = await firstValueFrom(this.http.post<any>(`/api/v1/events/${eventId}/registrations`, {}));
      this.registrationMessage.update(m => ({ ...m, [eventId]: { type: 'success', text: `Registered successfully (status: ${res.status})` } }));
    } catch (err) {
      const msg = err instanceof HttpErrorResponse ? (err.error?.message || 'Registration failed') : 'Registration failed';
      this.registrationMessage.update(m => ({ ...m, [eventId]: { type: 'error', text: msg } }));
    } finally { this.registering.set(false); }
  }

  statusClass(s: string): string {
    switch (s) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-gray-100 text-gray-600';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  async toggleRegistrations(eventId: string): Promise<void> {
    if (this.expandedEvent() === eventId) { this.expandedEvent.set(null); this.registrations.set([]); return; }
    this.expandedEvent.set(eventId);
    try {
      const res = await firstValueFrom(this.http.get<any>(`/api/v1/events/${eventId}/registrations`));
      this.registrations.set(res.data);
    } catch { this.registrations.set([]); }
  }

  async updateRegStatus(regId: string, status: string): Promise<void> {
    try {
      await firstValueFrom(this.http.patch(`/api/v1/events/registrations/${regId}/status`, { status }));
      this.registrations.update(list => list.map(r => r.id === regId ? { ...r, status } : r));
      this.notifications.success(`Registration ${status}`);
    } catch (err) {
      this.notifications.error(err instanceof HttpErrorResponse ? (err.error?.message || 'Failed') : 'Failed');
    }
  }
}
