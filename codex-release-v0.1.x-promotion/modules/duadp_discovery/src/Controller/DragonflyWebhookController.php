<?php

namespace Drupal\bluefly_agent_platform\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * Webhook controller: receives Dragonfly run completion events.
 *
 * Dragonfly POSTs to /api/agent-platform/v1/webhooks/dragonfly/run-completed
 * when a test run finishes. This controller creates an AgentRun entity to
 * bridge the two systems.
 */
class DragonflyWebhookController extends ControllerBase {

  /**
   * Handle run-completed webhook from Dragonfly.
   *
   * Expected payload:
   * {
   *   "runId": "...",
   *   "projectId": "...",
   *   "status": "completed|failed",
   *   "testTypes": ["unit", "kernel"],
   *   "duration": 45000,
   *   "results": { "totalPassed": 42, "totalFailed": 3 },
   *   "agentId": "did:ossa:drupal-test-orchestrator-001",
   *   "timestamp": "2026-03-10T20:00:00Z"
   * }
   */
  public function runCompleted(Request $request): JsonResponse {
    $payload = json_decode($request->getContent(), TRUE);

    if (empty($payload['runId'])) {
      return new JsonResponse(['error' => 'Missing runId'], 400);
    }

    // Verify webhook token
    $expected_token = \Drupal::config('bluefly_agent_platform.settings')
      ->get('dragonfly_webhook_token') ?? getenv('DRAGONFLY_WEBHOOK_TOKEN');
    $provided_token = $request->headers->get('X-Webhook-Token')
      ?? $request->headers->get('Authorization');

    if ($expected_token && $provided_token !== $expected_token && $provided_token !== 'Bearer ' . $expected_token) {
      return new JsonResponse(['error' => 'Unauthorized'], 401);
    }

    try {
      // Map Dragonfly status to AgentRun status
      $status_map = [
        'completed' => 'completed',
        'failed' => 'failed',
        'cancelled' => 'cancelled',
        'running' => 'running',
        'queued' => 'pending',
      ];

      $run_status = $status_map[$payload['status'] ?? ''] ?? 'completed';

      // Create AgentRun entity
      $storage = \Drupal::entityTypeManager()->getStorage('agent_run');
      $run = $storage->create([
        'correlation_id' => 'dragonfly:' . $payload['runId'],
        'status' => $run_status,
        'kind' => 'dragonfly_test',
        'agent_id' => $payload['agentId'] ?? 'did:ossa:drupal-test-orchestrator-001',
        'input' => json_encode([
          'projectId' => $payload['projectId'] ?? '',
          'testTypes' => $payload['testTypes'] ?? [],
          'backend' => $payload['backend'] ?? 'docker',
        ]),
        'output' => json_encode($payload['results'] ?? []),
        'cost_estimate' => $payload['costEstimate'] ?? NULL,
        'error_message' => $payload['error'] ?? NULL,
      ]);
      $run->save();

      // Also create log entries for key events
      $log_storage = \Drupal::entityTypeManager()->getStorage('agent_run_log');

      // Summary log
      $results = $payload['results'] ?? [];
      $passed = $results['totalPassed'] ?? 0;
      $failed = $results['totalFailed'] ?? 0;
      $duration_s = isset($payload['duration']) ? round($payload['duration'] / 1000) : '?';

      $log_storage->create([
        'run_id' => $run->id(),
        'sequence' => 1,
        'level' => $run_status === 'failed' ? 'error' : 'info',
        'message' => "Dragonfly run {$payload['runId']} {$run_status}: {$passed} passed, {$failed} failed in {$duration_s}s",
        'metadata' => json_encode([
          'source' => 'dragonfly_webhook',
          'dragonfly_run_id' => $payload['runId'],
          'project_id' => $payload['projectId'] ?? '',
          'duration_ms' => $payload['duration'] ?? NULL,
        ]),
      ])->save();

      // Audit findings log (if present)
      if (!empty($payload['audit'])) {
        $audit = $payload['audit'];
        $log_storage->create([
          'run_id' => $run->id(),
          'sequence' => 2,
          'level' => ($audit['summary']['error'] ?? 0) > 0 ? 'warning' : 'info',
          'message' => sprintf(
            'Audit: %d findings (%d errors, %d warnings) — catalog v%s',
            $audit['summary']['total'] ?? 0,
            $audit['summary']['error'] ?? 0,
            $audit['summary']['warning'] ?? 0,
            $audit['catalogVersion'] ?? '?'
          ),
          'metadata' => json_encode([
            'source' => 'dragonfly_audit',
            'by_dimension' => $audit['summary']['byDimension'] ?? [],
          ]),
        ])->save();
      }

      return new JsonResponse([
        'ok' => TRUE,
        'agent_run_id' => $run->id(),
        'message' => 'Run recorded.',
      ], 201);
    }
    catch (\Exception $e) {
      \Drupal::logger('bluefly_agent_platform')->error(
        'Dragonfly webhook failed: @error',
        ['@error' => $e->getMessage()]
      );
      return new JsonResponse([
        'error' => 'Failed to process webhook: ' . $e->getMessage(),
      ], 500);
    }
  }

}
