<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Controller;

use Drupal\bluefly_agent_platform\Entity\AgentRun;
use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * REST controller for Run lifecycle endpoints.
 */
class RunApiController extends ControllerBase {

  /**
   * Constructs a RunApiController.
   */
  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
    protected mixed $serializer,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('serializer'),
    );
  }

  /**
   * GET /api/v1/runs — List runs.
   */
  public function list(Request $request): JsonResponse {
    $storage = $this->entityTypeManager->getStorage('agent_run');
    $query = $storage->getQuery()->accessCheck(TRUE);

    // Filters.
    $status = $request->query->get('status');
    if ($status) {
      $query->condition('status', $status);
    }

    $agentId = $request->query->get('agent_id');
    if ($agentId) {
      $query->condition('agent_id', $agentId);
    }

    $flowId = $request->query->get('flow_id');
    if ($flowId) {
      $query->condition('flow_id', $flowId);
    }

    // Count before pagination.
    $countQuery = clone $query;
    $total = $countQuery->count()->execute();

    // Pagination.
    $limit = min((int) ($request->query->get('limit', 20)), 100);
    $offset = max((int) ($request->query->get('offset', 0)), 0);
    $query->range($offset, $limit);
    $query->sort('created', 'DESC');

    $ids = $query->execute();
    $runs = $ids ? $storage->loadMultiple($ids) : [];

    $data = [];
    foreach ($runs as $run) {
      $data[] = $this->serializer->normalize($run, 'json');
    }

    return new JsonResponse([
      'data' => $data,
      'meta' => [
        'count' => (int) $total,
        'limit' => $limit,
        'offset' => $offset,
      ],
    ]);
  }

  /**
   * GET /api/v1/runs/{run_id} — Get run.
   */
  public function get(string $run_id): JsonResponse {
    $run = $this->loadRunByUuid($run_id);
    if (!$run) {
      return new JsonResponse(['error' => "Run '$run_id' not found"], 404);
    }

    return new JsonResponse(
      $this->serializer->normalize($run, 'json'),
    );
  }

  /**
   * GET /api/v1/runs/{run_id}/logs — Get run logs.
   */
  public function logs(Request $request, string $run_id): JsonResponse {
    $run = $this->loadRunByUuid($run_id);
    if (!$run) {
      return new JsonResponse(['error' => "Run '$run_id' not found"], 404);
    }

    $logStorage = $this->entityTypeManager->getStorage('agent_run_log');
    $query = $logStorage->getQuery()
      ->accessCheck(TRUE)
      ->condition('run_id', $run->id())
      ->sort('seq', 'ASC');

    $after = $request->query->get('after');
    if ($after !== NULL) {
      $query->condition('seq', (int) $after, '>');
    }

    $limit = min((int) ($request->query->get('limit', 100)), 500);
    $query->range(0, $limit);

    $ids = $query->execute();
    $logs = $ids ? $logStorage->loadMultiple($ids) : [];

    $data = [];
    $lastSeq = 0;
    foreach ($logs as $log) {
      /** @var \Drupal\bluefly_agent_platform\Entity\AgentRunLog $log */
      $seq = $log->getSeq();
      $data[] = [
        'seq' => $seq,
        'level' => $log->getLevel(),
        'message' => $log->getMessage(),
        'tool_call' => $log->get('tool_call')->value,
        'approval_event' => $log->get('approval_event')->value,
        'metadata' => $log->get('metadata')->value ? json_decode($log->get('metadata')->value, TRUE) : NULL,
        'timestamp' => date('c', (int) $log->get('created')->value),
      ];
      if ($seq > $lastSeq) {
        $lastSeq = $seq;
      }
    }

    return new JsonResponse([
      'data' => $data,
      'meta' => [
        'count' => count($data),
        'last_seq' => $lastSeq,
      ],
    ]);
  }

  /**
   * POST /api/v1/runs/{run_id}/approve — Approve run.
   */
  public function approve(Request $request, string $run_id): JsonResponse {
    $run = $this->loadRunByUuid($run_id);
    if (!$run) {
      return new JsonResponse(['error' => "Run '$run_id' not found"], 404);
    }

    if ($run->getStatus() !== AgentRun::STATUS_WAITING_APPROVAL) {
      return new JsonResponse(
        ['error' => 'Run is not in approvable state. Current status: ' . $run->getStatus()],
        400,
      );
    }

    $data = json_decode($request->getContent(), TRUE) ?? [];
    $decision = $data['decision'] ?? 'approve';

    if ($decision === 'approve') {
      $run->setStatus(AgentRun::STATUS_RUNNING);
      $run->set('approval_state', AgentRun::APPROVAL_APPROVED);
    }
    else {
      $run->setStatus(AgentRun::STATUS_FAILED);
      $run->set('approval_state', AgentRun::APPROVAL_REJECTED);
      $run->set('error', $data['reason'] ?? 'Rejected by reviewer.');
      $run->set('finished_at', \Drupal::time()->getRequestTime());
    }

    $run->save();

    // Log the approval event.
    $this->logRunEvent($run, 'info', "Run $decision by " . ($data['reviewer'] ?? 'unknown'), $decision);

    return new JsonResponse(
      $this->serializer->normalize($run, 'json'),
    );
  }

  /**
   * POST /api/v1/runs/{run_id}/cancel — Cancel run.
   */
  public function cancel(Request $request, string $run_id): JsonResponse {
    $run = $this->loadRunByUuid($run_id);
    if (!$run) {
      return new JsonResponse(['error' => "Run '$run_id' not found"], 404);
    }

    $cancelable = [AgentRun::STATUS_QUEUED, AgentRun::STATUS_RUNNING, AgentRun::STATUS_WAITING_APPROVAL];
    if (!in_array($run->getStatus(), $cancelable, TRUE)) {
      return new JsonResponse(
        ['error' => 'Run cannot be canceled. Current status: ' . $run->getStatus()],
        400,
      );
    }

    $data = json_decode($request->getContent(), TRUE) ?? [];
    $run->setStatus(AgentRun::STATUS_CANCELED);
    $run->set('error', $data['reason'] ?? 'Canceled by user.');
    $run->set('finished_at', \Drupal::time()->getRequestTime());
    $run->save();

    return new JsonResponse(
      $this->serializer->normalize($run, 'json'),
    );
  }

  /**
   * Loads a run by UUID.
   */
  protected function loadRunByUuid(string $uuid): ?AgentRun {
    $storage = $this->entityTypeManager->getStorage('agent_run');
    $entities = $storage->loadByProperties(['uuid' => $uuid]);
    $run = reset($entities);
    return $run instanceof AgentRun ? $run : NULL;
  }

  /**
   * Logs a run event.
   */
  protected function logRunEvent(AgentRun $run, string $level, string $message, string $approvalEvent = ''): void {
    try {
      $logStorage = $this->entityTypeManager->getStorage('agent_run_log');

      // Get the next sequence number.
      $query = $logStorage->getQuery()
        ->accessCheck(FALSE)
        ->condition('run_id', $run->id())
        ->sort('seq', 'DESC')
        ->range(0, 1);
      $ids = $query->execute();
      $lastLog = $ids ? $logStorage->load(reset($ids)) : NULL;
      $nextSeq = $lastLog ? ($lastLog->getSeq() + 1) : 1;

      $log = $logStorage->create([
        'run_id' => $run->id(),
        'seq' => $nextSeq,
        'level' => $level,
        'message' => $message,
        'approval_event' => $approvalEvent ?: NULL,
      ]);
      $log->save();
    }
    catch (\Exception) {
      // Log failure should not break the approval flow.
    }
  }

}
