import { describe, expect, it } from 'vitest';
import { classifyLoadError, firstLoadError } from './loadError';

describe('firstLoadError', () => {
  it('returns the first non-null loading error', () => {
    const primaryError = new Error('primary failed');
    const supportError = new Error('support failed');

    expect(firstLoadError(null, primaryError, supportError)).toBe(primaryError);
  });

  it('returns null when no loading error exists', () => {
    expect(firstLoadError(null, undefined)).toBeNull();
  });
});

describe('classifyLoadError', () => {
  it('classifies proxy connection failures as service errors', () => {
    expect(classifyLoadError({ message: 'TypeError: fetch failed', details: 'ECONNREFUSED 127.0.0.1:3002' })).toBe('service');
  });

  it('classifies permission responses separately from generic errors', () => {
    expect(classifyLoadError({ status: 403, message: 'Forbidden' })).toBe('permission');
    expect(classifyLoadError(new Error('Unexpected response'))).toBe('generic');
  });
});
