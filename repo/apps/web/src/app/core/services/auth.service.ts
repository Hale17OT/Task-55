import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export interface UserSession {
  id: string;
  username: string;
  role: string;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
}

interface RegisterResponse {
  id: string;
  username: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<UserSession | null>(null);
  private _token = signal<string | null>(null);
  private _loading = signal(false);

  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());
  readonly role = computed(() => this._user()?.role ?? 'guest');

  constructor(private http: HttpClient, private router: Router) {
    this.ready = new Promise<void>((resolve) => { this._resolveReady = resolve; });
    this.restoreSession();
  }

  async register(username: string, password: string): Promise<RegisterResponse> {
    return firstValueFrom(
      this.http.post<RegisterResponse>('/api/v1/auth/register', { username, password }),
    );
  }

  async login(username: string, password: string): Promise<void> {
    this._loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>('/api/v1/auth/login', { username, password }),
      );
      this.setTokens(res.accessToken);
      await this.fetchSession();
      this.router.navigate([this.getDefaultRoute()]);
    } finally {
      this._loading.set(false);
    }
  }

  async logout(): Promise<void> {
    const token = this._token();
    if (token) {
      try {
        await firstValueFrom(this.http.post('/api/v1/auth/logout', {}));
      } catch { /* ignore logout failures */ }
    }
    this.clearSession();
    this.router.navigate(['/login']);
  }

  async refreshToken(): Promise<string | null> {
    // Refresh token is sent automatically via httpOnly cookie
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>('/api/v1/auth/refresh', {}),
      );
      this.setTokens(res.accessToken);
      return res.accessToken;
    } catch {
      this.clearSession();
      return null;
    }
  }

  getDefaultRoute(): string {
    switch (this._user()?.role) {
      case 'administrator': return '/admin';
      case 'operations': return '/dashboard';
      case 'merchant': return '/offerings';
      case 'client': return '/';
      default: return '/';
    }
  }

  private async fetchSession(): Promise<void> {
    try {
      const session = await firstValueFrom(
        this.http.get<UserSession>('/api/v1/auth/session'),
      );
      this._user.set(session);
    } catch {
      this.clearSession();
    }
  }

  private setTokens(accessToken: string): void {
    this._token.set(accessToken);
    // In-memory only — no Web Storage. httpOnly cookies handle persistence.
  }

  private clearSession(): void {
    this._token.set(null);
    this._user.set(null);
  }

  /** Promise that resolves when the initial session check is complete */
  readonly ready: Promise<void>;
  private _resolveReady!: () => void;

  private restoreSession(): void {
    // No stored token — try silent refresh via httpOnly cookie
    const token = this._token();
    if (token) {
      this.fetchSession().finally(() => this._resolveReady());
    } else {
      // Try silent refresh via httpOnly cookie
      this.refreshToken().then(newToken => {
        if (newToken) {
          this.fetchSession().finally(() => this._resolveReady());
        } else {
          this._resolveReady();
        }
      }).catch(() => this._resolveReady());
    }
  }
}
