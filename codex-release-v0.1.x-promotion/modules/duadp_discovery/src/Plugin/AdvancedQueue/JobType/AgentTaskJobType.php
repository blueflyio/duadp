<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\AdvancedQueue\JobType;

use Drupal\advancedqueue\Attribute\AdvancedQueueJobType;
use Drupal\advancedqueue\Job;
use Drupal\advancedqueue\JobResult;
use Drupal\advancedqueue\Plugin\AdvancedQueue\JobType\JobTypeBase;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Processes agent tasks via Advanced Queue.
 *
 * Replaces the core QueueWorker for persistence, retries, and scheduling.
 */
#[AdvancedQueueJobType(
  id: "agent_task",
  label: new TranslatableMarkup("Agent Task"),
  max_retries: 3,
  retry_delay: 30,
  allow_duplicates: TRUE,
)]
class AgentTaskJobType extends JobTypeBase {

  /**
   * The logger.
   *
   * @var \Drupal\Core\Logger\LoggerChannelInterface
   */
  protected $logger;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = new static($configuration, $plugin_id, $plugin_definition);
    $instance->logger = $container->get('logger.factory')->get('ai_agents_client');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function process(Job $job): JobResult {
    $payload = $job->getPayload();
    $task_type = $payload['task_type'] ?? 'unknown';
    $agent_id = $payload['agent_id'] ?? 'unknown';

    $this->logger->info('Processing agent task: type=@type agent=@agent', [
      '@type' => $task_type,
      '@agent' => $agent_id,
    ]);

    return JobResult::success();
  }

}
