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
}

export interface P2PNode {
  /** Publish an agent manifest to the mesh */
  publishAgent: (manifest: Record<string, unknown>) => Promise<void>;
  /** Subscribe to agent publish events */
  onAgentPublished: (handler: (manifest: Record<string, unknown>, peerId: string) => void) => void;
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

// ─── Factory ────────────────────────────────────────────────────

export async function createP2PNode(config: P2PConfig = {}): Promise<P2PNode> {
  const port = config.port ?? DEFAULT_PORT;
  const publishTopic = config.publishTopic ?? PUBLISH_TOPIC;

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
      }),
      dht: kadDHT({
        clientMode: false,
      }),
    } as any,
    peerDiscovery: bootstrapConfig,
  });

  const pubsub = node.services.pubsub as ReturnType<typeof gossipsub> extends (...args: any[]) => infer R ? R : never;

  // Subscribe to agent publish topic
  await (pubsub as any).subscribe(publishTopic);

  const handlers: Array<(manifest: Record<string, unknown>, peerId: string) => void> = [];

  // Listen for incoming published agents
  (pubsub as any).addEventListener('gossipsub:message', (evt: any) => {
    const { msg } = evt.detail;
    if (msg.topic === publishTopic) {
      try {
        const manifest = JSON.parse(new TextDecoder().decode(msg.data));
        const peerId = evt.detail.propagationSource?.toString() ?? 'unknown';
        for (const handler of handlers) {
          handler(manifest, peerId);
        }
      } catch {
        // Ignore malformed messages
      }
    }
  });

  return {
    async publishAgent(manifest: Record<string, unknown>) {
      const encoded = new TextEncoder().encode(JSON.stringify(manifest));
      await (pubsub as any).publish(publishTopic, encoded);
    },

    onAgentPublished(handler) {
      handlers.push(handler);
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
