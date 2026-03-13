<?php

declare(strict_types=1);

namespace Drupal\duadp\Service;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\State\StateInterface;
use Drupal\Component\Datetime\TimeInterface;
use Drupal\http_client_manager\HttpClientInterface;
use Psr\Log\LoggerInterface;

/**
 * Handles DUADP peer discovery and gossip communication.
 *
 * Uses http_client_manager for all outbound HTTP requests to federated peers.
 */
final class DuadpFederationService {

  /**
   * State key for storing known peers.
   */
  private const STATE_KEY_PEERS = 'duadp.peers';

  public function __construct(
    protected readonly HttpClientInterface $httpClient,
    protected readonly LoggerInterface $logger,
    protected readonly ConfigFactoryInterface $configFactory,
    protected readonly TimeInterface $time,
    protected readonly StateInterface $state,
  ) {}

  /**
   * Retrieves the list of known, healthy peers from state storage.
   *
   * @return array<int, array<string, mixed>>
   *   List of peer information arrays.
   */
  public function getPeers(): array {
    $peers = $this->state->get(self::STATE_KEY_PEERS, []);
    return is_array($peers) ? $peers : [];
  }

  /**
   * Performs a federated query across all known healthy peers.
   *
   * @param string $path
   *   The API path to query (e.g., '/api/v1/agents').
   * @param array $params
   *   Optional query parameters.
   *
   * @return array
   *   Merged results from all peers and the local node.
   */
  public function federatedQuery(string $path, array $params = []): array {
    $peers = $this->getPeers();
    $results = [];

    // Filter out 'federated=true' to prevent infinite recursion between nodes.
    unset($params['federated']);

    foreach ($peers as $peer) {
      if (($peer['health'] ?? '') !== 'healthy') {
        continue;
      }

      $url = rtrim($peer['url'], '/') . '/' . ltrim($path, '/');
      try {
        $response = $this->httpClient->call('GET', [
          'url' => $url,
          'query' => $params,
          'timeout' => 3,
        ]);
        
        $data = $response->toArray();
        if (isset($data['data']) && is_array($data['data'])) {
          foreach ($data['data'] as $item) {
            // Add origin node metadata for traceability.
            $item['_duadp']['origin_node'] = $peer['node_name'] ?? $peer['url'];
            $results[] = $item;
          }
        }
      }
      catch (\Exception $e) {
        $this->logger->warning('Federated query failed for peer @url: @message', [
          '@url' => $url,
          '@message' => $e->getMessage(),
        ]);
        // Consider marking peer as unhealthy if it fails repeatedly.
      }
    }

    return $results;
  }

  /**
   * Propagates a revocation to all federated peers.
   */
  public function propagateRevocation(string $gaid, string $reason, string $kind = 'Agent'): void {
    $peers = $this->getPeers();
    $payload = [
      'gaid' => $gaid,
      'reason' => $reason,
      'kind' => $kind,
      'revoked_at' => $this->time->getRequestTime(),
      'revoked_by' => $this->configFactory->get('system.site')->get('name'),
    ];

    foreach ($peers as $peer) {
      $url = rtrim($peer['url'], '/') . '/api/v1/federation/revocations';
      try {
        $this->httpClient->call('POST', [
          'url' => $url,
          'json' => $payload,
          'timeout' => 3,
        ]);
      }
      catch (\Exception $e) {
        $this->logger->error('Failed to propagate revocation to peer @url: @message', [
          '@url' => $url,
          '@message' => $e->getMessage(),
        ]);
      }
    }
  }

  /**
   * State key for storing revocations.
   */
  private const STATE_KEY_REVOCATIONS = 'duadp.revocations';

  /**
   * Retrieves the list of known revocations from state storage.
   */
  public function getRevocations(): array {
    $revocations = $this->state->get(self::STATE_KEY_REVOCATIONS, []);
    return is_array($revocations) ? $revocations : [];
  }

  /**
   * Registers an incoming revocation and stores it locally.
   */
  public function registerRevocation(array $payload): void {
    $gaid = $payload['gaid'] ?? '';
    if (empty($gaid)) {
      return;
    }

    $revocations = $this->getRevocations();
    // Avoid duplicates.
    $exists = FALSE;
    foreach ($revocations as $r) {
      if (($r['gaid'] ?? '') === $gaid) {
        $exists = TRUE;
        break;
      }
    }

    if (!$exists) {
      $revocations[] = [
        'gaid' => $gaid,
        'reason' => $payload['reason'] ?? 'Unknown',
        'kind' => $payload['kind'] ?? 'Agent',
        'revoked_at' => $payload['revoked_at'] ?? $this->time->getRequestTime(),
        'revoked_by' => $payload['revoked_by'] ?? 'Unknown Peer',
      ];
      $this->state->set(self::STATE_KEY_REVOCATIONS, $revocations);
      $this->logger->warning('Revocation registered for @gaid', ['@gaid' => $gaid]);
    }
  }

