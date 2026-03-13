/**
 * End-to-End Pipeline Demo Script
 * Demonstrates the full "Agent Internet Stack" flow discovering and using the 3 OSSA-native agents.
 *
 * Usage:
 *   npx tsx scripts/demo-e2e-pipeline.ts
 */

const DUADP_NODE = process.env.DUADP_NODE_URL || 'https://discover.duadp.org';

async function fetchAgent(name: string) {
  const res = await fetch(`${DUADP_NODE}/api/v1/agents/${name}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch ${name}: ${res.statusText}`);
  }
  return res.json();
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log('================================================================');
  console.log('   OSSA AGENT INTERNET STACK: End-to-End Execution Pipeline');
  console.log('================================================================\n');

  console.log(`[1] Connecting to DUADP Discovery Node at ${DUADP_NODE}...`);
  await delay(1000);

  // 1. Discover drupal-contributor
  console.log('\n[2] Discovering "drupal-contributor" agent...');
  const drupalAgent = await fetchAgent('drupal-contributor');
  if (!drupalAgent) {
    console.error('❌ Failed to discover drupal-contributor. Is it registered?');
    process.exit(1);
  }
  console.log(`  ✅ Found Agent: ${drupalAgent.metadata.name} (v${drupalAgent.metadata.version})`);
  console.log(`     Trust Tier:  ${drupalAgent.metadata.trust_tier}`);
  console.log(`     Endpoint:    ${drupalAgent.identity?.operational?.endpoint}`);
  console.log(`     Capabilities: ${drupalAgent.spec.tools.join(', ')}`);

  // 2. Discover security-audit-agent
  console.log('\n[3] Discovering "security-audit-agent"...');
  const securityAgent = await fetchAgent('security-audit-agent');
  if (!securityAgent) {
    console.error('❌ Failed to discover security-audit-agent.');
    process.exit(1);
  }
  console.log(`  ✅ Found Agent: ${securityAgent.metadata.name} (v${securityAgent.metadata.version})`);
  console.log(`     Trust Tier:  ${securityAgent.metadata.trust_tier}`);
  console.log(`     Capabilities: ${securityAgent.spec.capabilities.join(', ')}`);

  // 3. Discover gitlab-ci-agent
  console.log('\n[4] Discovering "gitlab-ci-agent"...');
  const gitlabAgent = await fetchAgent('gitlab-ci-agent');
  if (!gitlabAgent) {
    console.error('❌ Failed to discover gitlab-ci-agent.');
    process.exit(1);
  }
  console.log(`  ✅ Found Agent: ${gitlabAgent.metadata.name} (v${gitlabAgent.metadata.version})`);
  console.log(`     Endpoint:    ${gitlabAgent.identity?.operational?.endpoint}`);

  console.log('\n================================================================');
  console.log('   SIMULATING PIPELINE EXECUTION');
  console.log('================================================================\n');

  console.log(`▶ Step 1: Triggering ${drupalAgent.metadata.name}...`);
  await delay(1500);
  console.log(`  [drupal-contributor] Identifying open issues on Drupal.org...`);
  await delay(1000);
  console.log(`  [drupal-contributor] Checking out issue 3456789...`);
  await delay(1500);
  console.log(`  [drupal-contributor] Writing fix and committing to MR!`);
  await delay(1000);

  console.log(`\n▶ Step 2: Triggering ${securityAgent.metadata.name}...`);
  await delay(1500);
  console.log(`  [security-audit-agent] Analyzing new code in MR #1337...`);
  await delay(1200);
  console.log(`  [security-audit-agent] Running PHPStan and SAST via Dragonfly...`);
  await delay(1500);
  console.log(`  [security-audit-agent] All security checks passed!`);
  await delay(1000);

  console.log(`\n▶ Step 3: Triggering ${gitlabAgent.metadata.name}...`);
  await delay(1500);
  console.log(`  [gitlab-ci-agent] Monitoring GitLab Pipeline #99421...`);
  await delay(1200);
  console.log(`  [gitlab-ci-agent] Pipeline completed successfully. Safe to merge!`);
  
  console.log('\n🎉 Pipeline complete! The Agent Internet Stack is operational.');
}

runDemo().catch(err => console.error(err));
