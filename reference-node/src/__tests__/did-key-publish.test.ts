import { generateDidKeyIdentity, signWithDidKey } from '@bluefly/duadp';

const mockAgent = {
  apiVersion: 'ossa/v0.4',
  kind: 'Agent',
  metadata: {
    name: 'test-did-signer',
    version: '1.0.0',
    description: 'A test agent signed with an ephemeral did:key',
    trust_tier: 'verified-signature',
  },
  spec: {
    system_prompt: 'You are a test agent',
  }
};

async function main() {
  const nodeUrl = process.env.DUADP_NODE || 'http://localhost:4200';
  
  console.log('1. Generating ephemeral did:key...');
  const identity = await generateDidKeyIdentity();
  console.log(`   DID: ${identity.did}`);

  console.log('\n2. Signing test agent manifest...');
  const signedManifest = await signWithDidKey(mockAgent as any, identity.privateKey, identity.did);
  console.log('   Agent signed successfully.');

  console.log(`\n3. Publishing to DUADP node at ${nodeUrl}...`);
  try {
    const resp = await fetch(`${nodeUrl}/api/v1/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedManifest)
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text}`);
    }

    const result = await resp.json();
    console.log(`   Publish successful (Status: 201)`);
    
    const verifiedTier = result.verified_tier || result.resource?.metadata?.trust_tier;
    console.log(`   Verified Trust Tier: ${verifiedTier}`);

    if (verifiedTier === 'verified-signature') {
        console.log('\n✅ SUCCESS: Node successfully verified the did:key signature and upgraded the trust tier!');
    } else {
        console.error(`\n❌ ERROR: Node did not grant verified-signature tier (got: ${verifiedTier})`);
        process.exit(1);
    }

  } catch (err) {
    console.error('\n❌ Failed to publish or verify:', err);
    process.exit(1);
  }
}

main().catch(console.error);
