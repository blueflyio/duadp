<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\A2aClient;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
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
 * Discover a remote A2A agent by fetching its Agent Card.
 *
 * Fetches the /.well-known/agent.json endpoint from a remote A2A-compliant
 * agent and returns its Agent Card containing name, skills, capabilities,
 * and authentication requirements.
 */
#[Tool(
  id: 'ai_agents_communication:a2a_discover_agent',
  label: new TranslatableMarkup('A2A Discover Agent'),
  description: new TranslatableMarkup('Discover a remote A2A agent by fetching its Agent Card from /.well-known/agent.json. Returns the agent name, skills, capabilities, and authentication details.'),
  operation: ToolOperation::Read,
  destructive: FALSE,
  input_definitions: [
    'base_url' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Base URL'),
      description: new TranslatableMarkup('The base URL of the remote agent (e.g., https://example.com).'),
      required: TRUE,
    ),
  ],
  output_definitions: [
    'agent_card' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Agent Card'),
    ),
    'agent_name' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Agent Name'),
    ),
    'skills_count' => new ContextDefinition(
      data_type: 'integer',
      label: new TranslatableMarkup('Skills Count'),
    ),
  ],
)]
class A2aDiscoverAgent extends ToolBase implements ContainerFactoryPluginInterface {

  /**
   * The A2A client service.
   */
  protected A2aClient $a2aClient;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->a2aClient = $container->get('ai_agents_communication.a2a_client');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $baseUrl = (string) ($values['base_url'] ?? '');

    if (empty($baseUrl)) {
      return ExecutableResult::failure(new TranslatableMarkup('Base URL is required.'));
    }

    try {
      $agentCard = $this->a2aClient->discoverAgent($baseUrl);

      if ($agentCard === NULL) {
        return ExecutableResult::failure(
          new TranslatableMarkup('No A2A agent found at @url.', ['@url' => $baseUrl])
        );
      }

      $cardJson = json_encode($agentCard->jsonSerialize(), JSON_PRETTY_PRINT);
      $skills = $agentCard->skills ?? [];

      return ExecutableResult::success(
        new TranslatableMarkup('Discovered A2A agent "@name" at @url with @count skills.', [
          '@name' => $agentCard->name,
          '@url' => $baseUrl,
          '@count' => count($skills),
        ]),
        [
          'agent_card' => $cardJson,
          'agent_name' => $agentCard->name,
          'skills_count' => count($skills),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('A2A discovery failed for @url: @error', [
          '@url' => $baseUrl,
          '@error' => $e->getMessage(),
        ])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'access a2a endpoint');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
