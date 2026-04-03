import { Component, inject } from '@angular/core';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2">
      @for (n of notifications(); track n.id) {
        <div
          class="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg transition-all"
          [class]="typeClasses(n.type)"
          (click)="dismiss(n.id)">
          <span>{{ n.message }}</span>
          <button class="ml-auto text-xs opacity-60 hover:opacity-100">×</button>
        </div>
      }
    </div>
  `,
})
export class ToastComponent {
  private notificationService = inject(NotificationService);
  notifications = this.notificationService.notifications;

  dismiss(id: number): void {
    this.notificationService.dismiss(id);
  }

  typeClasses(type: string): string {
    switch (type) {
      case 'success': return 'border-green-200 bg-green-50 text-green-800';
      case 'error': return 'border-red-200 bg-red-50 text-red-800';
      case 'warning': return 'border-yellow-200 bg-yellow-50 text-yellow-800';
      default: return 'border-blue-200 bg-blue-50 text-blue-800';
    }
  }
}
