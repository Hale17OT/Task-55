import { Component, inject, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';

interface NavItem {
  label: string;
  path: string;
  roles: string[]; // empty = all authenticated
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/', roles: [] },
  { label: 'Offerings', path: '/offerings', roles: [] }, // Public — guests can browse
  { label: 'Events', path: '/events', roles: ['merchant', 'operations', 'client', 'administrator'] },
  { label: 'Portfolio', path: '/portfolio', roles: ['merchant', 'administrator'] },
  { label: 'Dashboard', path: '/dashboard', roles: ['operations', 'administrator'] },
  { label: 'Data Quality', path: '/data-quality', roles: ['operations', 'administrator'] },
  { label: 'Admin', path: '/admin', roles: ['administrator'] },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="flex w-[260px] flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--background))]">
      <div class="flex h-16 items-center px-6">
        <h1 class="text-lg font-semibold tracking-tight">StudioOps</h1>
      </div>
      <nav class="flex-1 space-y-1 px-3 py-4">
        @for (item of visibleItems(); track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
            [routerLinkActiveOptions]="{ exact: item.path === '/' }"
            class="flex items-center rounded-md px-3 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]">
            {{ item.label }}
          </a>
        }
      </nav>
      <div class="border-t border-[hsl(var(--border))] px-3 py-4">
        @if (auth.isAuthenticated()) {
          <div class="px-3 text-xs text-[hsl(var(--muted-foreground))]">
            <div class="font-medium">{{ auth.user()?.username }}</div>
            <div class="capitalize">{{ auth.user()?.role }}</div>
          </div>
        }
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  auth = inject(AuthService);

  visibleItems = computed(() => {
    const role = this.auth.role();
    const isAuth = this.auth.isAuthenticated();

    return NAV_ITEMS.filter(item => {
      if (item.roles.length === 0) return true;
      if (!isAuth) return false;
      return item.roles.includes(role) || role === 'administrator';
    });
  });
}
