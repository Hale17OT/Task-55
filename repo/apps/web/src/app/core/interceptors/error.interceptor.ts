import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        notifications.error('Network error. Please check your connection.');
      } else if (error.status >= 500) {
        notifications.error('Server error. Please try again later.');
      } else if (error.status === 429) {
        const msg = error.error?.message || 'Too many requests. Please slow down.';
        notifications.warning(msg);
      }
      return throwError(() => error);
    }),
  );
};
