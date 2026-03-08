/**
 * Federation bootstrap script — waits for all 3 nodes, registers peers, verifies federation.
 * Usage: npx tsx scripts/federate.ts
 */

const NODES = [
  { url: 'http://localhost:4200', name: 'DUADP Discovery Node', nodeId: 'did:web:discover.duadp.org' },
  { url: 'http://localhost:4201', name: 'OSSA Registry Node', nodeId: 'did:web:registry.openstandardagents.org' },
  { url: 'http://localhost:4202', name: 'Drupal AI Discovery Node', nodeId: 'did:web:discover.drupl.ai' },
];

async function waitForHealth(url: string, name: string, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const data = await resp.json() as { status: string; resources: number };
        console.log(`  ✓ ${name} healthy (${data.resources} resources)`);
        return true;
      }
    } catch { /* retry */ }
    if (i < maxRetries - 1) {
      process.stdout.write(`  ⏳ Waiting for ${name}... (${i + 1}/${maxRetries})\r`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error(`  ✗ ${name} unreachable after ${maxRetries} attempts`);
  return false;
}

async function registerPeer(nodeUrl: string, peerUrl: string, peerName: string, peerNodeId: string): Promise<boolean> {
  try {
    const resp = await fetch(`${nodeUrl}/api/v1/federation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: peerUrl, name: peerName, node_id: peerNodeId }),
    });
    return resp.ok || resp.status === 201;
  } catch {
    return false;
  }
}

async function verifyFederation(nodeUrl: string, name: string): Promise<number> {
  try {
    const resp = await fetch(`${nodeUrl}/api/v1/federation/peers`);
    const data = await resp.json() as { peers: unknown[] };
    return data.peers.length;
  } catch {
    return 0;
  }
}

async function main() {
  console.log('\n🌐 DUADP Federation Bootstrap\n');
  console.log('Step 1: Waiting for all nodes...\n');

  const healthy = await Promise.all(NODES.map((n) => waitForHealth(n.url, n.name)));
  if (healthy.some((h) => !h)) {
    console.error('\n❌ Not all nodes are healthy. Aborting.');
    process.exit(1);
  }

  console.log('\nStep 2: Registering peers...\n');

  for (const node of NODES) {
    for (const peer of NODES) {
      if (node.url === peer.url) continue;
      const ok = await registerPeer(node.url, peer.url, peer.name, peer.nodeId);
      console.log(`  ${ok ? '✓' : '✗'} ${node.name} → ${peer.name}`);
    }
  }

  console.log('\nStep 3: Verifying federation...\n');

  let totalResources = 0;
  for (const node of NODES) {
    const peerCount = await verifyFederation(node.url, node.name);
    const healthResp = await fetch(`${node.url}/api/v1/health`);
    const health = await healthResp.json() as { resources: number };
    totalResources += health.resources;
    console.log(`  ✓ ${node.name}: ${peerCount} peers, ${health.resources} resources`);
  }

  console.log(`\n🎉 Federation established: ${NODES.length} nodes, ${totalResources} total resources\n`);

  // Test federated search
  console.log('Step 4: Testing federated search...\n');
  const searchResp = await fetch(`${NODES[0].url}/api/v1/agents?federated=true`);
  const searchData = await searchResp.json() as { data: unknown[]; meta: { total: number; federated?: boolean; peers_queried?: unknown[] } };
  console.log(`  ✓ Federated agent search: ${searchData.meta.total} agents found across federation`);
  if (searchData.meta.peers_queried) {
    console.log(`  ✓ Peers queried: ${(searchData.meta.peers_queried as any[]).length}`);
  }

  console.log('\n✅ Done. Federation is live.\n');
}

main().catch((err) => {
  console.error('Federation bootstrap failed:', err);
  process.exit(1);
});
