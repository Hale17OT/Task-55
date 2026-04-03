import { ErrorHandler, Injectable, isDevMode } from '@angular/core';
import { LoggerService } from './logger.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private logger = new LoggerService();

  handleError(error: unknown): void {
    if (isDevMode()) {
      this.logger.error('Unhandled error', error);
    } else {
      // Production: log only the message to avoid leaking diagnostics/stack traces
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      this.logger.error('Unhandled error', message);
    }
  }
}
