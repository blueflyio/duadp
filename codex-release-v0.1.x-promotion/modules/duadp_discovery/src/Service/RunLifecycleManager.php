<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\bluefly_agent_platform\Entity\AgentRun;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Component\Datetime\TimeInterface;
use Psr\Log\LoggerInterface;

/**
 * Manages run lifecycle transitions with validation.
 *
 * State machine:
 *   queued → running → waiting_approval → succeeded
 *                    → succeeded (if auto-approved)
 *                    → failed
 *   any active state → canceled
 *
 * @see \Drupal\bluefly_agent_platform\Entity\AgentRun
 */
class RunLifecycleManager {

  /**
   * Valid state transitions.
   *
   * @var array<string, string[]>
   */
  protected const TRANSITIONS = [
    AgentRun::STATUS_QUEUED => [
      AgentRun::STATUS_RUNNING,
      AgentRun::STATUS_CANCELED,
      AgentRun::STATUS_FAILED,
    ],
    AgentRun::STATUS_RUNNING => [
      AgentRun::STATUS_WAITING_APPROVAL,
      AgentRun::STATUS_SUCCEEDED,
      AgentRun::STATUS_FAILED,
      AgentRun::STATUS_CANCELED,
    ],
    AgentRun::STATUS_WAITING_APPROVAL => [
      AgentRun::STATUS_RUNNING,
      AgentRun::STATUS_FAILED,
      AgentRun::STATUS_CANCELED,
    ],
  ];

  /**
   * Terminal states — no transitions allowed from these.
   */
  protected const TERMINAL = [
    AgentRun::STATUS_SUCCEEDED,
    AgentRun::STATUS_FAILED,
    AgentRun::STATUS_CANCELED,
  ];

