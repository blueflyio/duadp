<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\DiscoveryService;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Session\AccountInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Plugin\Context\ContextDefinition;
use Drupal\tool\Attribute\Tool;
use Drupal\tool\ExecutableResult;
use Drupal\tool\Tool\ToolBase;
use Drupal\tool\Tool\ToolOperation;
use Drupal\tool\TypedData\InputDefinition;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Discover site capabilities and available agent services.
 */
#[Tool(
  id: 'ai_agents_client:discover_services',
  label: new TranslatableMarkup('Discover Agent Services'),
  description: new TranslatableMarkup('Discover available AI agent services, site capabilities (modules, entities, system info) through the orchestration client discovery service.'),
  operation: ToolOperation::Read,
  destructive: FALSE,
  input_definitions: [
    'include_counts' => new InputDefinition(
      data_type: 'boolean',
      label: new TranslatableMarkup('Include Entity Counts'),
      description: new TranslatableMarkup('Whether to include entity counts in the manifest. Default: true.'),
    ),
  ],
  output_definitions: [
    'manifest' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Site Manifest'),
    ),
    'module_count' => new ContextDefinition(
      data_type: 'integer',
      label: new TranslatableMarkup('Module Count'),
    ),
  ],
)]
class DiscoverAgentServices extends ToolBase {

  protected DiscoveryService $discoveryService;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->discoveryService = $container->get('ai_agents_client.discovery');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    try {
      $manifest = $this->discoveryService->getManifest();

      return ExecutableResult::success(
        new TranslatableMarkup('Discovered @count modules and @entities entity types.', [
          '@count' => count($manifest['modules'] ?? []),
          '@entities' => count($manifest['entities'] ?? []),
        ]),
        [
          'manifest' => json_encode($manifest, JSON_PRETTY_PRINT),
          'module_count' => count($manifest['modules'] ?? []),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Service discovery failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'administer ai agents client');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
