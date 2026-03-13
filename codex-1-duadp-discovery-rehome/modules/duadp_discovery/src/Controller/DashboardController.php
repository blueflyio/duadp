<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Controller;

use Drupal\Core\Controller\ControllerBase;

/**
 * Controller for AI Agents Client Dashboard.
 */
class DashboardController extends ControllerBase {

  /**
   * Returns the dashboard page.
   *
   * @return array
   *   A render array for the dashboard.
   */
  public function index(): array {
    $config = $this->config('ai_agents_client.settings');
    $gateway_url = $config->get('gateway_url') ?? '';

    return [
      '#theme' => 'agent_client_dashboard',
      '#site_id' => $config->get('client_id'),
      '#gateway_url' => $gateway_url,
      '#status' => 'connected',
      '#attached' => [
        'drupalSettings' => [
          'aiAgentsClient' => [
            'gatewayUrl' => $gateway_url,
          ],
        ],
      ],
    ];
  }

}
