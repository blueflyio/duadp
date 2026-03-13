<?php

namespace Drupal\bluefly_agent_platform\Plugin\Tool;

use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\tool\ToolPluginBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Tool API plugin: Get Drupal Quality Index score from Dragonfly.
 *
 * @Tool(
 *   id = "get_dqi_score",
 *   label = @Translation("Get DQI Score"),
 *   description = @Translation("Retrieve the Drupal Quality Index score and history for a project from the Dragonfly orchestrator."),
 * )
 */
class GetDqiScore extends ToolPluginBase implements ContainerFactoryPluginInterface {

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
          'description' => 'The Dragonfly project ID to get the quality score for.',
        ],
        'include_history' => [
          'type' => 'boolean',
          'default' => FALSE,
          'description' => 'Whether to include score history.',
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
        'score' => ['type' => 'number'],
        'grade' => ['type' => 'string'],
        'dimensions' => [
          'type' => 'object',
          'additionalProperties' => ['type' => 'number'],
        ],
        'history' => [
          'type' => 'array',
          'items' => [
            'type' => 'object',
            'properties' => [
              'score' => ['type' => 'number'],
              'timestamp' => ['type' => 'string'],
            ],
          ],
        ],
        'badge_url' => ['type' => 'string'],
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
    $base = rtrim($dragonfly_url, '/') . '/api/drupal-test-orchestrator/v1';

    try {
      $client = \Drupal::httpClient();
      $headers = [
        'Authorization' => 'Bearer ' . $api_token,
        'Accept' => 'application/json',
      ];

      // Get score
      $score_response = $client->get("$base/quality/$project_id", [
        'headers' => $headers,
        'timeout' => 15,
      ]);
      $score_data = json_decode($score_response->getBody()->getContents(), TRUE);

      $result = [
        'project_id' => $project_id,
        'score' => $score_data['score'] ?? 0,
        'grade' => $score_data['grade'] ?? 'N/A',
        'dimensions' => $score_data['dimensions'] ?? [],
        'history' => [],
        'badge_url' => "$base/quality/$project_id/badge.svg",
      ];

      // Optionally fetch history
      if (!empty($input['include_history'])) {
        try {
          $history_response = $client->get("$base/quality/$project_id/history", [
            'headers' => $headers,
            'timeout' => 10,
          ]);
          $history_data = json_decode($history_response->getBody()->getContents(), TRUE);
          $result['history'] = $history_data['history'] ?? $history_data ?? [];
        }
        catch (\Exception $e) {
          // Non-fatal — return score without history.
        }
      }

      return $result;
    }
    catch (\Exception $e) {
      return [
        'project_id' => $project_id,
        'score' => 0,
        'grade' => 'error',
        'dimensions' => [],
        'history' => [],
        'badge_url' => '',
      ];
    }
  }

}