  /**
   * Constructs a RunLifecycleManager.
   */
  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
    protected LoggerInterface $logger,
    protected TimeInterface $time,
  ) {}

  /**
   * Transitions a run to a new status.
   *
   * @param \Drupal\bluefly_agent_platform\Entity\AgentRun $run
   *   The run entity.
   * @param string $newStatus
   *   The target status.
   * @param array<string, mixed> $context
   *   Additional context: 'error', 'output', 'approval_state', 'reviewer'.
   *
   * @return \Drupal\bluefly_agent_platform\Entity\AgentRun
   *   The updated run entity.
   *
   * @throws \InvalidArgumentException
   *   If the transition is not valid.
   */
  public function transition(AgentRun $run, string $newStatus, array $context = []): AgentRun {
    $currentStatus = $run->getStatus();

    // Validate the transition.
    if (in_array($currentStatus, self::TERMINAL, TRUE)) {
      throw new \InvalidArgumentException(
        "Cannot transition from terminal state '$currentStatus'."
      );
    }

    $allowed = self::TRANSITIONS[$currentStatus] ?? [];
    if (!in_array($newStatus, $allowed, TRUE)) {
      throw new \InvalidArgumentException(
        "Invalid transition: '$currentStatus' → '$newStatus'. Allowed: " . implode(', ', $allowed)
      );
    }

    // Apply transition.
    $run->setStatus($newStatus);

    // Set timestamps.
    $now = $this->time->getRequestTime();
    if ($newStatus === AgentRun::STATUS_RUNNING && !$run->get('started_at')->value) {
      $run->set('started_at', $now);
    }
    if (in_array($newStatus, self::TERMINAL, TRUE)) {
      $run->set('finished_at', $now);
    }

    // Apply context.
    if (isset($context['error'])) {
      $run->set('error', $context['error']);
    }
    if (isset($context['output'])) {
      $run->set('output', is_string($context['output']) ? $context['output'] : json_encode($context['output']));
    }
    if (isset($context['approval_state'])) {
      $run->set('approval_state', $context['approval_state']);
    }
    if (isset($context['cost_tokens'])) {
      $run->set('cost_tokens', $context['cost_tokens']);
    }
    if (isset($context['provider'])) {
      $run->set('provider', $context['provider']);
    }

    $run->save();

    // Log the transition.
    $this->logTransition($run, $currentStatus, $newStatus, $context);

    $this->logger->info('Run @uuid transitioned: @from → @to', [
      '@uuid' => $run->uuid(),
      '@from' => $currentStatus,
      '@to' => $newStatus,
    ]);

    return $run;
  }

  /**
   * Starts a run (queued → running).
   */
  public function start(AgentRun $run): AgentRun {
    return $this->transition($run, AgentRun::STATUS_RUNNING);
  }

  /**
   * Requests approval (running → waiting_approval).
   */
  public function requestApproval(AgentRun $run): AgentRun {
    return $this->transition($run, AgentRun::STATUS_WAITING_APPROVAL, [
      'approval_state' => AgentRun::APPROVAL_PENDING,
    ]);
  }

  /**
   * Approves a run (waiting_approval → running).
   */
  public function approve(AgentRun $run, string $reviewer = 'unknown'): AgentRun {
    return $this->transition($run, AgentRun::STATUS_RUNNING, [
      'approval_state' => AgentRun::APPROVAL_APPROVED,
      'reviewer' => $reviewer,
    ]);
  }

  /**
   * Rejects a run (waiting_approval → failed).
   */
  public function reject(AgentRun $run, string $reason = 'Rejected', string $reviewer = 'unknown'): AgentRun {
    return $this->transition($run, AgentRun::STATUS_FAILED, [
      'approval_state' => AgentRun::APPROVAL_REJECTED,
      'error' => $reason,
      'reviewer' => $reviewer,
    ]);
  }

  /**
   * Completes a run successfully (running → succeeded).
   *
   * @param \Drupal\bluefly_agent_platform\Entity\AgentRun $run
   *   The run entity.
   * @param mixed $output
   *   The run output.
   * @param int|null $costTokens
   *   Optional token cost.
   */
  public function complete(AgentRun $run, mixed $output = NULL, ?int $costTokens = NULL): AgentRun {
    $context = [];
    if ($output !== NULL) {
      $context['output'] = $output;
    }
    if ($costTokens !== NULL) {
      $context['cost_tokens'] = $costTokens;
    }
    return $this->transition($run, AgentRun::STATUS_SUCCEEDED, $context);
  }

  /**
   * Fails a run (running → failed).
   */
  public function fail(AgentRun $run, string $error, ?int $retryCount = NULL): AgentRun {
    $context = ['error' => $error];
    if ($retryCount !== NULL) {
      $run->set('retry_count', $retryCount);
    }
    return $this->transition($run, AgentRun::STATUS_FAILED, $context);
  }

  /**
   * Cancels a run (any active → canceled).
   */
  public function cancel(AgentRun $run, string $reason = 'Canceled by user.'): AgentRun {
    return $this->transition($run, AgentRun::STATUS_CANCELED, [
      'error' => $reason,
    ]);
  }

  /**
   * Logs a state transition to AgentRunLog.
   */
  protected function logTransition(AgentRun $run, string $from, string $to, array $context): void {
    try {
      $logStorage = $this->entityTypeManager->getStorage('agent_run_log');

      // Get next sequence number.
      $query = $logStorage->getQuery()
        ->accessCheck(FALSE)
        ->condition('run_id', $run->id())
        ->sort('seq', 'DESC')
        ->range(0, 1);
      $ids = $query->execute();
      $lastLog = $ids ? $logStorage->load(reset($ids)) : NULL;
      $nextSeq = $lastLog ? ($lastLog->getSeq() + 1) : 1;

      $logEntry = $logStorage->create([
        'run_id' => $run->id(),
        'seq' => $nextSeq,
        'level' => in_array($to, [AgentRun::STATUS_FAILED, AgentRun::STATUS_CANCELED]) ? 'error' : 'info',
        'message' => "State transition: $from → $to",
        'approval_event' => $context['approval_state'] ?? NULL,
        'metadata' => json_encode(array_filter([
          'reviewer' => $context['reviewer'] ?? NULL,
          'error' => $context['error'] ?? NULL,
        ])),
      ]);
      $logEntry->save();
    }
    catch (\Exception) {
      // Log failure should not break the lifecycle.
    }
  }

}
