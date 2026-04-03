import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for session restoration to complete before checking auth state
  await auth.ready;

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.parseUrl('/login');
};

export function roleGuard(...allowedRoles: string[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await auth.ready;

    if (!auth.isAuthenticated()) {
      return router.parseUrl('/login');
    }

    const userRole = auth.role();
    if (allowedRoles.includes(userRole) || userRole === 'administrator') {
      return true;
    }

    return router.parseUrl('/forbidden');
  };
}
