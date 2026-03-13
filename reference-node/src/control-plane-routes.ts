import express from 'express';
import { AgentCreateRequest, RunCreateRequest } from './control-plane-schemas.js';

export function createControlPlaneRouter() {
  const router = express.Router();

  // POST /api/v1/agents -> Create agent (OSSA manifest as source of truth)
  router.post('/agents', (req, res) => {
    try {
      const validated = AgentCreateRequest.parse(req.body);
      
      // In a full implementation, this would save to the DB and push to the mesh.
      // For now, we mock the success response defined in the OpenAPI spec.
      res.status(201).json({
        id: crypto.randomUUID(),
        name: (validated.ossa_manifest as any).metadata?.name || 'unnamed-agent',
        ossa_manifest: validated.ossa_manifest,
        drupal_config_entity: null,
        status: 'enabled',
        created_at: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
  });

  // GET /api/v1/agents -> List agents
  router.get('/agents', (req, res) => {
    res.status(200).json({
      data: [],
      meta: { count: 0 }
    });
  });

  // POST /api/v1/runs -> Start a run
  router.post('/runs', (req, res) => {
    try {
      const validated = RunCreateRequest.parse(req.body);

      // In a full implementation, this would dispatch to a CLI/MCP worker queue.
      res.status(202).json({
        id: crypto.randomUUID(),
        status: 'queued',
        workflow_id: null,
        agent_id: null,
        created_at: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
  });

  return router;
}