  /**
   * Checks if a GAID has been revoked.
   */
  public function isRevoked(string $gaid): bool {
    $revocations = $this->getRevocations();
    foreach ($revocations as $r) {
      if (($r['gaid'] ?? '') === $gaid) {
        return TRUE;
      }
    }
    return FALSE;
  }

  public function registerPeer(string $url, array $peers = []): array {
    $manifestUrl = rtrim($url, '/') . '/.well-known/duadp.json';
    $skillsUrl = rtrim($url, '/') . '/api/v1/skills';

    try {
      // 1. Try /.well-known/duadp.json -> parse endpoints
      $response = $this->httpClient->call('GET', [
        'url' => $manifestUrl,
        'timeout' => 5,
        'headers' => ['Accept' => 'application/json'],
      ]);
      $data = $response->toArray();
    }
    catch (\Exception $e) {
      // 2. If 404 or any failure, try direct URL as skills endpoint
      $this->logger->info('Manifest fetch failed for @url. Attempting UADP v0.1 compatibility fallback to @skills', [
        '@url' => $manifestUrl,
        '@skills' => $skillsUrl,
      ]);

      try {
        $fallbackResponse = $this->httpClient->call('GET', [
          'url' => $skillsUrl,
          'timeout' => 5,
          'headers' => ['Accept' => 'application/json'],
        ]);

        $fallbackData = $fallbackResponse->toArray();
        // If successful, construct a mock manifest for UADP v0.1 compatibility mode
        $data = [
          'protocol_version' => 'duadp/v0.1-compat',
          'node_name' => parse_url($url, PHP_URL_HOST) ?? 'Unknown Node',
          'capabilities' => ['skills_registry'],
          'endpoints' => [
            'skills' => $skillsUrl,
          ],
        ];
      }
      catch (\Exception $fallbackE) {
        // 3. If both fail, reject with clear error message
        $this->logger->error('Failed to register DUADP peer @url: Both manifest and fallback endpoint failed. @message', [
          '@url' => $url,
          '@message' => $fallbackE->getMessage(),
        ]);
        throw new \RuntimeException('Could not validate peer manifest or legacy skills endpoint. Ensure the node serves /.well-known/duadp.json or /api/v1/skills.');
      }
    }

    if (empty($data['protocol_version'])) {
      throw new \RuntimeException("Invalid DUADP manifest at {$manifestUrl}");
    }

    $peerInfo = [
      'url' => $url,
      'node_name' => $data['node_name'] ?? 'Unknown',
      'health' => 'healthy',
      'last_seen' => $this->time->getRequestTime(),
      'capabilities' => $data['capabilities'] ?? [],
      'endpoints' => $data['endpoints'] ?? [],
    ];

    // Save the peer to state storage.
    $existingPeers = $this->getPeers();
    // Replace existing peer with same URL or add new.
    $existingPeers = array_filter($existingPeers, fn(array $p): bool => ($p['url'] ?? '') !== $url);
    $existingPeers[] = $peerInfo;
    
    // Add any transitive peers provided in the registration request (gossip).
    foreach ($peers as $transitivePeer) {
      $transitiveUrl = $transitivePeer['url'] ?? '';
      if (empty($transitiveUrl) || $transitiveUrl === $url) {
        continue;
      }
      
      $isNew = TRUE;
      foreach ($existingPeers as $p) {
        if ($p['url'] === $transitiveUrl) {
          $isNew = FALSE;
          break;
        }
      }
      
      if ($isNew) {
        $existingPeers[] = [
          'url' => $transitiveUrl,
          'node_name' => $transitivePeer['node_name'] ?? 'Transitive',
          'health' => 'unverified',
          'last_seen' => 0,
          'capabilities' => [],
          'endpoints' => [],
        ];
      }
    }
    
    $this->state->set(self::STATE_KEY_PEERS, array_values($existingPeers));
    $this->logger->info('Successfully registered DUADP peer: @url', ['@url' => $url]);

    return $peerInfo;
  }

}
