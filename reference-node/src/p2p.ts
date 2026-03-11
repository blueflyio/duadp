/**
 * P2P networking layer for DUADP using libp2p.
 *
 * Provides:
 * - GossipSub for real-time agent publish/discover propagation
 * - Kademlia DHT for serverless peer discovery
 * - TCP transport with peer identification
 *
 * Replaces the HTTP fan-out in federation.ts with a proper gossip mesh.
 */

import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { identify } from '@libp2p/identify';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { ping } from '@libp2p/ping';

// ─── Types ──────────────────────────────────────────────────────

export interface P2PConfig {
  /** TCP port for libp2p (default: 4201) */
  port?: number;
  /** Bootstrap peer multiaddrs */
  bootstrapPeers?: string[];
  /** GossipSub topic for agent publish events */
  publishTopic?: string;
  /** GossipSub topic for agent query broadcasts */
  queryTopic?: string;
  /** GossipSub topic for Yjs CRDT state synchronization */
  syncTopic?: string;
}

export interface P2PNode {
  /** Publish an agent manifest to the mesh */
  publishAgent: (manifest: Record<string, unknown>) => Promise<void>;
  /** Subscribe to agent publish events */
  onAgentPublished: (handler: (manifest: Record<string, unknown>, peerId: string) => void) => void;
  /** Broadcast CRDT state update to the mesh */
  syncState: (update: Uint8Array) => Promise<void>;
  /** Subscribe to CRDT state updates */
  onSyncState: (handler: (update: Uint8Array, peerId: string) => void) => void;
  /** Get connected peer count */
  getPeerCount: () => number;
  /** Get this node's peer ID */
  getPeerId: () => string;
  /** Get this node's multiaddrs */
  getMultiaddrs: () => string[];
  /** Gracefully shut down */
  stop: () => Promise<void>;
}

// ─── Constants ──────────────────────────────────────────────────

const DEFAULT_PORT = 4201;
const PUBLISH_TOPIC = 'duadp/agents/publish/1.0.0';
const SYNC_TOPIC = 'duadp/crdt/sync/1.0.0';

// ─── Factory ────────────────────────────────────────────────────

export async function createP2PNode(config: P2PConfig = {}): Promise<P2PNode> {
  const port = config.port ?? DEFAULT_PORT;
  const publishTopic = config.publishTopic ?? PUBLISH_TOPIC;
  const syncTopic = config.syncTopic ?? SYNC_TOPIC;

  const bootstrapConfig = config.bootstrapPeers?.length
    ? [bootstrap({ list: config.bootstrapPeers })]
    : [];

  const node = await createLibp2p({
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}`],
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    // NOTE: cast to any because libp2p core and standalone packages
    // bundle different versions of @libp2p/interface, causing type mismatches.
    // This is safe — the runtime behavior is correct.
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub({
        emitSelf: false,
        fallbackToFloodsub: true,
        allowPublishToZeroTopicPeers: true,
      }),
      dht: kadDHT({
        clientMode: false,
      }),
    } as any,
    peerDiscovery: bootstrapConfig,
  });

  const pubsub = node.services.pubsub as ReturnType<typeof gossipsub> extends (...args: any[]) => infer R ? R : never;

  // Subscribe to topics
  await (pubsub as any).subscribe(publishTopic);
  await (pubsub as any).subscribe(syncTopic);

  const publishHandlers: Array<(manifest: Record<string, unknown>, peerId: string) => void> = [];
  const syncHandlers: Array<(update: Uint8Array, peerId: string) => void> = [];

  // Listen for incoming messages
  (pubsub as any).addEventListener('gossipsub:message', (evt: any) => {
    const { msg } = evt.detail;
    const peerId = evt.detail.propagationSource?.toString() ?? 'unknown';

    console.log(`[P2P Debug] Received pubsub topic=${msg.topic} from ${peerId} length=${msg.data?.length}`);

    if (msg.topic === publishTopic) {
      try {
        const manifest = JSON.parse(new TextDecoder().decode(msg.data));
        for (const handler of publishHandlers) {
          handler(manifest, peerId);
        }
      } catch (err) {
        console.error('[P2P Debug] Failed to parse agent manifest:', err);
      }
    } else if (msg.topic === syncTopic) {
      for (const handler of syncHandlers) {
        handler(msg.data, peerId);
      }
    }
  });

  return {
    async publishAgent(manifest: Record<string, unknown>) {
      const encoded = new TextEncoder().encode(JSON.stringify(manifest));
      let retries = 5;
      while (retries > 0) {
        try {
          await (pubsub as any).publish(publishTopic, encoded);
          return; // Success
        } catch (err: any) {
          if (err.message && err.message.includes('NoPeersSubscribedToTopic')) {
            console.warn(`[P2P] No peers subscribed yet. Retrying in 2s... (${retries} left)`);
            retries--;
            await new Promise(r => setTimeout(r, 2000));
          } else {
            console.error('[P2P] Failed to publish agent:', err);
            throw err;
          }
        }
      }
      console.warn('[P2P] Gave up publishing agent via GossipSub. Will sync via CRDT later.');
    },

    onAgentPublished(handler) {
      publishHandlers.push(handler);
    },

    async syncState(update: Uint8Array) {
      try {
        await (pubsub as any).publish(syncTopic, update);
      } catch (err: any) {
        if (!err.message?.includes('NoPeersSubscribedToTopic')) {
          console.error('[P2P] Failed to broadcast CRDT sync:', err);
        }
      }
    },

    onSyncState(handler) {
      syncHandlers.push(handler);
    },

    getPeerCount() {
      return node.getPeers().length;
    },

    getPeerId() {
      return node.peerId.toString();
    },

    getMultiaddrs() {
      return node.getMultiaddrs().map((ma) => ma.toString());
    },

    async stop() {
      await node.stop();
    },
  };
}
