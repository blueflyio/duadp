<?php

namespace Drupal\bluefly_agent_platform\Plugin\Tool;

use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\tool\ToolPluginBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Tool API plugin: Trigger Dragonfly test run.
 *
 * @Tool(
 *   id = "trigger_dragonfly_test",
 *   label = @Translation("Trigger Dragonfly Test"),
 *   description = @Translation("Trigger a test run on the Dragonfly orchestrator for a given project."),
 * )
 */
class TriggerDragonflyTest extends ToolPluginBase implements ContainerFactoryPluginInterface {

  /**
   * The HTTP client manager.
   *
   * @var \Drupal\http_client_manager\HttpClientManagerInterface
   */
  protected $httpClientManager;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = new static($configuration, $plugin_id, $plugin_definition);
    $instance->httpClientManager = $container->get('http_client_manager.factory');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function getInputJsonSchema(): array {
    return [
      'type' => 'object',
      'required' => ['project_id'],
      'properties' => [
        'project_id' => [
          'type' => 'string',
          'description' => 'The Dragonfly project ID to trigger tests for.',
        ],
        'test_types' => [
          'type' => 'array',
          'items' => ['type' => 'string'],
          'default' => ['unit', 'kernel', 'functional'],
          'description' => 'Test types to run: unit, kernel, functional, playwright, e2e.',
        ],
        'backend' => [
          'type' => 'string',
          'enum' => ['docker', 'ddev'],
          'default' => 'docker',
          'description' => 'Execution backend.',
        ],
      ],
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getOutputJsonSchema(): array {
    return [
      'type' => 'object',
      'properties' => [
        'run_id' => ['type' => 'string'],
        'status' => ['type' => 'string'],
        'project_id' => ['type' => 'string'],
        'test_types' => ['type' => 'array', 'items' => ['type' => 'string']],
        'message' => ['type' => 'string'],
      ],
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function execute(array $input): array {
    $dragonfly_url = \Drupal::config('bluefly_agent_platform.settings')->get('dragonfly_url')
      ?? getenv('DRAGONFLY_API_URL')
      ?? 'https://dragonfly.drupl.ai';

    $api_token = \Drupal::config('bluefly_agent_platform.settings')->get('dragonfly_api_token')
      ?? getenv('DRAGONFLY_API_TOKEN')
      ?? '';

    $endpoint = rtrim($dragonfly_url, '/') . '/api/drupal-test-orchestrator/v1/tests/trigger';

    try {
      $client = \Drupal::httpClient();
      $response = $client->post($endpoint, [
        'json' => [
          'projects' => $input['project_id'],
          'testTypes' => $input['test_types'] ?? ['unit', 'kernel', 'functional'],
          'backend' => $input['backend'] ?? 'docker',
        ],
        'headers' => [
          'Authorization' => 'Bearer ' . $api_token,
          'Content-Type' => 'application/json',
        ],
        'timeout' => 30,
      ]);

      $data = json_decode($response->getBody()->getContents(), TRUE);

      return [
        'run_id' => $data['id'] ?? $data['runId'] ?? 'unknown',
        'status' => $data['status'] ?? 'queued',
        'project_id' => $input['project_id'],
        'test_types' => $input['test_types'] ?? ['unit', 'kernel', 'functional'],
        'message' => 'Test run triggered successfully.',
      ];
    }
    catch (\Exception $e) {
      return [
        'run_id' => '',
        'status' => 'error',
        'project_id' => $input['project_id'],
        'test_types' => $input['test_types'] ?? [],
        'message' => 'Failed to trigger test: ' . $e->getMessage(),
      ];
    }
  }

}
