import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  template: `
    <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
      <h2 class="text-2xl font-semibold tracking-tight">Welcome to StudioOps</h2>
      <p class="mt-2 text-[hsl(var(--muted-foreground))]">
        Offline Photo &amp; Video Service Platform
      </p>
    </div>
  `,
})
export class HomeComponent {}
