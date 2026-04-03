import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="flex flex-col items-center justify-center py-20">
      <h2 class="text-2xl font-semibold">403 — Forbidden</h2>
      <p class="mt-2 text-[hsl(var(--muted-foreground))]">You don't have permission to access this page.</p>
      <a routerLink="/" class="mt-4 text-sm font-medium text-[hsl(var(--primary))] underline">Go home</a>
    </div>
  `,
})
export class ForbiddenComponent {}
