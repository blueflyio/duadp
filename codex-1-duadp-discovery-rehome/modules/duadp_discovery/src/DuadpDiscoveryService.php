<?php

namespace Drupal\duadp_discovery;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Logger\LoggerChannelInterface;
use Drupal\Core\Plugin\DefaultPluginManager;
use Drupal\duadp_discovery\Entity\DuadpNode;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\RequestException;

/**
 * Service that syncs Drupal drupal/ai plugins to DUADP registry nodes.
 */
class DuadpDiscoveryService {

  public function __construct(
    private readonly ClientInterface $httpClient,
    private readonly ConfigFactoryInterface $configFactory,
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly LoggerChannelInterface $logger,
    private readonly DefaultPluginManager $aiProviderManager,
  ) {}

  /**
   * Returns all enabled DuadpNode config entities.
   *
   * @return \Drupal\duadp_discovery\Entity\DuadpNode[]
   */
  public function getEnabledNodes(): array {
    $storage = $this->entityTypeManager->getStorage('duadp_node');
    $entities = $storage->loadMultiple();
    return array_filter($entities, fn(DuadpNode $n) => $n->status() && $n->sync_enabled && $n->isConfigured());
  }

  /**
   * Syncs all enabled drupal/ai plugins to all configured DUADP nodes.
   *
   * Discovers ai plugin definitions, maps them to OSSA-compatible payloads,
   * and POSTs them to each DUADP node's /api/v1/publish endpoint.
   */
  public function syncPluginCatalogue(): void {
    $nodes = $this->getEnabledNodes();
    if (empty($nodes)) {
      return;
    }

    $definitions = $this->aiProviderManager->getDefinitions();
    $this->logger->info('Starting DUADP sync: @count ai plugin definitions across @nodes nodes.', [
      '@count' => count($definitions),
      '@nodes' => count($nodes),
    ]);

    foreach ($nodes as $node) {
      $this->syncToNode($node, $definitions);
    }
  }

  /**
   * Syncs plugin definitions to a single DuadpNode.
   */
  private function syncToNode(DuadpNode $node, array $definitions): void {
    $siteConfig = $this->configFactory->get('system.site');
    $baseUrl = \Drupal::request()->getSchemeAndHttpHost();
    $siteName = $siteConfig->get('name');

    $token = $this->resolveToken($node);
    $headers = [
      'Content-Type' => 'application/json',
      'Accept' => 'application/json',
    ];
    if ($token) {
      $headers['Authorization'] = 'Bearer ' . $token;
    }

    foreach ($definitions as $pluginId => $definition) {
      // Map plugin type to OSSA kind
      $kind = match ($definition['type'] ?? 'tool') {
        'agent' => 'Agent',
        'skill' => 'Skill',
        default => 'Tool',
      };

      // Skip if this node is not configured to publish this kind
      $publish = match ($kind) {
        'Agent' => $node->publish_agents,
        'Skill' => $node->publish_skills,
        default => $node->publish_tools,
      };
      if (!$publish) {
        continue;
      }

      $payload = [
        'apiVersion' => 'ossa/v0.5',
        'kind' => $kind,
        'metadata' => [
          'name' => $pluginId,
          'label' => (string) ($definition['label'] ?? $pluginId),
          'description' => (string) ($definition['description'] ?? ''),
          'namespace' => 'drupal.' . \Drupal::installProfile(),
          'source_site' => $siteName,
          'source_url' => $baseUrl,
          'trust_tier' => $node->trust_tier,
          'tags' => ['drupal', 'ai', $pluginId],
        ],
        'spec' => [
          'protocol' => 'drupal-ai',
          'plugin_id' => $pluginId,
          'provider' => $definition['provider'] ?? 'drupal',
          'discover_url' => $baseUrl . '/duadp/discover',
        ],
        'identity' => [
          'gaid' => 'agent://' . \Drupal::request()->getHost() . '/tools/' . $pluginId,
          'did' => 'did:web:' . \Drupal::request()->getHost(),
        ],
      ];

      try {
        $this->httpClient->post($node->getNodeUrl() . '/api/v1/publish', [
          'json' => $payload,
          'headers' => $headers,
          'timeout' => 10,
        ]);
      }
      catch (RequestException $e) {
        $this->logger->warning('Failed to sync @plugin to DUADP node @node: @error', [
          '@plugin' => $pluginId,
          '@node' => $node->id(),
          '@error' => $e->getMessage(),
        ]);
      }
    }
  }

  /**
   * Publishes a single OSSA agent node entity to all configured DUADP nodes.
   *
   * @param \Drupal\Core\Entity\EntityInterface $entity
   *   An OSSA agent content entity.
   */
  public function publishAgentNode($entity): void {
    $nodes = $this->getEnabledNodes();
    if (empty($nodes)) {
      return;
    }

    $baseUrl = \Drupal::request()->getSchemeAndHttpHost();
    $payload = [
      'apiVersion' => 'ossa/v0.5',
      'kind' => 'Agent',
      'metadata' => [
        'name' => $entity->label(),
        'description' => $entity->get('body')->value ?? '',
        'trust_tier' => 'community',
        'tags' => ['drupal', 'ossa-agent'],
      ],
      'identity' => [
        'gaid' => 'agent://' . \Drupal::request()->getHost() . '/agents/' . $entity->id(),
        'did' => 'did:web:' . \Drupal::request()->getHost(),
      ],
      'spec' => [
        'discover_url' => $baseUrl . '/node/' . $entity->id(),
      ],
    ];

    foreach ($nodes as $node) {
      if (!$node->publish_agents) {
        continue;
      }
      $token = $this->resolveToken($node);
      $headers = ['Content-Type' => 'application/json'];
      if ($token) {
        $headers['Authorization'] = 'Bearer ' . $token;
      }
      try {
        $this->httpClient->post($node->getNodeUrl() . '/api/v1/publish', [
          'json' => $payload,
          'headers' => $headers,
          'timeout' => 10,
        ]);
        $this->logger->info('Published agent @id to DUADP node @node.', [
          '@id' => $entity->id(),
          '@node' => $node->id(),
        ]);
      }
      catch (RequestException $e) {
        $this->logger->error('Failed to publish agent @id to @node: @err', [
          '@id' => $entity->id(),
          '@node' => $node->id(),
          '@err' => $e->getMessage(),
        ]);
      }
    }
  }

  /**
   * Refreshes health status for all configured DUADP nodes.
   * Logs unreachable nodes for monitoring.
   */
  public function refreshPeerHealth(): void {
    foreach ($this->getEnabledNodes() as $node) {
      try {
        $response = $this->httpClient->get($node->getNodeUrl() . '/api/v1/health', ['timeout' => 5]);
        $this->logger->info('DUADP node @id health: HTTP @status', [
          '@id' => $node->id(),
          '@status' => $response->getStatusCode(),
        ]);
      }
      catch (RequestException $e) {
        $this->logger->warning('DUADP node @id unreachable: @err', [
          '@id' => $node->id(),
          '@err' => $e->getMessage(),
        ]);
      }
    }
  }

  /**
   * Resolves the Bearer token for a node from the Key module.
   */
  private function resolveToken(DuadpNode $node): ?string {
    if (empty($node->auth_token_key)) {
      return NULL;
    }
    try {
      /** @var \Drupal\key\KeyRepositoryInterface $keyRepo */
      $keyRepo = \Drupal::service('key.repository');
      $key = $keyRepo->getKey($node->auth_token_key);
      return $key?->getKeyValue();
    }
    catch (\Exception) {
      return NULL;
    }
  }

}
