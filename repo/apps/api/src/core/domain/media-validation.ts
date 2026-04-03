import { MEDIA } from '@studioops/shared';

const ALL_ALLOWED_MIMES = [
  ...MEDIA.ALLOWED_PHOTO_MIMES,
  ...MEDIA.ALLOWED_VIDEO_MIMES,
];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  mediaType?: 'photo' | 'video';
}

export function validateFile(
  mimeType: string,
  fileSizeBytes: number,
  maxFileSizeBytes: number,
): FileValidationResult {
  if (!ALL_ALLOWED_MIMES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid file type. Accepted: JPEG, PNG, TIFF, MP4, MOV`,
      errorCode: 'INVALID_FILE_TYPE',
    };
  }

  if (fileSizeBytes > maxFileSizeBytes) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${Math.floor(maxFileSizeBytes / 1024 / 1024)}MB`,
      errorCode: 'FILE_TOO_LARGE',
    };
  }

  const mediaType = MEDIA.ALLOWED_PHOTO_MIMES.includes(mimeType) ? 'photo' : 'video';
  return { valid: true, mediaType };
}

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

const PROCESSING_TRANSITIONS: Record<ProcessingStatus, ProcessingStatus[]> = {
  pending: ['processing'],
  processing: ['ready', 'failed'],
  ready: [],
  failed: [],
};

export function validateProcessingTransition(from: ProcessingStatus, to: ProcessingStatus): boolean {
  return PROCESSING_TRANSITIONS[from]?.includes(to) ?? false;
}
