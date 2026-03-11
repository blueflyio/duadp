/**
 * CRDT-based agent registry using Yjs.
 *
 * Provides conflict-free replicated state for the agent registry.
 * Each node maintains a local replica; changes propagate via GossipSub
 * and merge automatically without conflicts.
 *
 * This replaces the current SQLite-on-each-node model (no cross-node sync)
 * with an eventually consistent, conflict-free replicated registry.
 */

import * as Y from 'yjs';

// ─── Types ──────────────────────────────────────────────────────

export interface CRDTRegistry {
  /** Add or update a resource */
  put: (kind: string, name: string, data: Record<string, unknown>) => void;
  /** Get a resource by kind and name */
  get: (kind: string, name: string) => Record<string, unknown> | null;
  /** Delete a resource */
  delete: (kind: string, name: string) => boolean;
  /** List all resources of a kind */
  list: (kind: string) => Array<Record<string, unknown>>;
  /** Search across all resources */
  search: (query: string) => Array<Record<string, unknown>>;
  /** Get the Yjs document (for sync) */
  getDoc: () => Y.Doc;
  /** Get encoded state for sync */
  getState: () => Uint8Array;
  /** Apply remote state update */
  applyUpdate: (update: Uint8Array) => void;
  /** Subscribe to changes */
  onChange: (handler: (event: { kind: string; name: string; action: 'add' | 'update' | 'delete' }) => void) => void;
  /** Get stats */
  stats: () => { totalResources: number; kinds: Record<string, number> };
}

// ─── Implementation ─────────────────────────────────────────────

export function createCRDTRegistry(): CRDTRegistry {
  const doc = new Y.Doc();
  // Top-level shared map: kind -> Y.Map<name -> Y.Map<data>>
  const registry = doc.getMap('registry');
  const changeHandlers: Array<(event: { kind: string; name: string; action: 'add' | 'update' | 'delete' }) => void> = [];

  function getKindMap(kind: string): Y.Map<unknown> {
    let kindMap = registry.get(kind) as Y.Map<unknown> | undefined;
    if (!kindMap) {
      kindMap = new Y.Map();
      registry.set(kind, kindMap);
    }
    return kindMap;
  }

  function yMapToObject(map: Y.Map<unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    map.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  return {
    put(kind, name, data) {
      const kindMap = getKindMap(kind);
      const existing = kindMap.has(name);
      const entry = new Y.Map<unknown>();
      for (const key of Object.keys(data)) {
        entry.set(key, data[key]);
      }
      entry.set('_updatedAt', Date.now());
      kindMap.set(name, entry);

      for (const handler of changeHandlers) {
        handler({ kind, name, action: existing ? 'update' : 'add' });
      }
    },

    get(kind, name) {
      const kindMap = registry.get(kind) as Y.Map<unknown> | undefined;
      if (!kindMap) return null;
      const entry = kindMap.get(name) as Y.Map<unknown> | undefined;
      if (!entry) return null;
      return yMapToObject(entry);
    },

    delete(kind, name) {
      const kindMap = registry.get(kind) as Y.Map<unknown> | undefined;
      if (!kindMap || !kindMap.has(name)) return false;
      kindMap.delete(name);
      for (const handler of changeHandlers) {
        handler({ kind, name, action: 'delete' });
      }
      return true;
    },

    list(kind) {
      const kindMap = registry.get(kind) as Y.Map<unknown> | undefined;
      if (!kindMap) return [];
      const results: Array<Record<string, unknown>> = [];
      kindMap.forEach((value) => {
        if (value instanceof Y.Map) {
          results.push(yMapToObject(value));
        }
      });
      return results;
    },

    search(query) {
      const q = query.toLowerCase();
      const results: Array<Record<string, unknown>> = [];

      registry.forEach((kindMap) => {
        if (!(kindMap instanceof Y.Map)) return;
        kindMap.forEach((entry) => {
          if (!(entry instanceof Y.Map)) return;
          const data = yMapToObject(entry);
          const text = JSON.stringify(data).toLowerCase();
          if (text.includes(q)) {
            results.push(data);
          }
        });
      });

      return results;
    },

    getDoc() {
      return doc;
    },

    getState() {
      return Y.encodeStateAsUpdate(doc);
    },

    applyUpdate(update) {
      Y.applyUpdate(doc, update);
    },

    onChange(handler) {
      changeHandlers.push(handler);
    },

    stats() {
      const kinds: Record<string, number> = {};
      let total = 0;

      registry.forEach((kindMap, kind) => {
        if (kindMap instanceof Y.Map) {
          const count = kindMap.size;
          kinds[kind] = count;
          total += count;
        }
      });

      return { totalResources: total, kinds };
    },
  };
}
