import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="flex flex-col items-center justify-center py-20">
      <h2 class="text-2xl font-semibold">404 — Page Not Found</h2>
      <p class="mt-2 text-[hsl(var(--muted-foreground))]">The page you're looking for doesn't exist.</p>
      <a routerLink="/" class="mt-4 text-sm font-medium text-[hsl(var(--primary))] underline">
        Go home
      </a>
    </div>
  `,
})
export class NotFoundComponent {}
