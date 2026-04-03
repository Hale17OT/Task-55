export interface ApiError {
  error: string;
  message: string;
  details?: unknown[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  db: 'connected' | 'unreachable';
}
