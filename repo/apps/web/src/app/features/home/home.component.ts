import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface FeatureCard {
  label: string;
  description: string;
  path: string;
  roles: string[];
  accentClass: string;
}

const FEATURES: FeatureCard[] = [
  { label: 'Portfolio', description: 'Manage and showcase photo & video projects', path: '/portfolio', roles: ['merchant', 'client', 'administrator'], accentClass: 'border-l-blue-500' },
  { label: 'Events', description: 'Schedule and coordinate sessions with clients', path: '/events', roles: ['merchant', 'operations', 'client', 'administrator'], accentClass: 'border-l-emerald-500' },
  { label: 'Offerings', description: 'Browse available service packages', path: '/offerings', roles: [], accentClass: 'border-l-violet-500' },
  { label: 'Dashboard', description: 'Monitor operations and track performance', path: '/dashboard', roles: ['operations', 'administrator'], accentClass: 'border-l-amber-500' },
  { label: 'Data Quality', description: 'Review and resolve duplicate records', path: '/data-quality', roles: ['operations', 'administrator'], accentClass: 'border-l-rose-500' },
  { label: 'Admin', description: 'User management and system configuration', path: '/admin', roles: ['administrator'], accentClass: 'border-l-slate-500' },
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="space-y-[var(--section-gap)]">
      <!-- Hero -->
      <div class="relative overflow-hidden rounded-xl bg-[hsl(var(--primary))] p-8 text-[hsl(var(--primary-foreground))] shadow-[var(--card-shadow-lg)] sm:p-10">
        <div class="absolute inset-0 bg-gradient-to-br from-transparent to-black/10"></div>
        <div class="relative">
          <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Welcome to StudioOps</h1>
          <p class="mt-2 max-w-xl text-lg opacity-90">
            Offline Photo &amp; Video Service Platform
          </p>
          @if (roleBadge()) {
            <span class="mt-4 inline-block rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">
              {{ roleBadge() }}
            </span>
          }
        </div>
      </div>

      <!-- Feature cards -->
      <div>
        <h2 class="mb-4 text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Quick Access</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (feature of visibleFeatures(); track feature.path) {
            <a [routerLink]="feature.path"
               class="group rounded-lg border border-l-4 bg-[hsl(var(--surface-elevated))] p-5 shadow-[var(--card-shadow)] transition-all hover:shadow-[var(--card-shadow-lg)] hover:translate-y-[-1px]"
               [class]="feature.accentClass">
              <h3 class="text-base font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))]">{{ feature.label }}</h3>
              <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{{ feature.description }}</p>
            </a>
          }
        </div>
      </div>
    </section>
  `,
})
export class HomeComponent {
  private auth = inject(AuthService);

  roleBadge = computed(() => {
    const role = this.auth.role();
    if (!role) return '';
    const labels: Record<string, string> = {
      administrator: 'Administrator',
      merchant: 'Merchant',
      operations: 'Operations',
      client: 'Client',
    };
    return labels[role] || '';
  });

  visibleFeatures = computed(() => {
    const role = this.auth.role();
    const isAuth = this.auth.isAuthenticated();
    return FEATURES.filter(f => {
      if (f.roles.length === 0) return true;
      if (!isAuth) return false;
      return f.roles.includes(role) || role === 'administrator';
    });
  });
}
