import { Router } from 'express';
import type Database from 'better-sqlite3';

const startTime = Date.now();

export function createGovernanceRouter(db: Database.Database, nodeName: string): Router {
  const router = Router();

  // GET /api/v1/health
  router.get('/api/v1/health', (_req, res) => {
    const skills = (db.prepare("SELECT COUNT(*) as cnt FROM resources WHERE kind = 'Skill'").get() as { cnt: number }).cnt;
    const agents = (db.prepare("SELECT COUNT(*) as cnt FROM resources WHERE kind = 'Agent'").get() as { cnt: number }).cnt;
    const tools = (db.prepare("SELECT COUNT(*) as cnt FROM resources WHERE kind = 'Tool'").get() as { cnt: number }).cnt;

    res.json({
      status: 'healthy',
      version: '0.2.0',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      resources: { skills, agents, tools },
      node_name: nodeName,
    });
  });

  // GET /api/v1/governance
  router.get('/api/v1/governance', (_req, res) => {
    const row = db.prepare('SELECT data FROM governance WHERE id = 1').get() as { data: string } | undefined;
    if (!row) {
      res.json({
        compliance_frameworks: ['NIST AI RMF 1.0'],
        risk_tolerance: 'moderate',
        data_classification: 'internal',
      });
      return;
    }
    res.json(JSON.parse(row.data));
  });

  // GET /api/v1/audit
  router.get('/api/v1/audit', (req, res) => {
    const conditions: string[] = [];
    const binds: unknown[] = [];

    if (req.query.event_type) {
      conditions.push('event_type = ?');
      binds.push(req.query.event_type);
    }
    if (req.query.gaid) {
      conditions.push('gaid = ?');
      binds.push(req.query.gaid);
    }
    if (req.query.since) {
      conditions.push('created_at >= ?');
      binds.push(req.query.since);
    }
    if (req.query.until) {
      conditions.push('created_at <= ?');
      binds.push(req.query.until);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const offset = (page - 1) * limit;

    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM audit_log ${where}`).get(...binds) as { cnt: number };
    const rows = db
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...binds, limit, offset) as Array<{
        id: number;
        event_type: string;
        gaid: string | null;
        actor: string | null;
        detail: string | null;
        created_at: string;
      }>;

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        event_type: r.event_type,
        gaid: r.gaid,
        actor: r.actor,
        detail: r.detail ? JSON.parse(r.detail) : null,
        created_at: r.created_at,
      })),
      meta: {
        total: countRow.cnt,
        page,
        limit,
        node_name: nodeName,
      },
    });
  });

  // POST /api/v1/feedback
  router.post('/api/v1/feedback', (req, res) => {
    const { target_gaid, source, source_id, dimensions, comment } = req.body ?? {};

    if (!target_gaid || !source || !dimensions) {
      res.status(400).json({ error: 'Missing required fields: target_gaid, source, dimensions' });
      return;
    }

    const result = db
      .prepare(
        'INSERT INTO feedback (target_gaid, source, source_id, dimensions, comment) VALUES (?, ?, ?, ?, ?)',
      )
      .run(target_gaid, source, source_id ?? null, JSON.stringify(dimensions), comment ?? null);

    db.prepare(
      'INSERT INTO audit_log (event_type, gaid, actor, detail) VALUES (?, ?, ?, ?)',
    ).run('feedback.submitted', target_gaid, source_id ?? source, JSON.stringify({ dimensions }));

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  });

  // GET /api/v1/feedback/:agentId
  router.get('/api/v1/feedback/:agentId', (req, res) => {
    const agentId = req.params.agentId;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const offset = (page - 1) * limit;

    const countRow = db
      .prepare('SELECT COUNT(*) as cnt FROM feedback WHERE target_gaid = ?')
      .get(agentId) as { cnt: number };

    const rows = db
      .prepare('SELECT * FROM feedback WHERE target_gaid = ? ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(agentId, limit, offset) as Array<{
        id: number;
        target_gaid: string;
        source: string;
        source_id: string | null;
        dimensions: string;
        comment: string | null;
        created_at: string;
      }>;

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        target_gaid: r.target_gaid,
        source: r.source,
        source_id: r.source_id,
        dimensions: JSON.parse(r.dimensions),
        comment: r.comment,
        created_at: r.created_at,
      })),
      meta: {
        total: countRow.cnt,
        page,
        limit,
        node_name: nodeName,
      },
    });
  });

  // GET /api/v1/reputation/:agentId
  router.get('/api/v1/reputation/:agentId', (req, res) => {
    const agentId = req.params.agentId;

    const rows = db
      .prepare('SELECT dimensions FROM feedback WHERE target_gaid = ?')
      .all(agentId) as Array<{ dimensions: string }>;

    if (rows.length === 0) {
      res.json({
        agent_gaid: agentId,
        overall_score: 0,
        feedback_count: 0,
        dimension_averages: {},
        computed_at: new Date().toISOString(),
      });
      return;
    }

    const totals: Record<string, { sum: number; count: number }> = {};

    for (const row of rows) {
      const dims = JSON.parse(row.dimensions) as Record<string, number>;
      for (const [key, val] of Object.entries(dims)) {
        if (typeof val === 'number') {
          if (!totals[key]) totals[key] = { sum: 0, count: 0 };
          totals[key].sum += val;
          totals[key].count += 1;
        }
      }
    }

    const averages: Record<string, number> = {};
    let overallSum = 0;
    let overallCount = 0;

    for (const [key, { sum, count }] of Object.entries(totals)) {
      const avg = sum / count;
      averages[key] = Math.round(avg * 100) / 100;
      overallSum += avg;
      overallCount += 1;
    }

    const overallScore = overallCount > 0 ? Math.round((overallSum / overallCount) * 100) / 100 : 0;

    res.json({
      agent_gaid: agentId,
      overall_score: overallScore,
      feedback_count: rows.length,
      dimension_averages: averages,
      computed_at: new Date().toISOString(),
    });
  });

  // POST /api/v1/analytics/tokens
  router.post('/api/v1/analytics/tokens', (req, res) => {
    const { agent_gaid, input_tokens, output_tokens, total_tokens, model, task_type, success, cost_usd } =
      req.body ?? {};

    if (!agent_gaid || input_tokens == null || output_tokens == null || total_tokens == null) {
      res.status(400).json({
        error: 'Missing required fields: agent_gaid, input_tokens, output_tokens, total_tokens',
      });
      return;
    }

    const result = db
      .prepare(
        'INSERT INTO token_usage (agent_gaid, input_tokens, output_tokens, total_tokens, model, task_type, success, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        agent_gaid,
        input_tokens,
        output_tokens,
        total_tokens,
        model ?? null,
        task_type ?? null,
        success ?? 1,
        cost_usd ?? null,
      );

    db.prepare(
      'INSERT INTO audit_log (event_type, gaid, actor, detail) VALUES (?, ?, ?, ?)',
    ).run('analytics.token_recorded', agent_gaid, 'system', JSON.stringify({ total_tokens, model }));

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  });

  // GET /api/v1/analytics/tokens/:agentId
  router.get('/api/v1/analytics/tokens/:agentId', (req, res) => {
    const agentId = req.params.agentId;
    const period = (req.query.period as string) || 'all';

    let dateFilter = '';
    if (period === 'day') {
      dateFilter = "AND created_at >= datetime('now', '-1 day')";
    } else if (period === 'week') {
      dateFilter = "AND created_at >= datetime('now', '-7 days')";
    } else if (period === 'month') {
      dateFilter = "AND created_at >= datetime('now', '-30 days')";
    }

    const agg = db
      .prepare(
        `SELECT
          COUNT(*) as request_count,
          SUM(total_tokens) as total_tokens,
          SUM(cost_usd) as total_cost,
          AVG(total_tokens) as avg_per_request,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count
        FROM token_usage
        WHERE agent_gaid = ? ${dateFilter}`,
      )
      .get(agentId) as {
        request_count: number;
        total_tokens: number | null;
        total_cost: number | null;
        avg_per_request: number | null;
        success_count: number;
      };

    const byModel = db
      .prepare(
        `SELECT
          model,
          COUNT(*) as count,
          SUM(total_tokens) as tokens,
          SUM(cost_usd) as cost
        FROM token_usage
        WHERE agent_gaid = ? ${dateFilter}
        GROUP BY model`,
      )
      .all(agentId) as Array<{
        model: string | null;
        count: number;
        tokens: number;
        cost: number | null;
      }>;

    const modelBreakdown: Record<string, { count: number; tokens: number; cost: number | null }> = {};
    for (const row of byModel) {
      modelBreakdown[row.model ?? 'unknown'] = {
        count: row.count,
        tokens: row.tokens,
        cost: row.cost,
      };
    }

    res.json({
      agent_gaid: agentId,
      period,
      request_count: agg.request_count,
      total_tokens: agg.total_tokens ?? 0,
      total_cost: agg.total_cost != null ? Math.round(agg.total_cost * 10000) / 10000 : 0,
      avg_per_request: agg.avg_per_request != null ? Math.round(agg.avg_per_request) : 0,
      success_rate:
        agg.request_count > 0
          ? Math.round((agg.success_count / agg.request_count) * 100) / 100
          : 0,
      by_model: modelBreakdown,
    });
  });

  // POST /api/v1/attestations
  router.post('/api/v1/attestations', (req, res) => {
    const { agent_gaid, task_id, outcome, attestor, attestor_did, signature, metrics } =
      req.body ?? {};

    if (!agent_gaid || !task_id || !outcome || !attestor) {
      res.status(400).json({
        error: 'Missing required fields: agent_gaid, task_id, outcome, attestor',
      });
      return;
    }

    const result = db
      .prepare(
        'INSERT INTO attestations (agent_gaid, task_id, outcome, attestor, attestor_did, signature, metrics) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        agent_gaid,
        task_id,
        outcome,
        attestor,
        attestor_did ?? null,
        signature ?? null,
        metrics ? JSON.stringify(metrics) : null,
      );

    db.prepare(
      'INSERT INTO audit_log (event_type, gaid, actor, detail) VALUES (?, ?, ?, ?)',
    ).run('attestation.created', agent_gaid, attestor, JSON.stringify({ task_id, outcome }));

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  });

  // GET /api/v1/attestations/:agentId
  router.get('/api/v1/attestations/:agentId', (req, res) => {
    const agentId = req.params.agentId;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const offset = (page - 1) * limit;

    const countRow = db
      .prepare('SELECT COUNT(*) as cnt FROM attestations WHERE agent_gaid = ?')
      .get(agentId) as { cnt: number };

    const rows = db
      .prepare('SELECT * FROM attestations WHERE agent_gaid = ? ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(agentId, limit, offset) as Array<{
        id: number;
        agent_gaid: string;
        task_id: string;
        outcome: string;
        attestor: string;
        attestor_did: string | null;
        signature: string | null;
        metrics: string | null;
        created_at: string;
      }>;

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        agent_gaid: r.agent_gaid,
        task_id: r.task_id,
        outcome: r.outcome,
        attestor: r.attestor,
        attestor_did: r.attestor_did,
        signature: r.signature,
        metrics: r.metrics ? JSON.parse(r.metrics) : null,
        created_at: r.created_at,
      })),
      meta: {
        total: countRow.cnt,
        page,
        limit,
        node_name: nodeName,
      },
    });
  });

  // GET /api/v1/search
  router.get('/api/v1/search', (req, res) => {
    const q = req.query.q as string;
    const kind = req.query.kind as string | undefined;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);

    if (!q) {
      res.status(400).json({ error: 'Missing required query parameter: q' });
      return;
    }

    const conditions: string[] = ["(name LIKE ? OR json_extract(data, '$.metadata.description') LIKE ?)"];
    const binds: unknown[] = [`%${q}%`, `%${q}%`];

    if (kind) {
      conditions.push('kind = ?');
      binds.push(kind);
    }

    const where = conditions.join(' AND ');

    const rows = db
      .prepare(`SELECT kind, name, data FROM resources WHERE ${where} ORDER BY id ASC LIMIT ?`)
      .all(...binds, limit) as Array<{ kind: string; name: string; data: string }>;

    // Compute facets
    const facets: Record<string, number> = {};
    for (const row of rows) {
      facets[row.kind] = (facets[row.kind] || 0) + 1;
    }

    res.json({
      data: rows.map((r) => ({
        kind: r.kind,
        name: r.name,
        resource: JSON.parse(r.data),
      })),
      facets,
      total: rows.length,
      query: q,
    });
  });

  return router;
}
