<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Hook;

use Drupal\bluefly_agent_platform\Service\ClientService;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Hook\Attribute\Hook;
use Drupal\Core\Logger\LoggerChannelInterface;
use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\Core\State\StateInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Drupal\Component\Datetime\TimeInterface;

/**
 * Hook implementations for ai_agents_client.
 */
class AiAgentsClientHooks {
  use StringTranslationTrait;

  /**
   * Constructs an AiAgentsClientHooks object.
   */
  public function __construct(
    protected readonly ConfigFactoryInterface $configFactory,
    protected readonly StateInterface $state,
    protected readonly TimeInterface $time,
    protected readonly ClientService $gateway,
    protected readonly LoggerChannelInterface $logger,
  ) {}

  /**
   * Implements hook_help().
   */
  #[Hook('help')]
  public function help(string $route_name, RouteMatchInterface $_route_match): string {
    switch ($route_name) {
      case 'help.page.ai_agents_client':
        $output = '';
        $output .= '<h3>' . $this->t('About') . '</h3>';
        $output .= '<p>' . $this->t('The AI Agents Client module provides a gateway for interacting with remote AI agent platforms. It enables communication with external agent systems, task submission, and capability discovery.') . '</p>';
        $output .= '<h3>' . $this->t('Configuration') . '</h3>';
        $output .= '<p>' . $this->t('Configure the client settings at <a href=":url">AI Agents Client Settings</a>.', [':url' => '/admin/config/ai/agents/client']) . '</p>';
        $output .= '<h3>' . $this->t('Features') . '</h3>';
        $output .= '<ul>';
        $output .= '<li>' . $this->t('Remote agent gateway communication') . '</li>';
        $output .= '<li>' . $this->t('Task submission and status tracking') . '</li>';
        $output .= '<li>' . $this->t('Agent capability discovery') . '</li>';
        $output .= '<li>' . $this->t('Health monitoring and diagnostics') . '</li>';
        $output .= '</ul>';
        return $output;

      default:
        return '';
    }
  }

  /**
   * Implements hook_cron().
   */
  #[Hook('cron')]
  public function cron(): void {
    $config = $this->configFactory->get('ai_agents_client.settings');

    if (!$config->get('enable_cron_sync')) {
      return;
    }

    $lastSync = $this->state->get('ai_agents_client.last_sync', 0);
    $syncInterval = (int) ($config->get('sync_interval') ?? 3600);

    if (($this->time->getRequestTime() - $lastSync) < $syncInterval) {
      return;
    }

    try {
      $this->gateway->syncAgents();
      $this->state->set('ai_agents_client.last_sync', $this->time->getRequestTime());
      $this->logger->info('AI agents synchronized successfully.');
    }
    catch (\Exception $e) {
      $this->logger->error('Agent sync failed: @message', [
        '@message' => $e->getMessage(),
      ]);
    }
  }

  /**
   * Implements hook_theme().
   */
  #[Hook('theme')]
  public function theme(): array {
    return [
      'ai_agents_client_dashboard' => [
        'variables' => [
          'agents' => [],
          'statistics' => [],
        ],
        'template' => 'ai-agents-client-dashboard',
      ],
      'ai_agents_client_task_status' => [
        'variables' => [
          'task' => NULL,
          'status' => 'pending',
          'result' => NULL,
        ],
        'template' => 'ai-agents-client-task-status',
      ],
    ];
  }

}
