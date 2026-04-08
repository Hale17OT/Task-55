import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-data-quality',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="space-y-[var(--section-gap)]">
      <h2 class="text-2xl font-semibold tracking-tight text-[hsl(var(--heading-primary))]">Data Quality & Deduplication</h2>

      <!-- Tabs -->
      <div class="flex gap-1 border-b">
        <button (click)="tab.set('dedup')" class="px-4 py-2 text-sm font-medium"
          [class]="tab() === 'dedup' ? 'border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'">
          Duplicate Candidates
        </button>
        <button (click)="tab.set('flags')" class="px-4 py-2 text-sm font-medium"
          [class]="tab() === 'flags' ? 'border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'">
          Quality Flags
        </button>
      </div>

      @if (tab() === 'dedup') {
        <div class="space-y-3">
          @for (c of candidates(); track c.id) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-4 shadow-[var(--card-shadow)]">
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-[hsl(var(--heading-secondary))]">{{ c.recordType }} — {{ (c.similarityScore * 100).toFixed(1) }}% match</span>
                  <div class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{{ c.createdAt | date:'MM/dd/yyyy HH:mm' }}</div>
                </div>
                <div class="flex gap-2">
                  @if (c.status === 'pending') {
                    <button (click)="merge(c)" class="rounded bg-green-100 px-2 py-1 text-xs text-green-800 hover:bg-green-200">Merge</button>
                    <button (click)="dismiss(c.id)" class="rounded border px-2 py-1 text-xs hover:bg-[hsl(var(--accent))]">Dismiss</button>
                  }
                  <span class="rounded-full px-2 py-0.5 text-xs"
                    [class]="c.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : c.status === 'merged' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'">
                    {{ c.status }}
                  </span>
                </div>
              </div>
            </div>
          }
          @if (candidates().length === 0) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-8 text-center text-[hsl(var(--muted-foreground))] shadow-[var(--card-shadow)]">No duplicate candidates</div>
          }
        </div>
      }

      @if (tab() === 'flags') {
        <div class="space-y-3">
          @for (f of flags(); track f.id) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-4 shadow-[var(--card-shadow)]">
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-[hsl(var(--heading-secondary))]">{{ f.field }}: {{ f.issue }}</span>
                  <div class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{{ f.recordType }} · {{ f.createdAt | date:'MM/dd/yyyy' }}</div>
                </div>
                @if (f.status === 'open') {
                  <button (click)="resolveFlag(f.id)" class="rounded border px-2 py-1 text-xs hover:bg-[hsl(var(--accent))]">Resolve</button>
                } @else {
                  <span class="text-xs text-green-600">Resolved</span>
                }
              </div>
            </div>
          }
          @if (flags().length === 0) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-8 text-center text-[hsl(var(--muted-foreground))] shadow-[var(--card-shadow)]">No quality flags</div>
          }
        </div>
      }
    </div>
  `,
})
export class DataQualityComponent implements OnInit {
  private http = inject(HttpClient);
  private notifications = inject(NotificationService);

  tab = signal<'dedup' | 'flags'>('dedup');
  candidates = signal<any[]>([]);
  flags = signal<any[]>([]);

  ngOnInit(): void { this.loadAll(); }

  async loadAll(): Promise<void> {
    const [dedupRes, flagsRes] = await Promise.allSettled([
      firstValueFrom(this.http.get<any>('/api/v1/dedup/queue')),
      firstValueFrom(this.http.get<any>('/api/v1/dedup/data-quality/flags')),
    ]);
    if (dedupRes.status === 'fulfilled') this.candidates.set(dedupRes.value.data);
    if (flagsRes.status === 'fulfilled') this.flags.set(flagsRes.value.data);
  }

  async merge(candidate: any): Promise<void> {
    // Merge: keep record A (first) as surviving, merge record B into it
    try {
      await firstValueFrom(this.http.post(`/api/v1/dedup/${candidate.id}/merge`, {
        survivingRecordId: candidate.recordAId,
        mergedRecordId: candidate.recordBId,
      }));
      this.candidates.update(list => list.map(c => c.id === candidate.id ? { ...c, status: 'merged' } : c));
      this.notifications.success('Records merged');
    } catch { this.notifications.error('Merge failed'); }
  }

  async dismiss(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`/api/v1/dedup/${id}/dismiss`, {}));
      this.candidates.update(list => list.map(c => c.id === id ? { ...c, status: 'dismissed' } : c));
      this.notifications.success('Candidate dismissed');
    } catch { this.notifications.error('Failed to dismiss'); }
  }

  async resolveFlag(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`/api/v1/dedup/data-quality/flags/${id}/resolve`, {}));
      this.flags.update(list => list.map(f => f.id === id ? { ...f, status: 'resolved' } : f));
      this.notifications.success('Flag resolved');
    } catch { this.notifications.error('Failed to resolve'); }
  }
}
