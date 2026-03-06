import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../client.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker(3, 1000); // 3 max failures, 1s reset timeout
  });

  describe('canRequest', () => {
    it('returns true for unknown URL', () => {
      expect(cb.canRequest('https://unknown.example.com')).toBe(true);
    });

    it('returns true for healthy URL', () => {
      cb.recordSuccess('https://healthy.example.com');
      expect(cb.canRequest('https://healthy.example.com')).toBe(true);
    });

    it('returns false for degraded URL within backoff', () => {
      const url = 'https://degraded.example.com';
      cb.recordFailure(url);
      cb.recordFailure(url);
      cb.recordFailure(url); // hits maxFailures=3 → degraded
      expect(cb.canRequest(url)).toBe(false);
    });

    it('returns true for degraded URL after backoff expires', () => {
      const url = 'https://degraded.example.com';
      vi.useFakeTimers();
      try {
        cb.recordFailure(url);
        cb.recordFailure(url);
        cb.recordFailure(url);
        expect(cb.canRequest(url)).toBe(false);

        // Advance time past the resetTimeout (1000ms)
        vi.advanceTimersByTime(1001);
        expect(cb.canRequest(url)).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('recordSuccess', () => {
    it('resets failure count', () => {
      const url = 'https://example.com';
      cb.recordFailure(url);
      cb.recordFailure(url);
      cb.recordSuccess(url);
      expect(cb.getStatus(url)).toBe('healthy');
    });

    it('sets status to healthy', () => {
      const url = 'https://example.com';
      cb.recordFailure(url);
      cb.recordFailure(url);
      cb.recordFailure(url);
      expect(cb.getStatus(url)).toBe('degraded');
      cb.recordSuccess(url);
      expect(cb.getStatus(url)).toBe('healthy');
    });
  });

  describe('recordFailure', () => {
    it('increments failure count', () => {
      const url = 'https://example.com';
      cb.recordFailure(url);
      // Still healthy after 1 failure (maxFailures=3)
      expect(cb.getStatus(url)).toBe('healthy');
    });

    it('sets status to degraded after maxFailures', () => {
      const url = 'https://example.com';
      cb.recordFailure(url);
      cb.recordFailure(url);
      cb.recordFailure(url);
      expect(cb.getStatus(url)).toBe('degraded');
    });

    it('multiple failures accumulate', () => {
      const url = 'https://example.com';
      cb.recordFailure(url);
      expect(cb.getStatus(url)).toBe('healthy');
      cb.recordFailure(url);
      expect(cb.getStatus(url)).toBe('healthy');
      cb.recordFailure(url);
      expect(cb.getStatus(url)).toBe('degraded');
    });
  });

  describe('getStatus', () => {
    it('returns healthy for unknown URL', () => {
      expect(cb.getStatus('https://never-seen.example.com')).toBe('healthy');
    });

    it('returns correct status after failures', () => {
      const url = 'https://example.com';
      expect(cb.getStatus(url)).toBe('healthy');
      cb.recordFailure(url);
      cb.recordFailure(url);
      expect(cb.getStatus(url)).toBe('healthy');
      cb.recordFailure(url);
      expect(cb.getStatus(url)).toBe('degraded');
    });
  });

  describe('reset', () => {
    it('clears state for URL', () => {
      const url = 'https://example.com';
      cb.recordFailure(url);
      cb.recordFailure(url);
      cb.recordFailure(url);
      expect(cb.getStatus(url)).toBe('degraded');
      cb.reset(url);
      expect(cb.getStatus(url)).toBe('healthy');
      expect(cb.canRequest(url)).toBe(true);
    });
  });
});
