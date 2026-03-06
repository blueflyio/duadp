import { DuadpClient, resolveGaid } from '@bluefly/duadp';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from 'express';
import { z } from "zod";

export function createMcpRouter(baseUrl: string) {
  const router = express.Router();

  // Creates a dedicated DUADP client aimed at this very reference node
  const client = new DuadpClient(baseUrl);

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
        // Just return the resolved name/kind structure as endpoints might be in the client or manifest
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
      // NOTE: Normally requires authentication, but demonstrating shape
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

  // Map to hold active Server-Sent Events transports by session ID
  const activeTransports = new Map<string, SSEServerTransport>();

  // Expose the MCP Streamable HTTP interface
  router.get("/", async (req, res) => {
    // A stable but unique session ID is generated per stream
    const sessionId = Math.random().toString(36).substring(7);
    const transport = new SSEServerTransport(`/mcp/messages?sessionId=${sessionId}`, res);

    activeTransports.set(sessionId, transport);
    await server.connect(transport);

    // Cleanup on disconnect
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
