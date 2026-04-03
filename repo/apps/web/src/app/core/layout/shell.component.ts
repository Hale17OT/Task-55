import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { TopbarComponent } from './topbar.component';
import { ToastComponent } from '../../shared/components/toast.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, ToastComponent],
  template: `
    <div class="flex h-screen overflow-hidden">
      <app-sidebar class="hidden md:flex" />
      <div class="flex flex-1 flex-col overflow-hidden">
        <app-topbar />
        <main class="flex-1 overflow-auto bg-[hsl(var(--muted))] p-6">
          <router-outlet />
        </main>
      </div>
    </div>
    <app-toast />
  `,
})
export class ShellComponent {}
