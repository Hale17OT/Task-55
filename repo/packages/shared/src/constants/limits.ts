export const RATE_LIMITS = {
  AUTHENTICATED: 120,
  GUEST: 30,
  WINDOW_MS: 60_000,
} as const;

export const PASSWORD_POLICY = {
  MIN_LENGTH: 12,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_DIGIT: true,
  REQUIRE_SPECIAL: true,
} as const;

export const SESSION = {
  ACCESS_TOKEN_LIFETIME_SECONDS: 1800,      // 30 minutes
  REFRESH_TOKEN_LIFETIME_SECONDS: 28_800,   // 8 hours (sliding)
  ABSOLUTE_SESSION_LIFETIME_SECONDS: 28_800, // 8 hours (aligned with prompt requirement)
} as const;

export const LOCKOUT = {
  MAX_ATTEMPTS: 5,
  WINDOW_SECONDS: 600,
  DURATION_SECONDS: 900,
} as const;

export const QUOTAS = {
  MAX_UPLOADS_PER_DAY: 20,
  MAX_EDITS_PER_HOUR: 10,
  EXPORT_COOLDOWN_SECONDS: 60,
  VIOLATION_THRESHOLD: 3,
  PENALTY_DURATION_SECONDS: 1800,
} as const;

export const MEDIA = {
  PHOTO_MAX_LONG_EDGE: 3000,
  PHOTO_JPEG_QUALITY: 80,
  PHOTO_PREVIEW_SIZE: 400,
  VIDEO_MAX_HEIGHT: 1080,
  ALLOWED_PHOTO_MIMES: ['image/jpeg', 'image/png', 'image/tiff'] as readonly string[],
  ALLOWED_VIDEO_MIMES: ['video/mp4', 'video/quicktime'] as readonly string[],
} as const;

export const AUDIT = {
  RETENTION_DAYS: 365,
} as const;

export const DEDUP = {
  SIMILARITY_THRESHOLD: 0.85,
  WEIGHTS: {
    TITLE: 0.40,
    PRICE: 0.25,
    DURATION: 0.15,
    TAGS: 0.20,
  },
} as const;

export const DPI_STANDARD = 300;
