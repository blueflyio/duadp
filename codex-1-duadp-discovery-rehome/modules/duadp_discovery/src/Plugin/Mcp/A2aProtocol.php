<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\Mcp;

use Drupal\bluefly_agent_platform\Model\A2aMessage;
use Drupal\bluefly_agent_platform\Service\A2aClient;
use Drupal\bluefly_agent_platform\Service\AgentCardBuilder;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\mcp\Attribute\Mcp;
use Drupal\mcp\Plugin\McpPluginBase;
use Drupal\mcp\ServerFeatures\Tool;
use Drupal\mcp\ServerFeatures\ToolAnnotations;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * MCP plugin exposing A2A protocol operations as MCP tools.
 */
#[Mcp(
  id: 'a2a_protocol',
  name: new TranslatableMarkup('A2A Protocol'),
  description: new TranslatableMarkup(
    'Exposes Agent-to-Agent protocol operations: discover, send message, get task, cancel task.'
  ),
)]
class A2aProtocol extends McpPluginBase implements ContainerFactoryPluginInterface {

  /**
   * The A2A client.
   */
  protected A2aClient $a2aClient;

  /**
   * The agent card builder.
   */
  protected AgentCardBuilder $agentCardBuilder;

  /**
   * {@inheritdoc}
   */
  public static function create(
    ContainerInterface $container,
    array $configuration,
    $plugin_id,
    $plugin_definition,
  ) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->a2aClient = $container->get('ai_agents_communication.client');
    $instance->agentCardBuilder = $container->get('ai_agents_communication.agent_card_builder');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function getTools(): array {
    return [
      new Tool(
        name: 'a2a_discover_agent',
        description: 'Discover a remote A2A agent by fetching its Agent Card.',
        inputSchema: [
          'type' => 'object',
          'properties' => [
            'base_url' => [
              'type' => 'string',
              'description' => 'The base URL of the remote agent.',
            ],
          ],
          'required' => ['base_url'],
        ],
        annotations: new ToolAnnotations(
          title: 'Discover A2A Agent',
          readOnlyHint: TRUE,
          idempotentHint: TRUE,
          destructiveHint: FALSE,
          openWorldHint: TRUE,
        ),
      ),
      new Tool(
        name: 'a2a_send_message',
        description: 'Send a message to a remote A2A agent.',
        inputSchema: [
          'type' => 'object',
          'properties' => [
            'endpoint_url' => [
              'type' => 'string',
              'description' => 'The A2A endpoint URL.',
            ],
            'message' => [
              'type' => 'string',
              'description' => 'The text message to send.',
            ],
            'auth_key_id' => [
              'type' => 'string',
              'description' => 'Key module key ID for auth (optional).',
            ],
          ],
          'required' => ['endpoint_url', 'message'],
        ],
        annotations: new ToolAnnotations(
          title: 'Send A2A Message',
          readOnlyHint: FALSE,
          idempotentHint: FALSE,
          destructiveHint: FALSE,
          openWorldHint: TRUE,
        ),
      ),
      new Tool(
        name: 'a2a_get_task',
        description: 'Get status and result of a task from a remote A2A agent.',
        inputSchema: [
          'type' => 'object',
          'properties' => [
            'endpoint_url' => [
              'type' => 'string',
              'description' => 'The A2A endpoint URL.',
            ],
            'task_id' => [
              'type' => 'string',
              'description' => 'The task UUID.',
            ],
            'auth_key_id' => [
              'type' => 'string',
              'description' => 'Key module key ID for auth (optional).',
            ],
          ],
          'required' => ['endpoint_url', 'task_id'],
        ],
        annotations: new ToolAnnotations(
          title: 'Get A2A Task',
          readOnlyHint: TRUE,
          idempotentHint: TRUE,
          destructiveHint: FALSE,
          openWorldHint: TRUE,
        ),
      ),
      new Tool(
        name: 'a2a_cancel_task',
        description: 'Cancel a running task on a remote A2A agent.',
        inputSchema: [
          'type' => 'object',
          'properties' => [
            'endpoint_url' => [
              'type' => 'string',
              'description' => 'The A2A endpoint URL.',
            ],
            'task_id' => [
              'type' => 'string',
              'description' => 'The task UUID to cancel.',
            ],
            'auth_key_id' => [
              'type' => 'string',
              'description' => 'Key module key ID for auth (optional).',
            ],
          ],
          'required' => ['endpoint_url', 'task_id'],
        ],
        annotations: new ToolAnnotations(
          title: 'Cancel A2A Task',
          readOnlyHint: FALSE,
          idempotentHint: TRUE,
          destructiveHint: FALSE,
          openWorldHint: TRUE,
        ),
      ),
      new Tool(
        name: 'a2a_get_agent_card',
        description: 'Get this Drupal site\'s own A2A Agent Card.',
        inputSchema: [
          'type' => 'object',
          'properties' => [],
        ],
        annotations: new ToolAnnotations(
          title: 'Get Local Agent Card',
          readOnlyHint: TRUE,
          idempotentHint: TRUE,
          destructiveHint: FALSE,
          openWorldHint: FALSE,
        ),
      ),
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function executeTool(string $toolId, mixed $arguments): array {
    return match ($toolId) {
      'a2a_discover_agent', $this->sanitizeToolName('a2a_discover_agent') => $this->executeDiscover($arguments),
      'a2a_send_message', $this->sanitizeToolName('a2a_send_message') => $this->executeSendMessage($arguments),
      'a2a_get_task', $this->sanitizeToolName('a2a_get_task') => $this->executeGetTask($arguments),
      'a2a_cancel_task', $this->sanitizeToolName('a2a_cancel_task') => $this->executeCancelTask($arguments),
      'a2a_get_agent_card', $this->sanitizeToolName('a2a_get_agent_card') => $this->executeGetAgentCard(),
      default => [['type' => 'text', 'text' => "Unknown tool: $toolId"]],
    };
  }

  /**
   * Execute discover agent.
   */
  protected function executeDiscover(array $arguments): array {
    $baseUrl = $arguments['base_url'] ?? '';
    if (empty($baseUrl)) {
      return [['type' => 'text', 'text' => 'base_url is required.']];
    }

    $card = $this->a2aClient->discoverAgent($baseUrl);
    if ($card === NULL) {
      return [['type' => 'text', 'text' => "No A2A agent found at $baseUrl"]];
    }

    return [['type' => 'text', 'text' => json_encode($card->jsonSerialize(), JSON_PRETTY_PRINT)]];
  }

  /**
   * Execute send message.
   */
  protected function executeSendMessage(array $arguments): array {
    $endpointUrl = $arguments['endpoint_url'] ?? '';
    $messageText = $arguments['message'] ?? '';
    $authKeyId = $arguments['auth_key_id'] ?? NULL;

    if (empty($endpointUrl) || empty($messageText)) {
      return [['type' => 'text', 'text' => 'endpoint_url and message are required.']];
    }

    $message = A2aMessage::text('user', $messageText);
    $task = $this->a2aClient->sendMessage($endpointUrl, $message, $authKeyId);

    if ($task === NULL) {
      return [['type' => 'text', 'text' => 'Failed to send message.']];
    }

    return [['type' => 'text', 'text' => json_encode($task->jsonSerialize(), JSON_PRETTY_PRINT)]];
  }

  /**
   * Execute get task.
   */
  protected function executeGetTask(array $arguments): array {
    $endpointUrl = $arguments['endpoint_url'] ?? '';
    $taskId = $arguments['task_id'] ?? '';
    $authKeyId = $arguments['auth_key_id'] ?? NULL;

    if (empty($endpointUrl) || empty($taskId)) {
      return [['type' => 'text', 'text' => 'endpoint_url and task_id are required.']];
    }

    $result = $this->a2aClient->getTask($endpointUrl, $taskId, $authKeyId);

    if ($result === NULL) {
      return [['type' => 'text', 'text' => 'Failed to get task.']];
    }

    return [['type' => 'text', 'text' => json_encode($result, JSON_PRETTY_PRINT)]];
  }

  /**
   * Execute cancel task.
   */
  protected function executeCancelTask(array $arguments): array {
    $endpointUrl = $arguments['endpoint_url'] ?? '';
    $taskId = $arguments['task_id'] ?? '';
    $authKeyId = $arguments['auth_key_id'] ?? NULL;

    if (empty($endpointUrl) || empty($taskId)) {
      return [['type' => 'text', 'text' => 'endpoint_url and task_id are required.']];
    }

    $result = $this->a2aClient->cancelTask($endpointUrl, $taskId, $authKeyId);

    if ($result === NULL) {
      return [['type' => 'text', 'text' => 'Failed to cancel task.']];
    }

    return [['type' => 'text', 'text' => json_encode($result, JSON_PRETTY_PRINT)]];
  }

  /**
   * Execute get local agent card.
   */
  protected function executeGetAgentCard(): array {
    $card = $this->agentCardBuilder->build();
    return [['type' => 'text', 'text' => json_encode($card->jsonSerialize(), JSON_PRETTY_PRINT)]];
  }

}
