import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="space-y-[var(--section-gap)]">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold tracking-tight text-[hsl(var(--heading-primary))]">Portfolio</h2>
        @if (canEdit()) {
          <div class="flex items-center gap-2">
            <select [(ngModel)]="uploadCategoryId" class="rounded border px-2 py-1.5 text-sm">
              <option value="">No category</option>
              @for (cat of categories(); track cat.id) {
                <option [value]="cat.id">{{ cat.name }}</option>
              }
            </select>
            <label class="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))]"
              [class.opacity-50]="uploadStatus() === 'uploading'" [class.cursor-not-allowed]="uploadStatus() === 'uploading'" [class.cursor-pointer]="uploadStatus() !== 'uploading'" [class.hover:opacity-90]="uploadStatus() !== 'uploading'">
              {{ uploadStatus() === 'uploading' ? 'Uploading...' : 'Upload' }}
              <input type="file" accept="image/jpeg,image/png,image/tiff,video/mp4,video/quicktime" (change)="onFileSelected($event)" class="hidden" [disabled]="uploadStatus() === 'uploading'" />
            </label>
          </div>
        }
      </div>

      @if (uploadStatus()) {
        <div class="rounded-md border px-4 py-3 text-sm"
          [class]="uploadStatus() === 'success' ? 'border-green-200 bg-green-50 text-green-800' : uploadStatus() === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'">
          {{ uploadMessage() }}
        </div>
      }

      @if (loading()) {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="aspect-square animate-pulse rounded-lg border bg-[hsl(var(--card))]"></div>
          }
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (item of items(); track item.id) {
            <div class="rounded-lg border bg-[hsl(var(--card))] p-4 shadow-[var(--card-shadow)] transition-shadow hover:shadow-[var(--card-shadow-lg)]">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-sm font-medium text-[hsl(var(--heading-primary))]">{{ item.title }}</span>
                <div class="flex items-center gap-1">
                  @if (canEdit()) { <button (click)="deleteItem(item.id)" class="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50">Delete</button> }
                  <span class="rounded-full px-2 py-0.5 text-xs"
                    [class]="item.status === 'ready' ? 'bg-green-100 text-green-800' : item.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'">
                    {{ item.status }}
                  </span>
                </div>
              </div>
              @if (item.status === 'ready' && item.previewPath) {
                <img [src]="'/api/v1/media/' + item.previewPath" [alt]="item.title"
                  class="aspect-video w-full rounded object-cover bg-[hsl(var(--muted))]"
                  (error)="$any($event.target).style.display='none'" />
              } @else {
                <div class="aspect-video rounded bg-[hsl(var(--muted))] flex items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">
                  @if (item.status === 'pending' || item.status === 'processing') {
                    Processing...
                  } @else if (item.status === 'failed') {
                    Processing failed{{ item.errorDetail ? ': ' + item.errorDetail : '' }}
                  } @else {
                    {{ item.mediaType === 'photo' ? '🖼' : '🎬' }} {{ item.mimeType }}
                  }
                </div>
              }
              <div class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                {{ (item.fileSizeBytes / 1024 / 1024).toFixed(1) }} MB
                @if (item.width && item.height) {
                  · {{ item.width }}×{{ item.height }}px
                  @if (item.widthInches && item.heightInches) {
                    ({{ item.widthInches }}×{{ item.heightInches }}in)
                  }
                }
                @if (item.durationSeconds) { · {{ item.durationSeconds }}s }
              </div>
              <!-- Category assignment (merchant/admin only) -->
              @if (canEdit()) {
                <div class="mt-2">
                  <select (change)="assignCategory(item.id, $event)"
                    class="w-full rounded border px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">
                    <option value="" [selected]="!item.categoryId">No category</option>
                    @for (cat of categories(); track cat.id) {
                      <option [value]="cat.id" [selected]="item.categoryId === cat.id">{{ cat.name }}</option>
                    }
                  </select>
                </div>
              }
              <!-- Tag editing -->
              <div class="mt-2 flex flex-wrap gap-1">
                @if (item.tags?.length) {
                  @for (tag of item.tags; track tag.name) {
                    <span class="rounded-full bg-[hsl(var(--accent))] px-2 py-0.5 text-xs">{{ tag.name }}</span>
                  }
                }
                @if (canEdit()) { <button (click)="editTags(item.id)" class="rounded-full border border-dashed px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]">+ tags</button> }
              </div>
            </div>
          }
          @if (items().length === 0) {
            <div class="col-span-full rounded-lg border bg-[hsl(var(--card))] p-8 text-center text-[hsl(var(--muted-foreground))]">
              No portfolio items. Upload your first photo or video.
            </div>
          }
        </div>
      }

      <!-- Category Management (merchant/admin only) -->
      @if (canEdit()) {
      <div class="mt-8 rounded-lg border bg-[hsl(var(--card))] p-4 shadow-[var(--card-shadow)]">
        <h3 class="mb-3 text-sm font-medium text-[hsl(var(--heading-secondary))]">Categories</h3>
        <div class="space-y-2">
          @for (cat of categories(); track cat.id) {
            <div class="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <span>{{ cat.name }}</span>
              <button (click)="deleteCategory(cat.id)" class="text-xs text-red-600 hover:underline">Remove</button>
            </div>
          }
          <div class="flex gap-2">
            <input [(ngModel)]="newCategoryName" placeholder="New category name"
              class="flex-1 rounded border px-2 py-1 text-sm" />
            <button (click)="createCategory()" class="rounded bg-[hsl(var(--accent))] px-3 py-1 text-xs">Add</button>
          </div>
        </div>
      </div>
      }

      <!-- Tag Edit Dialog -->
      @if (editingTagsItemId()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" (click)="editingTagsItemId.set(null)">
          <div class="w-full max-w-sm rounded-lg border bg-[hsl(var(--background))] p-6" (click)="$event.stopPropagation()">
            <h3 class="mb-3 text-sm font-semibold text-[hsl(var(--heading-secondary))]">Edit Tags</h3>
            <input [(ngModel)]="tagInput" placeholder="Comma-separated tags (e.g. Lifestyle, Product, B&W)"
              class="w-full rounded border px-3 py-2 text-sm" />
            <div class="mt-3 flex justify-end gap-2">
              <button (click)="editingTagsItemId.set(null)" class="rounded border px-3 py-1 text-sm">Cancel</button>
              <button (click)="saveTags()" class="rounded bg-[hsl(var(--primary))] px-3 py-1 text-sm text-[hsl(var(--primary-foreground))]">Save Tags</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PortfolioComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  canEdit = () => ['merchant', 'administrator'].includes(this.auth.role());
  items = signal<any[]>([]);
  loading = signal(true);
  uploadStatus = signal<string>('');
  uploadMessage = signal('');
  categories = signal<any[]>([]);
  newCategoryName = '';
  editingTagsItemId = signal<string | null>(null);
  tagInput = '';
  uploadCategoryId = '';

  private notifications = inject(NotificationService);

  ngOnInit(): void { this.load(); this.loadCategories(); }

  async load(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<any>('/api/v1/portfolio'));
      this.items.set(res.data);
    } finally { this.loading.set(false); }
  }

  async loadCategories(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<any>('/api/v1/portfolio/categories'));
      this.categories.set(res.data);
    } catch { /* ignore */ }
  }

  async createCategory(): Promise<void> {
    if (!this.newCategoryName.trim()) return;
    try {
      await firstValueFrom(this.http.post('/api/v1/portfolio/categories', { name: this.newCategoryName.trim() }));
      this.newCategoryName = '';
      this.loadCategories();
      this.notifications.success('Category created');
    } catch { this.notifications.error('Failed to create category'); }
  }

  async deleteCategory(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/portfolio/categories/${id}`));
      this.categories.update(list => list.filter(c => c.id !== id));
    } catch { this.notifications.error('Failed to delete category'); }
  }

  editTags(itemId: string): void {
    const item = this.items().find(i => i.id === itemId);
    this.tagInput = item?.tags?.map((t: any) => t.name).join(', ') || '';
    this.editingTagsItemId.set(itemId);
  }

  async saveTags(): Promise<void> {
    const itemId = this.editingTagsItemId();
    if (!itemId) return;
    const tagNames = this.tagInput.split(',').map(t => t.trim()).filter(Boolean);
    try {
      await firstValueFrom(this.http.patch(`/api/v1/portfolio/${itemId}/tags`, { tagNames }));
      this.editingTagsItemId.set(null);
      this.load();
      this.notifications.success('Tags updated');
    } catch { this.notifications.error('Failed to update tags'); }
  }

  async assignCategory(itemId: string, event: Event): Promise<void> {
    const categoryId = (event.target as HTMLSelectElement).value || null;
    try {
      await firstValueFrom(this.http.patch(`/api/v1/portfolio/${itemId}/category`, { categoryId }));
      this.items.update(list => list.map(i => i.id === itemId ? { ...i, categoryId } : i));
      this.notifications.success('Category updated');
    } catch { this.notifications.error('Failed to assign category'); }
  }

  async deleteItem(itemId: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/portfolio/${itemId}`));
      this.items.update(list => list.filter(i => i.id !== itemId));
      this.notifications.success('Item deleted');
    } catch { this.notifications.error('Failed to delete item'); }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name.replace(/\.[^.]+$/, ''));
    if (this.uploadCategoryId) {
      formData.append('categoryId', this.uploadCategoryId);
    }

    this.uploadStatus.set('uploading');
    this.uploadMessage.set(`Uploading ${file.name}...`);

    try {
      const res = await firstValueFrom(this.http.post<any>('/api/v1/portfolio/upload', formData));
      this.uploadStatus.set('success');
      this.uploadMessage.set(`Uploaded "${res.title}" — accepted for processing (status: ${res.status}). Compression and preview generation in progress.`);
      this.load();
    } catch (err: any) {
      this.uploadStatus.set('error');
      this.uploadMessage.set(err.error?.message || 'Upload failed');
    }

    input.value = '';
  }
}
