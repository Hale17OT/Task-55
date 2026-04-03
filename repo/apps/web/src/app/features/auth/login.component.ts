import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastComponent } from '../../shared/components/toast.component';
import { HlmButtonDirective } from '../../ui/hlm-button.directive';
import { HlmInputDirective } from '../../ui/hlm-input.directive';
import { HlmLabelDirective } from '../../ui/hlm-label.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardContentDirective, HlmCardFooterDirective, HlmCardTitleDirective, HlmCardDescriptionDirective } from '../../ui/hlm-card.directive';
import { HlmSpinnerComponent } from '../../ui/hlm-spinner.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule, ToastComponent, HlmButtonDirective, HlmInputDirective, HlmLabelDirective,
    HlmCardDirective, HlmCardHeaderDirective, HlmCardContentDirective, HlmCardFooterDirective,
    HlmCardTitleDirective, HlmCardDescriptionDirective, HlmSpinnerComponent,
  ],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-[hsl(var(--muted))]">
      <div class="w-full max-w-md" hlmCard>
        <div hlmCardHeader class="text-center">
          <h1 hlmCardTitle class="text-2xl">StudioOps</h1>
          <p hlmCardDescription>Sign in to your account</p>
        </div>

        <div hlmCardContent>
          @if (errorMessage()) {
            <div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {{ errorMessage() }}
            </div>
          }

          <form (ngSubmit)="onSubmit()" class="space-y-4">
            <div>
              <label hlmLabel for="username" class="mb-1.5 block">Username</label>
              <input
                hlmInput
                id="username"
                type="text"
                [(ngModel)]="username"
                name="username"
                required
                autocomplete="username"
                placeholder="Enter your username" />
            </div>

            <div>
              <label hlmLabel for="password" class="mb-1.5 block">Password</label>
              <input
                hlmInput
                id="password"
                type="password"
                [(ngModel)]="password"
                name="password"
                required
                autocomplete="current-password"
                placeholder="Enter your password" />
            </div>

            <button hlmBtn class="w-full" type="submit" [disabled]="loading()">
              @if (loading()) {
                <hlm-spinner size="4" class="mr-2" /> Signing in...
              } @else {
                Sign in
              }
            </button>
          </form>
        </div>

        <div hlmCardFooter class="justify-center">
          <span class="text-xs text-[hsl(var(--muted-foreground))]">Offline Platform — No internet required</span>
        </div>
      </div>
    </div>
    <app-toast />
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private notifications = inject(NotificationService);

  username = '';
  password = '';
  loading = this.auth.loading;
  errorMessage = signal('');

  async onSubmit(): Promise<void> {
    this.errorMessage.set('');
    if (!this.username.trim() || !this.password) {
      this.errorMessage.set('Please enter username and password');
      return;
    }
    try {
      await this.auth.login(this.username.trim(), this.password);
      this.notifications.success('Logged in successfully');
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) this.errorMessage.set('Invalid username or password');
        else if (err.status === 429) this.errorMessage.set(`Account temporarily locked. Try again in ${err.error?.retryAfter || 'a few'} seconds.`);
        else this.errorMessage.set(err.error?.message || 'Login failed');
      } else {
        this.errorMessage.set('An unexpected error occurred');
      }
    }
  }
}
