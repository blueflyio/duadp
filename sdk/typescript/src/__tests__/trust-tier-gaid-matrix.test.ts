/**
 * GAID Resolution Trust Tier Enforcement Tests
 *
 * Proves that high-trust GAID resolution (verified, official) fails
 * without valid DNS proof, while lower tiers (community, signed,
 * verified-signature) succeed without DNS.
 *
 * Maps to plans/05-NIST: "Agents must properly sign their manifests
 * to achieve the required verified-signature trust tier"
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DuadpError, resolveGaid, verifyDuadpDns } from '../client.js';

// Mock DNS module
const { resolveTxt } = vi.hoisted(() => ({
  resolveTxt: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  resolveTxt,
}));

describe('resolveGaid trust tier matrix', () => {
  beforeEach(() => {
    resolveTxt.mockReset();
  });

  // =========================================================================
  // Tiers that do NOT require DNS proof (rank < 4)
  // =========================================================================
  describe('low-trust tiers (community, signed, verified-signature) — no DNS required', () => {
    const LOW_TIERS = ['community', 'signed', 'verified-signature'] as const;

    for (const tier of LOW_TIERS) {
      it(`resolves agent:// URI at trust_tier="${tier}" even when DNS fails`, async () => {
        resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

        const result = await resolveGaid('agent://example.com/agents/my-agent', {
          requiredTrustTier: tier,
        });

        expect(result.kind).toBe('agents');
        expect(result.name).toBe('my-agent');
        expect(result.dnsVerified).toBe(false);
      });
    }
  });

  // =========================================================================
  // Tiers that DO require DNS proof (rank >= 4)
  // =========================================================================
  describe('high-trust tiers (verified, official) — DNS proof mandatory', () => {
    const HIGH_TIERS = ['verified', 'official'] as const;

    for (const tier of HIGH_TIERS) {
      it(`rejects agent:// URI at trust_tier="${tier}" when DNS proof is missing`, async () => {
        resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

        await expect(
          resolveGaid('agent://example.com/agents/my-agent', {
            requiredTrustTier: tier,
          }),
        ).rejects.toThrow(DuadpError);
      });

      it(`resolves agent:// URI at trust_tier="${tier}" when DNS proof IS present`, async () => {
        resolveTxt.mockResolvedValueOnce([['v=duadp1']]);

        const result = await resolveGaid('agent://example.com/agents/my-agent', {
          requiredTrustTier: tier,
        });

        expect(result.kind).toBe('agents');
        expect(result.name).toBe('my-agent');
        expect(result.dnsVerified).toBe(true);
      });
    }
  });

  // =========================================================================
  // GAID URI format validation
  // =========================================================================
  describe('GAID URI format enforcement', () => {
    it('rejects malformed GAID URIs', async () => {
      await expect(
        resolveGaid('not-a-valid-gaid'),
      ).rejects.toThrow(DuadpError);
    });

    it('parses duadp:// scheme correctly', async () => {
      resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

      const result = await resolveGaid('duadp://duadp.org/skills/web-search', {
        requiredTrustTier: 'community',
      });

      expect(result.kind).toBe('skills');
      expect(result.name).toBe('web-search');
    });

    it('resolves tools kind', async () => {
      resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

      const result = await resolveGaid('agent://registry.openstandardagents.org/tools/cedar-evaluator', {
        requiredTrustTier: 'signed',
      });

      expect(result.kind).toBe('tools');
      expect(result.name).toBe('cedar-evaluator');
    });
  });

  // =========================================================================
  // Default trust tier behavior
  // =========================================================================
  describe('default trust tier (community)', () => {
    it('defaults to community tier when no requiredTrustTier is set', async () => {
      resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

      const result = await resolveGaid('agent://duadp.org/agents/content-guardian');

      expect(result.kind).toBe('agents');
      expect(result.name).toBe('content-guardian');
      expect(result.dnsVerified).toBe(false);
    });
  });

  // =========================================================================
  // skipDnsVerification override
  // =========================================================================
describe('skipDnsVerification flag', () => {
  it('does not bypass high-trust DNS enforcement when skipDnsVerification=true', async () => {
    await expect(
      resolveGaid('agent://example.com/agents/my-agent', {
        requiredTrustTier: 'verified',
        skipDnsVerification: true,
      }),
    ).rejects.toThrow(DuadpError);

    expect(resolveTxt).not.toHaveBeenCalled();
  });
});
});

// =========================================================================
// verifyDuadpDns unit tests
// =========================================================================
describe('verifyDuadpDns', () => {
  beforeEach(() => {
    resolveTxt.mockReset();
  });

  it('returns verified=true when _duadp TXT contains v=duadp1', async () => {
    resolveTxt.mockResolvedValueOnce([['v=duadp1']]);
    const result = await verifyDuadpDns('example.com');
    expect(result.verified).toBe(true);
    expect(result.records).toContain('v=duadp1');
  });

  it('returns verified=false when _duadp TXT is present but wrong value', async () => {
    resolveTxt.mockResolvedValueOnce([['v=other-protocol']]);
    const result = await verifyDuadpDns('example.com');
    expect(result.verified).toBe(false);
  });

  it('returns verified=false + error for ENOTFOUND', async () => {
    resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const result = await verifyDuadpDns('nonexistent.example.com');
    expect(result.verified).toBe(false);
    expect(result.error).toContain('No _duadp TXT record');
  });

  it('returns verified=false + error for NXDOMAIN', async () => {
    resolveTxt.mockRejectedValueOnce(new Error('NXDOMAIN'));
    const result = await verifyDuadpDns('bad-domain.org');
    expect(result.verified).toBe(false);
    expect(result.error).toContain('No _duadp TXT record');
  });
});
