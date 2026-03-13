<?php

declare(strict_types=1);

namespace Drupal\duadp\Service;

use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;

/**
 * Sends Drupal events and DUADP-discovered site data to N8N workflows.
 *
 * N8N is used as the automation backbone for the Fleet Manager (fleet.drupl.ai)
 * to drive bulk operations across 1000s of discovered Drupal sites via JSON API.
 *
 * Configuration:
 *   - duadp.settings:n8n_webhook_url  Base URL of the N8N instance webhook.
 *   - duadp.settings:n8n_api_key      Optional bearer token for N8N authentication.
 */
final class N8nOrchestrationService {

  public function __construct(
    private readonly ClientInterface $httpClient,
    private readonly ConfigFactoryInterface $configFactory,
    private readonly LoggerChannelFactoryInterface $loggerFactory,
  ) {}

  /**
   * Triggers an N8N workflow via webhook with the provided payload.
   *
   * @param string $workflow
   *   Workflow identifier / webhook path (appended to the base webhook URL).
   * @param array $payload
   *   The data to POST to N8N.
   *
   * @return bool
   *   TRUE on success, FALSE on failure.
   */
  public function trigger(string $workflow, array $payload): bool {
    $config = $this->configFactory->get('duadp.settings');
    $baseUrl = rtrim((string) ($config->get('n8n_webhook_url') ?? ''), '/');
    $apiKey  = (string) ($config->get('n8n_api_key') ?? '');

    if (empty($baseUrl)) {
      $this->loggerFactory->get('duadp')->warning('N8N webhook URL not configured. Skipping trigger for workflow: @workflow', ['@workflow' => $workflow]);
      return FALSE;
    }

    $url = $baseUrl . '/' . ltrim($workflow, '/');
    $options = [
      'json'    => $payload,
      'timeout' => 10,
      'headers' => ['Accept' => 'application/json'],
    ];

    if (!empty($apiKey)) {
      $options['headers']['Authorization'] = 'Bearer ' . $apiKey;
    }

    try {
      $response = $this->httpClient->request('POST', $url, $options);
      $status   = $response->getStatusCode();

      if ($status >= 200 && $status < 300) {
        $this->loggerFactory->get('duadp')->info('N8N workflow triggered: @workflow (HTTP @status)', [
          '@workflow' => $workflow,
          '@status'   => $status,
        ]);
        return TRUE;
      }

      $this->loggerFactory->get('duadp')->warning('N8N webhook returned unexpected status @status for workflow @workflow', [
        '@status'   => $status,
        '@workflow' => $workflow,
      ]);
    }
    catch (GuzzleException $e) {
      $this->loggerFactory->get('duadp')->error('N8N webhook error for workflow @workflow: @message', [
        '@workflow' => $workflow,
        '@message'  => $e->getMessage(),
      ]);
    }

    return FALSE;
  }

  /**
   * Dispatches a DUADP-discovered peer list to N8N for fleet automation.
   *
   * This is the primary bridge between DUADP Federation discovery and N8N.
   * N8N receives the list of peers + their JSON API credentials and can then
   * orchestrate bulk operations (e.g. module updates, content publishing) via
   * the Drupal orchestration module or direct JSON API calls.
   *
   * @param array $peers
   *   Array of DUADP peer nodes, each with 'url', 'node_name', 'capabilities'.
   * @param string $operation
   *   Operation to perform on the fleet (e.g. 'update_modules', 'clear_cache').
   * @param array $options
   *   Extra options passed to N8N (e.g. batch size, dry_run flag).
   *
   * @return bool
   *   TRUE if N8N accepted the trigger.
   */
  public function dispatchFleetOperation(array $peers, string $operation, array $options = []): bool {
    return $this->trigger('fleet/dispatch', [
      'operation' => $operation,
      'peers'     => $peers,
      'options'   => $options,
      'source'    => 'duadp_federation',
      'timestamp' => date('c'),
    ]);
  }

  /**
   * Notifies N8N when a new DUADP peer is registered or updated.
   *
   * @param array $peer
   *   The peer manifest data from /.well-known/duadp.json.
   *
   * @return bool
   */
  public function notifyPeerRegistered(array $peer): bool {
    return $this->trigger('fleet/peer-registered', [
      'peer'      => $peer,
      'timestamp' => date('c'),
    ]);
  }

}
