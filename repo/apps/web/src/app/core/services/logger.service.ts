import { Injectable, isDevMode } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoggerService {
  info(message: string, context?: unknown): void {
    if (isDevMode()) {
      // eslint-disable-next-line no-console
      console.info(`[INFO] ${message}`, context ?? '');
    }
  }

  warn(message: string, context?: unknown): void {
    if (isDevMode()) {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${message}`, context ?? '');
    }
  }

  error(message: string, context?: unknown): void {
    // Errors always logged (but structured, no sensitive data)
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${message}`, context ?? '');
  }
}
