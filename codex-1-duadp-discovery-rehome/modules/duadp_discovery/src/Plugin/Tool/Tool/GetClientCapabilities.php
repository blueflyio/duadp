<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\DiscoveryService;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\Session\AccountInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Plugin\Context\ContextDefinition;
use Drupal\tool\Attribute\Tool;
use Drupal\tool\ExecutableResult;
use Drupal\tool\Tool\ToolBase;
use Drupal\tool\Tool\ToolOperation;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Report the capabilities this AI Agents Client site exposes.
 *
 * Returns supported task types, protocols, and available integrations.
 * Replaces the former GatewayController::getCapabilities() API endpoint.
 */
#[Tool(
  id: 'ai_agents_client:get_capabilities',
  label: new TranslatableMarkup('Get Client Capabilities'),
  description: new TranslatableMarkup('Get the capabilities and supported task types of this AI Agents Client site.'),
  operation: ToolOperation::Read,
  destructive: FALSE,
  input_definitions: [],
  output_definitions: [
    'capabilities' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Capabilities'),
      description: new TranslatableMarkup('JSON-encoded capabilities including supported protocols, task types, and integrations.'),
    ),
  ],
)]
class GetClientCapabilities extends ToolBase {

  protected DiscoveryService $discoveryService;
  protected ConfigFactoryInterface $configFactory;
  protected ModuleHandlerInterface $moduleHandler;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->discoveryService = $container->get('ai_agents_client.discovery');
    $instance->configFactory = $container->get('config.factory');
    $instance->moduleHandler = $container->get('module_handler');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    try {
      $manifest = $this->discoveryService->getManifest();
      $config = $this->configFactory->get('ai_agents_client.settings');

      $capabilities = [
        'site_id' => $config->get('client_id') ?? '',
        'protocols' => ['http', 'mcp'],
        'supported_task_types' => [
          'content_generation',
          'content_moderation',
          'data_analysis',
          'code_review',
          'translation',
        ],
        'modules' => count($manifest['modules'] ?? []),
        'entity_types' => count($manifest['entities'] ?? []),
        'ai_enabled' => $this->moduleHandler->moduleExists('ai'),
        'ossa_enabled' => $this->moduleHandler->moduleExists('ai_agents_ossa'),
        'timestamp' => time(),
      ];

      return ExecutableResult::success(
        new TranslatableMarkup('Client capabilities retrieved: @modules modules, @entities entity types.', [
          '@modules' => $capabilities['modules'],
          '@entities' => $capabilities['entity_types'],
        ]),
        [
          'capabilities' => json_encode($capabilities, JSON_PRETTY_PRINT),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Failed to retrieve capabilities: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    // Public capabilities endpoint -- no permission required.
    $access = AccessResult::allowed();
    return $return_as_object ? $access : $access->isAllowed();
  }

}
