import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold tracking-tight">Operations Dashboard</h2>
        <div class="flex items-center gap-2">
          @if (hasFilePicker) {
            <button (click)="exportData('csv')" [disabled]="exporting()"
              class="rounded-md border px-3 py-1.5 text-sm hover:bg-[hsl(var(--accent))] disabled:opacity-50">
              Save CSV to folder
            </button>
            <button (click)="exportData('xlsx')" [disabled]="exporting()"
              class="rounded-md border px-3 py-1.5 text-sm hover:bg-[hsl(var(--accent))] disabled:opacity-50">
              Save Excel to folder
            </button>
          } @else {
            <span class="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-xs text-yellow-800">
              Export requires Chrome or Edge browser (File System Access API needed for local folder save)
            </span>
          }
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-4 rounded-lg border bg-[hsl(var(--card))] p-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">From (MM/DD/YYYY)</label>
          <input type="text" [(ngModel)]="dateFromDisplay" (change)="onDateFromChange()" placeholder="MM/DD/YYYY"
            class="rounded-md border px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">To (MM/DD/YYYY)</label>
          <input type="text" [(ngModel)]="dateToDisplay" (change)="onDateToChange()" placeholder="MM/DD/YYYY"
            class="rounded-md border px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">Organization</label>
          <input type="text" [(ngModel)]="orgId" (change)="loadDashboard()" placeholder="All organizations"
            class="rounded-md border px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">Event Type</label>
          <input type="text" [(ngModel)]="eventType" (change)="loadDashboard()" placeholder="All types"
            class="rounded-md border px-3 py-1.5 text-sm" />
        </div>
      </div>

      @if (loading()) {
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="h-48 animate-pulse rounded-lg border bg-[hsl(var(--card))]"></div>
          }
        </div>
      } @else if (payload()) {
        <!-- KPI Cards -->
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <div class="text-sm text-[hsl(var(--muted-foreground))]">Total Events</div>
            <div class="mt-1 text-2xl font-semibold">{{ totalEvents() }}</div>
          </div>
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <div class="text-sm text-[hsl(var(--muted-foreground))]">Conversion Rate</div>
            <div class="mt-1 text-2xl font-semibold">{{ conversionRate() }}%</div>
          </div>
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <div class="text-sm text-[hsl(var(--muted-foreground))]">Attendance Rate</div>
            <div class="mt-1 text-2xl font-semibold">{{ attendanceRate() }}%</div>
          </div>
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <div class="text-sm text-[hsl(var(--muted-foreground))]">Cancellation Rate</div>
            <div class="mt-1 text-2xl font-semibold">{{ cancellationRate() }}%</div>
          </div>
        </div>

        <!-- Charts Grid -->
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <!-- Popularity -->
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <h3 class="mb-3 text-sm font-medium">Event Popularity</h3>
            @for (item of payload()!.popularity.labels; track item; let i = $index) {
              <div class="mb-2 flex items-center justify-between text-sm">
                <span class="capitalize">{{ item }}</span>
                <div class="flex items-center gap-2">
                  <div class="h-2 rounded-full bg-[hsl(var(--primary))]"
                    [style.width.px]="barWidth(payload()!.popularity.data[i], maxPopularity())"></div>
                  <span class="text-[hsl(var(--muted-foreground))]">{{ payload()!.popularity.data[i] }}</span>
                </div>
              </div>
            }
          </div>

          <!-- Channel Distribution -->
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <h3 class="mb-3 text-sm font-medium">Channel Distribution</h3>
            @for (item of payload()!.channelDistribution.labels; track item; let i = $index) {
              <div class="mb-2 flex items-center justify-between text-sm">
                <span class="capitalize">{{ item }}</span>
                <span class="text-[hsl(var(--muted-foreground))]">{{ payload()!.channelDistribution.counts[i] }}</span>
              </div>
            }
          </div>

          <!-- Tag Distribution -->
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <h3 class="mb-3 text-sm font-medium">Tag Distribution</h3>
            @for (item of payload()!.tagDistribution.labels; track item; let i = $index) {
              <div class="mb-2 flex items-center justify-between text-sm">
                <span>{{ item }}</span>
                <span class="text-[hsl(var(--muted-foreground))]">{{ payload()!.tagDistribution.counts[i] }}</span>
              </div>
            }
            @if (payload()!.tagDistribution.labels.length === 0) {
              <p class="text-sm text-[hsl(var(--muted-foreground))]">No tag data</p>
            }
          </div>

          <!-- Conversion Funnel -->
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <h3 class="mb-3 text-sm font-medium">Registration Funnel</h3>
            @for (stage of payload()!.conversionFunnel.stages; track stage; let i = $index) {
              <div class="mb-2 flex items-center justify-between text-sm">
                <span class="capitalize">{{ stage }}</span>
                <span class="font-medium">{{ payload()!.conversionFunnel.counts[i] }}</span>
              </div>
            }
          </div>

          <!-- Attendance -->
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <h3 class="mb-3 text-sm font-medium">Attendance Breakdown</h3>
            @for (label of payload()!.attendanceRate.labels; track label; let i = $index) {
              <div class="mb-2 flex items-center justify-between text-sm">
                <span>{{ label }}</span>
                <span class="font-medium">{{ (payload()!.attendanceRate.rates[i] * 100).toFixed(1) }}%</span>
              </div>
            }
          </div>

          <!-- Cancellation -->
          <div class="rounded-lg border bg-[hsl(var(--card))] p-4">
            <h3 class="mb-3 text-sm font-medium">Cancellation Breakdown</h3>
            @for (label of payload()!.cancellationRate.labels; track label; let i = $index) {
              <div class="mb-2 flex items-center justify-between text-sm">
                <span>{{ label }}</span>
                <span class="font-medium">{{ (payload()!.cancellationRate.rates[i] * 100).toFixed(1) }}%</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private notifications = inject(NotificationService);

  payload = signal<any>(null);
  loading = signal(true);
  exporting = signal(false);
  hasFilePicker = 'showSaveFilePicker' in (typeof window !== 'undefined' ? window : {});
  dateFrom = '2026-01-01';
  dateTo = '2026-12-31';
  dateFromDisplay = '01/01/2026';
  dateToDisplay = '12/31/2026';
  eventType = '';

  orgId = '';
  totalEvents = signal(0);
  conversionRate = signal('0.0');
  attendanceRate = signal('0.0');
  cancellationRate = signal('0.0');
  maxPopularity = signal(1);

  ngOnInit(): void {
    this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    this.loading.set(true);
    try {
      let url = `/api/v1/analytics/dashboard?from=${this.dateFrom}&to=${this.dateTo}`;
      if (this.orgId) url += `&orgId=${this.orgId}`;
      if (this.eventType) url += `&eventType=${this.eventType}`;

      const data = await firstValueFrom(this.http.get<any>(url));
      this.payload.set(data);

      const pop = data.popularity?.data ?? [];
      this.totalEvents.set(pop.reduce((a: number, b: number) => a + b, 0));
      this.maxPopularity.set(Math.max(1, ...pop));

      const funnel = data.conversionFunnel?.counts ?? [0, 0, 0];
      this.conversionRate.set(funnel[0] > 0 ? ((funnel[1] / funnel[0]) * 100).toFixed(1) : '0.0');

      const att = data.attendanceRate?.rates ?? [0, 0];
      this.attendanceRate.set((att[0] * 100).toFixed(1));

      const can = data.cancellationRate?.rates ?? [0, 0];
      this.cancellationRate.set((can[1] * 100).toFixed(1));
    } catch {
      this.notifications.error('Failed to load dashboard');
    } finally {
      this.loading.set(false);
    }
  }

  async exportData(format: string): Promise<void> {
    this.exporting.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post(`/api/v1/analytics/export`, {
          format,
          filters: { from: this.dateFrom, to: this.dateTo, orgId: this.orgId || undefined, eventType: this.eventType || undefined },
        }, { responseType: 'blob' }),
      );

      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      const mimeType = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';
      const suggestedName = `analytics-${new Date().toISOString().split('T')[0]}.${ext}`;

      // File System Access API — save to user-selected local folder
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{
          description: format === 'xlsx' ? 'Excel Spreadsheet' : 'CSV File',
          accept: { [mimeType]: [`.${ext}`] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(res);
      await writable.close();
      this.notifications.success(`${format.toUpperCase()} saved to selected folder`);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // User cancelled the file picker — not an error
      } else {
        this.notifications.error('Export failed. You may need to wait for the cooldown period.');
      }
    } finally {
      this.exporting.set(false);
    }
  }

  barWidth(value: number, max: number): number {
    return Math.max(8, (value / max) * 120);
  }

  // Convert MM/DD/YYYY display format to ISO YYYY-MM-DD for API
  private mmddyyyyToIso(display: string): string | null {
    const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    return `${match[3]}-${match[1]}-${match[2]}`;
  }

  // Convert ISO YYYY-MM-DD to MM/DD/YYYY display format
  private isoToMmddyyyy(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${m}/${d}/${y}`;
  }

  onDateFromChange(): void {
    const iso = this.mmddyyyyToIso(this.dateFromDisplay);
    if (iso) {
      this.dateFrom = iso;
      this.loadDashboard();
    }
  }

  onDateToChange(): void {
    const iso = this.mmddyyyyToIso(this.dateToDisplay);
    if (iso) {
      this.dateTo = iso;
      this.loadDashboard();
    }
  }
}
