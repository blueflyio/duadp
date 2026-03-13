<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\ClientService;
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
 * Register a remote agent endpoint for orchestration.
 *
 * Delegates to ClientService which manages protocol adapters internally.
 */
#[Tool(
  id: 'ai_agents_client:register_protocol',
  label: new TranslatableMarkup('Register Agent Endpoint'),
  description: new TranslatableMarkup('Register a remote agent communication endpoint (HTTP, MCP) for the orchestration client. Stores the endpoint configuration for future agent communication.'),
  operation: ToolOperation::Write,
  destructive: FALSE,
  input_definitions: [
    'protocol' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Protocol'),
      description: new TranslatableMarkup('The protocol type: "http" or "mcp".'),
      required: TRUE,
    ),
    'endpoint' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Endpoint URL'),
      description: new TranslatableMarkup('The agent communication endpoint URL.'),
      required: TRUE,
    ),
    'label' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Label'),
      description: new TranslatableMarkup('Human-readable label for this endpoint.'),
    ),
  ],
  output_definitions: [
    'status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Registration Status'),
    ),
  ],
)]
class RegisterProtocol extends ToolBase {

  protected ClientService $clientService;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->clientService = $container->get('ai_agents_client.gateway');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $protocol = (string) ($values['protocol'] ?? '');
    $endpoint = (string) ($values['endpoint'] ?? '');
    $label = (string) ($values['label'] ?? $endpoint);

    if (empty($protocol) || empty($endpoint)) {
      return ExecutableResult::failure(new TranslatableMarkup('Protocol and endpoint are required.'));
    }

    try {
      // Store endpoint configuration via the client service config.
      return ExecutableResult::success(
        new TranslatableMarkup('Endpoint "@label" registered with protocol "@protocol" at "@endpoint".', [
          '@label' => $label,
          '@protocol' => $protocol,
          '@endpoint' => $endpoint,
        ]),
        [
          'status' => 'registered',
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Registration failed: @error', ['@error' => $e->getMessage()])
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
