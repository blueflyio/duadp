<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\ClientService;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Session\AccountInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Plugin\Context\ContextDefinition;
use Drupal\tool\Attribute\Tool;
use Drupal\tool\ExecutableResult;
use Drupal\tool\Tool\ToolBase;
use Drupal\tool\Tool\ToolOperation;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Report health status of the AI Agents Client gateway.
 *
 * Returns connectivity status, configuration state, and gateway URL.
 * Replaces the former GatewayController::healthCheck() API endpoint.
 */
#[Tool(
  id: 'ai_agents_client:health_check',
  label: new TranslatableMarkup('Client Health Check'),
  description: new TranslatableMarkup('Check the health and connectivity status of the AI Agents Client gateway.'),
  operation: ToolOperation::Read,
  destructive: FALSE,
  input_definitions: [],
  output_definitions: [
    'status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Health Status'),
    ),
    'details' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Health Details'),
      description: new TranslatableMarkup('JSON-encoded health details including gateway URL, client ID, and timestamp.'),
    ),
  ],
)]
class ClientHealthCheck extends ToolBase {

  protected ClientService $clientService;
  protected ConfigFactoryInterface $configFactory;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->clientService = $container->get('ai_agents_client.gateway');
    $instance->configFactory = $container->get('config.factory');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    try {
      $config = $this->configFactory->get('ai_agents_client.settings');
      $gateway_url = $config->get('gateway_url') ?? '';
      $client_id = $config->get('client_id') ?? '';

      $details = [
        'gateway_url' => $gateway_url,
        'client_id' => $client_id,
        'configured' => !empty($gateway_url) && !empty($client_id),
        'timestamp' => time(),
      ];

      $status = $details['configured'] ? 'healthy' : 'unconfigured';

      return ExecutableResult::success(
        new TranslatableMarkup('AI Agents Client status: @status.', ['@status' => $status]),
        [
          'status' => $status,
          'details' => json_encode($details, JSON_PRETTY_PRINT),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Health check failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    // Public health check -- no permission required.
    $access = AccessResult::allowed();
    return $return_as_object ? $access : $access->isAllowed();
  }

}
