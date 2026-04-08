import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { HlmButtonDirective } from '../../ui/hlm-button.directive';
import { HlmBadgeDirective } from '../../ui/hlm-badge.directive';
import { OfferingFormComponent } from './offering-form.component';
import { HlmCardDirective } from '../../ui/hlm-card.directive';
import { HlmSkeletonDirective } from '../../ui/hlm-skeleton.directive';

interface Offering {
  id: string;
  title: string;
  description: string | null;
  basePriceCents: number;
  durationMinutes: number;
  status: string;
  visibility: string;
  createdAt: string;
}

@Component({
  selector: 'app-offerings',
  standalone: true,
  imports: [DatePipe, HlmButtonDirective, HlmBadgeDirective, HlmCardDirective, HlmSkeletonDirective, OfferingFormComponent],
  template: `
    <div class="space-y-[var(--section-gap)]">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold tracking-tight text-[hsl(var(--heading-primary))]">Service Offerings</h2>
        @if (canCreate()) {
          <button hlmBtn (click)="openCreate()">+ New Offering</button>
        }
      </div>

      @if (loading()) {
        <div class="space-y-4">
          @for (i of [1,2,3]; track i) {
            <div hlmSkeleton class="h-24"></div>
          }
        </div>
      } @else if (offerings().length === 0) {
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center shadow-[var(--card-shadow)]">
          <p class="text-[hsl(var(--muted-foreground))]">No offerings found</p>
        </div>
      } @else {
        <div class="space-y-4">
          @for (offering of offerings(); track offering.id) {
            <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[var(--card-shadow)] transition-shadow hover:shadow-[var(--card-shadow-lg)]">
              <div class="flex items-start justify-between">
                <div>
                  <h3 class="text-lg font-medium text-[hsl(var(--heading-secondary))]">{{ offering.title }}</h3>
                  <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{{ offering.description }}</p>
                </div>
                <div class="flex items-center gap-2">
                  @if (canCreate() && offering.status !== 'archived') {
                    <button (click)="editOffering(offering.id)" class="rounded border px-2 py-1 text-xs hover:bg-[hsl(var(--accent))]">Edit</button>
                  }
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    [class]="statusClass(offering.status)">
                    {{ offering.status }}
                  </span>
                  <span class="rounded-full border px-2.5 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {{ offering.visibility }}
                  </span>
                </div>
              </div>
              <div class="mt-4 flex gap-6 text-sm text-[hsl(var(--muted-foreground))]">
                <span>{{ formatPrice(offering.basePriceCents) }}</span>
                <span>{{ formatDuration(offering.durationMinutes) }}</span>
                <span>{{ offering.createdAt | date:'MM/dd/yyyy' }}</span>
              </div>
            </div>
          }
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-between">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">
            {{ total() }} total offerings
          </span>
          <div class="flex gap-2">
            <button hlmBtn variant="outline" size="sm" (click)="prevPage()" [disabled]="page() <= 1">Previous</button>
            <span class="px-3 py-1.5 text-sm">Page {{ page() }}</span>
            <button hlmBtn variant="outline" size="sm" (click)="nextPage()" [disabled]="page() >= totalPages()">Next</button>
          </div>
        </div>
      }

      @if (showCreateDialog || editingId()) {
        <app-offering-form
          [orgId]="orgId()"
          [editId]="editingId()"
          (close)="closeForm()"
          (saved)="onSaved()" />
      }
    </div>
  `,
})
export class OfferingsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private notifications = inject(NotificationService);

  offerings = signal<Offering[]>([]);
  loading = signal(true);
  total = signal(0);
  page = signal(1);
  totalPages = signal(1);
  showCreateDialog = false;
  editingId = signal<string | null>(null);
  orgId = signal('');

  canCreate = () => ['merchant', 'administrator'].includes(this.auth.role());

  ngOnInit(): void {
    this.loadUserOrg();
    this.loadOfferings();
  }

  private async loadUserOrg(): Promise<void> {
    try {
      const session = await firstValueFrom(this.http.get<any>('/api/v1/auth/session'));
      if (session.orgId) {
        this.orgId.set(session.orgId);
      }
    } catch {
      // Fall back to deriving from offerings
    }
  }

  async loadOfferings(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<any>(`/api/v1/offerings?page=${this.page()}&limit=20`),
      );
      this.offerings.set(res.data);
      this.total.set(res.meta.total);
      this.totalPages.set(res.meta.totalPages);
      // If orgId not set from session, derive from first offering
      if (!this.orgId() && res.data.length > 0) {
        this.orgId.set((res.data[0] as any).orgId);
      }
    } catch {
      this.notifications.error('Failed to load offerings');
    } finally {
      this.loading.set(false);
    }
  }

  formatPrice(cents: number): string {
    return '$' + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  formatDuration(minutes: number): string {
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}hr ${m}min` : `${h}hr`;
    }
    return `${minutes}min`;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'archived': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  prevPage(): void {
    if (this.page() > 1) { this.page.update(p => p - 1); this.loadOfferings(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.loadOfferings(); }
  }

  openCreate(): void {
    if (!this.orgId()) {
      // Last resort: try from first existing offering
      const first = this.offerings()[0];
      if (first) this.orgId.set((first as any).orgId);
    }
    this.showCreateDialog = true;
  }

  editOffering(id: string): void {
    this.editingId.set(id);
    // Capture orgId from the offering being edited
    const offering = this.offerings().find(o => o.id === id);
    if (offering) this.orgId.set((offering as any).orgId);
  }

  closeForm(): void {
    this.showCreateDialog = false;
    this.editingId.set(null);
  }

  onSaved(): void {
    this.loadOfferings();
  }
}
