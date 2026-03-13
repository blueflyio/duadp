<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

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
use Drupal\tool\TypedData\InputDefinition;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Trigger a GitLab Duo agent via the agent-mesh Duo gateway.
 *
 * POSTs to /v1/duo/route (or configured duo_route_url). Use from orchestration,
 * ECA, or MCP to run Duo flows and agents from Drupal.
 */
#[Tool(
  id: 'ai_agents_client:trigger_duo',
  label: new TranslatableMarkup('Trigger Duo Agent'),
  description: new TranslatableMarkup('Trigger a GitLab Duo agent or flow via the platform mesh. Sends event and input to the Duo gateway (agent-mesh /v1/duo/route).'),
  operation: ToolOperation::Trigger,
  destructive: FALSE,
  input_definitions: [
    'event' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Event or agent name'),
      description: new TranslatableMarkup('Duo event name or agent identifier to trigger.'),
      required: TRUE,
    ),
    'input' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Input payload'),
      description: new TranslatableMarkup('Input string or JSON for the Duo agent.'),
      required: FALSE,
    ),
    'project_id' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('GitLab project ID'),
      description: new TranslatableMarkup('Optional GitLab project ID for Duo context.'),
      required: FALSE,
    ),
  ],
  output_definitions: [
    'status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Duo route status'),
    ),
    'response' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Gateway response'),
    ),
  ],
)]
class TriggerDuoAgent extends ToolBase {

  /**
   * HTTP client.
   *
   * @var \GuzzleHttp\ClientInterface
   */
  protected ClientInterface $httpClient;

  /**
   * Config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected ConfigFactoryInterface $configFactory;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->httpClient = $container->get('http_client');
    $instance->configFactory = $container->get('config.factory');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $config = $this->configFactory->get('ai_agents_client.settings');
    $gatewayUrl = rtrim((string) $config->get('gateway_url'), '/');
    $duoRouteUrl = (string) $config->get('duo_route_url');
    if ($duoRouteUrl === '') {
      $duoRouteUrl = $gatewayUrl . '/v1/duo/route';
    }
    $duoRouteUrl = rtrim($duoRouteUrl, '/');
    $timeout = (int) ($config->get('timeout') ?? 30);

    if ($duoRouteUrl === '/v1/duo/route' || $gatewayUrl === '') {
      return ExecutableResult::failure(
        new TranslatableMarkup('Duo gateway not configured. Set gateway_url or duo_route_url at /admin/config/ai-agents/client.')
      );
    }

    $event = (string) ($values['event'] ?? '');
    if ($event === '') {
      return ExecutableResult::failure(
        new TranslatableMarkup('Event or agent name is required.')
      );
    }

    $payload = [
      'event' => $event,
      'input' => (string) ($values['input'] ?? ''),
    ];
    if (!empty($values['project_id'])) {
      $payload['project'] = ['id' => (int) $values['project_id']];
    }

    try {
      $response = $this->httpClient->request('POST', $duoRouteUrl, [
        'json' => $payload,
        'timeout' => $timeout,
        'headers' => [
          'Content-Type' => 'application/json',
          'Accept' => 'application/json',
        ],
      ]);

      $body = (string) $response->getBody()->getContents();
      $code = $response->getStatusCode();
      $ok = $code >= 200 && $code < 300;

      return ExecutableResult::success(
        new TranslatableMarkup('Duo route returned HTTP @code.', ['@code' => $code]),
        [
          'status' => $ok ? 'ok' : 'error',
          'response' => $body,
        ]
      );
    }
    catch (GuzzleException $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Duo gateway request failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'access content');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
