import { Component, inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  template: `
    <header class="flex h-16 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-6">
      <div class="text-sm font-medium text-[hsl(var(--muted-foreground))]">
        StudioOps Platform
      </div>
      <div class="flex items-center gap-4">
        @if (auth.isAuthenticated()) {
          <span class="text-sm text-[hsl(var(--muted-foreground))]">{{ auth.user()?.username }}</span>
          <button
            (click)="auth.logout()"
            class="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[hsl(var(--accent))]">
            Logout
          </button>
        } @else {
          <a href="/login" class="rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90">
            Login
          </a>
        }
      </div>
    </header>
  `,
})
export class TopbarComponent {
  auth = inject(AuthService);
}
