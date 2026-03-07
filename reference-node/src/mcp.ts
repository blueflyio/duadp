import { DuadpClient, resolveGaid } from '@bluefly/duadp';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from 'express';
import { z } from "zod";

export function createMcpRouter(baseUrl: string) {
  const router = express.Router();

  // Creates a dedicated DUADP client aimed at this very reference node
  const client = new DuadpClient(baseUrl);

  // Factory: registers all 17 DUADP tools on a fresh McpServer instance
  function createServer(): McpServer {
    const server = new McpServer({
      name: "DUADP Discovery MCP",
      version: "1.0.0"
    });

    // 1. duadp_discover -> client.discover()
    server.tool("duadp_discover", "Get node discovery manifest", {}, async () => {
      const res = await client.discover();
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
      };
    });

    // 2. duadp_search_agents -> client.listAgents()
    server.tool(
      "duadp_search_agents",
      "Browse registered agents",
      {
        page: z.number().optional().describe("Pagination page number"),
        limit: z.number().optional().describe("Max results per page")
      },
      async (params) => {
        const res = await client.listAgents(params);
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
        };
      }
    );

    // 3. duadp_search_skills -> client.listSkills()
    server.tool(
      "duadp_search_skills",
      "Find available skills",
      {
        search: z.string().optional().describe("Search query filter"),
        page: z.number().optional(),
        limit: z.number().optional()
      },
      async (params) => {
        const res = await client.listSkills(params);
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
        };
      }
    );

    // 4. duadp_search_tools -> client.listTools()
    server.tool(
      "duadp_search_tools",
      "List published tools",
      {
        protocol: z.string().optional().describe("Filter by protocol (e.g., mcp, http)"),
        page: z.number().optional()
      },
      async (params) => {
        const res = await client.listTools(params as any);
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
        };
      }
    );

    // 5. duadp_search -> client.search()
    server.tool(
      "duadp_search",
      "Full-text search across all DUADP resources",
      {
        q: z.string().describe("Search query string"),
        federated: z.boolean().optional().describe("Whether to search peers recursively")
      },
      async (params) => {
        const res = await client.search(params);
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
        };
      }
    );

    // 6. duadp_resolve_gaid -> client.resolveGaid() via WebFinger
    server.tool(
      "duadp_resolve_gaid",
      "Resolve GAID URI via WebFinger",
      {
        gaid: z.string().describe("The agent:// or uadp:// global agent identifier URI")
      },
      async ({ gaid }) => {
        const res = await resolveGaid(gaid);
        return {
          content: [{ type: "text", text: JSON.stringify({ kind: res.kind, name: res.name }, null, 2) }]
        };
      }
    );

    // 7. duadp_publish -> POST /api/v1/publish
    server.tool(
      "duadp_publish",
      "Publish agent, skill, or tool into DUADP",
      {
        manifest: z.string().describe("Stringified JSON representation of the OSSA manifest payload to publish")
      },
      async ({ manifest }) => {
        try {
          const payload = JSON.parse(manifest);
          const res = await client.publish(payload);
          return {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
          };
        }
      }
    );

    // 8. duadp_validate -> POST /api/v1/validate
    server.tool(
      "duadp_validate",
      "Validate OSSA manifest JSON",
      {
        manifest: z.string().describe("Stringified JSON OSSA manifest to validate")
      },
      async ({ manifest }) => {
        try {
          const payload = JSON.parse(manifest);
          const res = await client.validate(payload);
          return {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
          };
        }
      }
    );

    // 9. duadp_federation_peers -> client.getFederation()
    server.tool(
      "duadp_federation_peers",
      "List federated peers gossiping in the DUADP network",
      {},
      async () => {
        const res = await client.getFederation();
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
        };
      }
    );

    // ---------------------------------------------------------------------------
    // NIST AI RMF Governance Tools — discoverable safety & trust via MCP
    // ---------------------------------------------------------------------------

    // 10. duadp_governance -> GET /api/v1/governance
    server.tool(
      "duadp_governance",
      "Get node governance policies (NIST AI RMF compliance, risk tolerance, data classification)",
      {},
      async () => {
        const res = await fetch(`${baseUrl}/api/v1/governance`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    );

    // 11. duadp_audit_log -> GET /api/v1/audit
    server.tool(
      "duadp_audit_log",
      "Query the immutable audit log for agent actions, publications, and governance events",
      {
        event_type: z.string().optional().describe("Filter by event type (e.g., 'publish', 'feedback.submitted')"),
        gaid: z.string().optional().describe("Filter by agent GAID"),
        since: z.string().optional().describe("ISO date — only events after this timestamp"),
        limit: z.number().optional().describe("Max results (default 50, max 100)")
      },
      async (params) => {
        const qs = new URLSearchParams();
        if (params.event_type) qs.set('event_type', params.event_type);
        if (params.gaid) qs.set('gaid', params.gaid);
        if (params.since) qs.set('since', params.since);
        if (params.limit) qs.set('limit', String(params.limit));
        const res = await fetch(`${baseUrl}/api/v1/audit?${qs}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    );

    // 12. duadp_agent_reputation -> GET /api/v1/reputation/:agentId
    server.tool(
      "duadp_agent_reputation",
      "Get computed reputation score for an agent (multi-dimensional trust scoring)",
      {
        agent_gaid: z.string().describe("The agent GAID to look up reputation for")
      },
      async ({ agent_gaid }) => {
        const res = await fetch(`${baseUrl}/api/v1/reputation/${encodeURIComponent(agent_gaid)}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    );

    // 13. duadp_submit_attestation -> POST /api/v1/attestations
    server.tool(
      "duadp_submit_attestation",
      "Submit a cryptographic attestation for an agent task outcome (DID-signed proof of work)",
      {
        agent_gaid: z.string().describe("GAID of the agent being attested"),
        task_id: z.string().describe("Unique task identifier"),
        outcome: z.enum(["success", "failure", "partial", "timeout"]).describe("Task outcome"),
        attestor: z.string().describe("Identity of the attestor (agent name or DID)"),
        attestor_did: z.string().optional().describe("DID of the attestor for verification"),
        signature: z.string().optional().describe("Cryptographic signature"),
        metrics: z.record(z.string(), z.number()).optional().describe("Key-value metrics (e.g., {latency_ms: 234, tokens: 1500})")
      },
      async (params) => {
        const res = await fetch(`${baseUrl}/api/v1/attestations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    );

    // 14. duadp_get_attestations -> GET /api/v1/attestations/:agentId
    server.tool(
      "duadp_get_attestations",
      "Get attestation history for an agent — verifiable proof of task outcomes",
      {
        agent_gaid: z.string().describe("GAID of the agent"),
        limit: z.number().optional().describe("Max results")
      },
      async ({ agent_gaid, limit }) => {
        const qs = limit ? `?limit=${limit}` : '';
        const res = await fetch(`${baseUrl}/api/v1/attestations/${encodeURIComponent(agent_gaid)}${qs}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    );

    // 15. duadp_submit_feedback -> POST /api/v1/feedback
    server.tool(
      "duadp_submit_feedback",
      "Submit multi-dimensional feedback for an agent (quality, safety, reliability, helpfulness)",
      {
        target_gaid: z.string().describe("GAID of the agent being reviewed"),
        source: z.string().describe("Source identifier (human, agent, CI pipeline)"),
        source_id: z.string().optional().describe("Unique ID of the source entity"),
        dimensions: z.record(z.string(), z.number()).describe("Scores 0-5 (e.g., {safety: 5, quality: 4, reliability: 4.5})"),
        comment: z.string().optional().describe("Free-text feedback")
      },
      async (params) => {
        const res = await fetch(`${baseUrl}/api/v1/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    );

    // 16. duadp_token_analytics -> GET /api/v1/analytics/tokens/:agentId
    server.tool(
      "duadp_token_analytics",
      "Get token usage analytics for an agent (cost, model breakdown, success rates)",
      {
        agent_gaid: z.string().describe("GAID of the agent"),
        period: z.enum(["day", "week", "month", "all"]).optional().describe("Time period filter")
      },
      async ({ agent_gaid, period }) => {
        const qs = period ? `?period=${period}` : '';
        const res = await fetch(`${baseUrl}/api/v1/analytics/tokens/${encodeURIComponent(agent_gaid)}${qs}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    );

    // 17. duadp_health -> GET /api/v1/health
    server.tool(
      "duadp_health",
      "Check node health, uptime, and resource counts",
      {},
      async () => {
        const res = await fetch(`${baseUrl}/api/v1/health`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    );

    return server;
  }

  // Map to hold active Server-Sent Events transports by session ID
  const activeTransports = new Map<string, SSEServerTransport>();

  // Expose the MCP SSE interface — each connection gets its own McpServer
  router.get("/", async (req, res) => {
    const sessionId = Math.random().toString(36).substring(7);
    const transport = new SSEServerTransport(`/mcp/messages?sessionId=${sessionId}`, res);
    const server = createServer();

    activeTransports.set(sessionId, transport);
    await server.connect(transport);

    res.on("close", () => {
      activeTransports.delete(sessionId);
    });
  });

  router.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = activeTransports.get(sessionId);

    if (!transport) {
      res.status(404).json({ error: "Session not found or disconnected" });
      return;
    }

    try {
      await transport.handlePostMessage(req, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  return router;
}
