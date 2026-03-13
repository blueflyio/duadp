<?php

namespace Drupal\bluefly_agent_platform\Plugin\Tool;

use Drupal\tool\ToolPluginBase;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Tool API plugin: Run audit on a Dragonfly project.
 *
 * Triggers the audit engine via Dragonfly's POST /projects/:id/audit
 * endpoint. Returns findings summary and dimension breakdown.
 *
 * @Tool(
 *   id = "run_dragonfly_audit",
 *   label = @Translation("Run Dragonfly Audit"),
 *   description = @Translation("Run the audit engine on a Dragonfly project using the openstandardagents audit-rules catalog."),
 * )
 */
class RunDragonflyAudit extends ToolPluginBase implements ContainerFactoryPluginInterface {

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    return new static($configuration, $plugin_id, $plugin_definition);
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
          'description' => 'The Dragonfly project ID to audit.',
        ],
        'ref' => [
          'type' => 'string',
          'description' => 'Git ref (branch/tag/SHA) to audit. Defaults to project default branch.',
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
        'project_id' => ['type' => 'string'],
        'ref' => ['type' => 'string'],
        'catalog_version' => ['type' => 'string'],
        'total_findings' => ['type' => 'integer'],
        'errors' => ['type' => 'integer'],
        'warnings' => ['type' => 'integer'],
        'info' => ['type' => 'integer'],
        'by_dimension' => [
          'type' => 'object',
          'additionalProperties' => ['type' => 'integer'],
        ],
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

    $project_id = $input['project_id'];
    $endpoint = rtrim($dragonfly_url, '/') . "/api/drupal-test-orchestrator/v1/projects/$project_id/audit";

    try {
      $client = \Drupal::httpClient();
      $body = [];
      if (!empty($input['ref'])) {
        $body['ref'] = $input['ref'];
      }

      $response = $client->post($endpoint, [
        'json' => $body,
        'headers' => [
          'Authorization' => 'Bearer ' . $api_token,
          'Content-Type' => 'application/json',
        ],
        'timeout' => 120,
      ]);

      $data = json_decode($response->getBody()->getContents(), TRUE);
      $audit = $data['audit'] ?? [];
      $summary = $audit['summary'] ?? [];

      return [
        'project_id' => $project_id,
        'ref' => $data['ref'] ?? $input['ref'] ?? 'default',
        'catalog_version' => $audit['catalogVersion'] ?? 'unknown',
        'total_findings' => $summary['total'] ?? 0,
        'errors' => $summary['error'] ?? 0,
        'warnings' => $summary['warning'] ?? 0,
        'info' => $summary['info'] ?? 0,
        'by_dimension' => $summary['byDimension'] ?? [],
        'message' => 'Audit completed.',
      ];
    }
    catch (\Exception $e) {
      return [
        'project_id' => $project_id,
        'ref' => $input['ref'] ?? '',
        'catalog_version' => '',
        'total_findings' => 0,
        'errors' => 0,
        'warnings' => 0,
        'info' => 0,
        'by_dimension' => [],
        'message' => 'Audit failed: ' . $e->getMessage(),
      ];
    }
  }

}
