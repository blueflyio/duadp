import { generateDidKeyIdentity, signWithDidKey, exportPublicKey, toMultibase } from '@bluefly/duadp';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args[0];

  console.log('Generating new did:key identity...');
  const identity = await generateDidKeyIdentity();
  
  console.log('\n--- generated identity ---');
  console.log('DID:         ', identity.did);
  console.log('Public Key:  ', toMultibase(identity.publicKeyRaw));
  console.log('--------------------------\n');

  if (manifestPath) {
    const fullPath = path.resolve(manifestPath);
    console.log(`Reading manifest from ${fullPath}...`);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const resource = JSON.parse(content);
      
      console.log('Signing manifest...');
      const signed = await signWithDidKey(resource, identity.privateKey, identity.did);
      
      const outPath = fullPath.replace('.json', '.signed.json');
      await fs.writeFile(outPath, JSON.stringify(signed, null, 2));
      console.log(`Signed manifest written to ${outPath}`);
    } catch (err) {
      console.error(`Failed to sign manifest: ${err}`);
      process.exit(1);
    }
  } else {
    console.log('No manifest path provided. Skipping signing step.');
    console.log('Usage: npx tsx src/tools/generate-did-key.ts <path-to-unsigned-manifest.json>');
  }
}

main().catch(console.error);
