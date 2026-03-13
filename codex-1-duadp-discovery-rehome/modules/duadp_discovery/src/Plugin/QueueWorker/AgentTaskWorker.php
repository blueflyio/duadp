<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\QueueWorker;

use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Queue\Attribute\QueueWorker;
use Drupal\Core\Queue\QueueWorkerBase;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Processes agent tasks (core queue).
 *
 * @deprecated in ai_agents_client:1.x and will be removed in a future release.
 *   Use Advanced Queue and AgentTaskJobType instead. SubmitAgentTask now
 *   enqueues via advancedqueue (agent_tasks queue, agent_task job type) for
 *   persistence, retries, and scheduling.
 *
 * @see \Drupal\bluefly_agent_platform\Plugin\AdvancedQueue\JobType\AgentTaskJobType
 */
#[QueueWorker(
  id: 'ai_agents_client_tasks',
  title: new TranslatableMarkup('Agent Task Worker'),
  cron: ['time' => 30],
)]
class AgentTaskWorker extends QueueWorkerBase implements ContainerFactoryPluginInterface {

  /**
   * The logger service.
   *
   * @var \Drupal\Core\Logger\LoggerChannelInterface
   */
  protected $logger;

  /**
   * Constructs a new AgentTaskWorker object.
   *
   * @param array $configuration
   *   A configuration array containing information about the plugin instance.
   * @param string $plugin_id
   *   The plugin_id for the plugin instance.
   * @param mixed $plugin_definition
   *   The plugin implementation definition.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $loggerFactory
   *   The logger channel factory.
   */
  public function __construct(array $configuration, $plugin_id, $plugin_definition, LoggerChannelFactoryInterface $loggerFactory) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
    $this->logger = $loggerFactory->get('ai_agents_client');
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('logger.factory')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function processItem($data): void {
    $this->logger->info('Processing queued task: @id', ['@id' => $data['task_id'] ?? 'unknown']);
  }

}
