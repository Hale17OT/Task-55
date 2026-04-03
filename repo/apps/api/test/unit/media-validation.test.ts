import { describe, it, expect } from 'vitest';
import { validateFile, validateProcessingTransition } from '../../src/core/domain/media-validation';

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

describe('validateFile', () => {
  it('accepts JPEG', () => {
    const result = validateFile('image/jpeg', 1024, MAX_SIZE);
    expect(result.valid).toBe(true);
    expect(result.mediaType).toBe('photo');
  });

  it('accepts PNG', () => {
    const result = validateFile('image/png', 1024, MAX_SIZE);
    expect(result.valid).toBe(true);
    expect(result.mediaType).toBe('photo');
  });

  it('accepts TIFF', () => {
    const result = validateFile('image/tiff', 1024, MAX_SIZE);
    expect(result.valid).toBe(true);
    expect(result.mediaType).toBe('photo');
  });

  it('accepts MP4', () => {
    const result = validateFile('video/mp4', 1024, MAX_SIZE);
    expect(result.valid).toBe(true);
    expect(result.mediaType).toBe('video');
  });

  it('accepts MOV', () => {
    const result = validateFile('video/quicktime', 1024, MAX_SIZE);
    expect(result.valid).toBe(true);
    expect(result.mediaType).toBe('video');
  });

  it('rejects .exe', () => {
    const result = validateFile('application/x-msdownload', 1024, MAX_SIZE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_FILE_TYPE');
  });

  it('rejects application/pdf', () => {
    const result = validateFile('application/pdf', 1024, MAX_SIZE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_FILE_TYPE');
  });

  it('rejects oversized file', () => {
    const result = validateFile('image/jpeg', MAX_SIZE + 1, MAX_SIZE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('FILE_TOO_LARGE');
  });

  it('accepts file at exact max size', () => {
    const result = validateFile('image/jpeg', MAX_SIZE, MAX_SIZE);
    expect(result.valid).toBe(true);
  });
});

describe('validateProcessingTransition', () => {
  it('allows pending → processing', () => {
    expect(validateProcessingTransition('pending', 'processing')).toBe(true);
  });

  it('allows processing → ready', () => {
    expect(validateProcessingTransition('processing', 'ready')).toBe(true);
  });

  it('allows processing → failed', () => {
    expect(validateProcessingTransition('processing', 'failed')).toBe(true);
  });

  it('rejects ready → anything', () => {
    expect(validateProcessingTransition('ready', 'processing')).toBe(false);
    expect(validateProcessingTransition('ready', 'pending')).toBe(false);
  });

  it('rejects failed → anything', () => {
    expect(validateProcessingTransition('failed', 'processing')).toBe(false);
  });

  it('rejects pending → ready (must process first)', () => {
    expect(validateProcessingTransition('pending', 'ready')).toBe(false);
  });
});
