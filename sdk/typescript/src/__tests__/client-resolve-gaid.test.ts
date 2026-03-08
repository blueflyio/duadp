import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DuadpError, resolveGaid } from '../client.js';

const { resolveTxt } = vi.hoisted(() => ({
  resolveTxt: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  resolveTxt,
}));

describe('resolveGaid DNS enforcement', () => {
  beforeEach(() => {
    resolveTxt.mockReset();
  });

  it('rejects high-trust resolution when _duadp TXT proof is missing', async () => {
    resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

    await expect(
      resolveGaid('agent://duadp.org/agents/test-agent', {
        requiredTrustTier: 'verified',
      }),
    ).rejects.toThrow(DuadpError);
  });

  it('allows high-trust resolution when _duadp TXT proof is present', async () => {
    resolveTxt.mockResolvedValueOnce([['v=duadp1']]);

    const result = await resolveGaid('agent://duadp.org/agents/test-agent', {
      requiredTrustTier: 'verified',
    });

    expect(result.kind).toBe('agents');
    expect(result.name).toBe('test-agent');
    expect(result.dnsVerified).toBe(true);
  });

  it('allows verified-signature resolution without DNS requirement', async () => {
    resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await resolveGaid('agent://duadp.org/skills/web-search', {
      requiredTrustTier: 'verified-signature',
    });

    expect(result.kind).toBe('skills');
    expect(result.name).toBe('web-search');
    expect(result.dnsVerified).toBe(false);
  });
});
