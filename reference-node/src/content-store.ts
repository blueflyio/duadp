/**
 * Content-addressable manifest storage using Helia (IPFS).
 *
 * Every OSSA manifest gets a CID (content hash). Manifests become permanently
 * addressable by their content, not their location. Any node that pins a
 * manifest can serve it.
 *
 * This module wraps Helia's JSON storage to provide a simple put/get interface
 * for OSSA manifests identified by CID.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface ContentStore {
  /** Store a manifest and return its CID */
  put: (manifest: Record<string, unknown>) => Promise<string>;
  /** Retrieve a manifest by CID */
  get: (cid: string) => Promise<Record<string, unknown> | null>;
  /** Check if a CID exists locally */
  has: (cid: string) => Promise<boolean>;
  /** Get stats */
  stats: () => { storedCount: number };
  /** Shutdown */
  stop: () => Promise<void>;
}

// ─── Helia Implementation ───────────────────────────────────────

export async function createContentStore(): Promise<ContentStore> {
  try {
    const { createHelia } = await import('helia');
    const { json } = await import('@helia/json');

    const helia = await createHelia();
    const j = json(helia);

    const cidCache = new Map<string, Record<string, unknown>>();
    let storedCount = 0;

    return {
      async put(manifest) {
        const cid = await j.add(manifest);
        const cidStr = cid.toString();
        cidCache.set(cidStr, manifest);
        storedCount++;
        return cidStr;
      },

      async get(cidStr) {
        if (cidCache.has(cidStr)) {
          return cidCache.get(cidStr)!;
        }
        try {
          const { CID } = await import('multiformats/cid');
          const cid = CID.parse(cidStr);
          const data = await j.get(cid);
          return data as Record<string, unknown>;
        } catch {
          return null;
        }
      },

      async has(cidStr) {
        return cidCache.has(cidStr);
      },

      stats() {
        return { storedCount };
      },

      async stop() {
        await helia.stop();
      },
    };
  } catch (err) {
    console.warn('Helia init failed, using in-memory content store:', (err as Error).message);
    return createInMemoryStore();
  }
}

// ─── In-Memory Fallback ─────────────────────────────────────────

function createInMemoryStore(): ContentStore {
  const store = new Map<string, Record<string, unknown>>();
  let counter = 0;

  return {
    async put(manifest) {
      const content = JSON.stringify(manifest);
      // Simple hash for deterministic CID-like key
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
      }
      const cidStr = `bafy-mem-${Math.abs(hash).toString(36)}-${counter++}`;
      store.set(cidStr, manifest);
      return cidStr;
    },

    async get(cidStr) {
      return store.get(cidStr) ?? null;
    },

    async has(cidStr) {
      return store.has(cidStr);
    },

    stats() {
      return { storedCount: store.size };
    },

    async stop() {
      store.clear();
    },
  };
}
