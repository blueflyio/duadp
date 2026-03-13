<?php

declare(strict_types=1);

namespace Drupal\duadp\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Serves the /api/v1/skills and /api/v1/agents endpoints.
 */
final class DuadpRegistryController extends ControllerBase {

  public function __construct(
    protected readonly RequestStack $requestStack,
    protected readonly \Drupal\duadp\Service\DuadpFederationService $federationService,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('request_stack'),
      $container->get('duadp.federation_service'),
    );
  }

  /**
   * Returns a paginated list of skills in OSSA format.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The incoming request.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   JSON list of skills.
   */
  public function listSkills(Request $request): JsonResponse {
    $search = $request->query->get('search');
    $limit = (int) $request->query->get('limit', 50);
    $page = (int) $request->query->get('page', 1);
    $isFederated = $request->query->get('federated') === 'true';

    $limit = $limit > 0 ? $limit : 50;
    $page = $page > 0 ? $page : 1;
    $offset = ($page - 1) * $limit;

    try {
      $storage = $this->entityTypeManager()->getStorage('marketplace_skill');
      $query = $storage->getQuery()
        ->accessCheck(FALSE);

      if (!empty($search)) {
        $query->condition('title', $search, 'CONTAINS');
      }

      $countQuery = clone $query;
      $total = (int) $countQuery->count()->execute();

      $entityIds = $query->range($offset, $limit)->execute();
      $entities = $storage->loadMultiple($entityIds);

      $currentRequest = $this->requestStack->getCurrentRequest();
      $baseUrl = $currentRequest ? $currentRequest->getSchemeAndHttpHost() : '';
      $host = $currentRequest ? $currentRequest->getHost() : 'localhost';

      $skills = [];
      foreach ($entities as $entity) {
        $id = $entity->id();
        $title = $entity->get('title')->value;
        $manifest = $entity->get('field_skill_manifest')->value ?? '';
        $gaid = $entity->get('field_gaid')->value ?? "duadp://{$host}/skills/{$id}";
        
        // Skip if revoked.
        if ($this->federationService->isRevoked($gaid)) {
          continue;
        }

        $trustTier = $entity->get('field_trust_tier')->value ?? 'community';

        $manifestData = json_decode($manifest, TRUE) ?: [];
        $skills[] = [
          'apiVersion' => $manifestData['apiVersion'] ?? 'ossa/v0.5',
          'kind' => 'Tool',
          'metadata' => [
            'name' => $title,
            'version' => $entity->get('field_skill_version')->value ?? '1.0.0',
            'description' => $manifestData['metadata']['description'] ?? '',
            'labels' => $manifestData['metadata']['labels'] ?? [],
          ],
          'spec' => $manifestData['spec'] ?? [],
          'extensions' => [
            'security' => [
              'cedar' => $manifestData['extensions']['security']['cedar'] ?? '',
            ],
          ],
          '_duadp' => [
            'uri' => $gaid,
            'url' => "{$baseUrl}/api/v1/skills/{$id}",
            'trust_tier' => $trustTier,
            'origin_node' => 'local',
          ],
        ];
      }

      // Merge federated results if requested.
      if ($isFederated) {
        $federatedSkills = $this->federationService->federatedQuery('/api/v1/skills', $request->query->all());
        $skills = array_merge($skills, $federatedSkills);
        $total += count($federatedSkills);
      }

      $response = [
        'data' => $skills,
        'meta' => [
          'total' => $total,
          'page' => $page,
          'limit' => $limit,
          'pages' => (int) ceil($total / max($limit, 1)) ?: 1,
        ],
      ];

      return new JsonResponse($response, 200, ['Access-Control-Allow-Origin' => '*']);
    }
    catch (\Exception $e) {
      return new JsonResponse([
        'error' => 'Unable to retrieve skills registry',
        'message' => $e->getMessage(),
      ], 500);
    }
  }

  /**
   * Returns a paginated list of agents in OSSA format.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The incoming request.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   JSON list of agents.
   */
  public function listAgents(Request $request): JsonResponse {
    $search = $request->query->get('search');
    $limit = (int) $request->query->get('limit', 50);
    $page = (int) $request->query->get('page', 1);
    $isFederated = $request->query->get('federated') === 'true';

    $limit = $limit > 0 ? $limit : 50;
    $page = $page > 0 ? $page : 1;
    $offset = ($page - 1) * $limit;

    try {
      $storage = $this->entityTypeManager()->getStorage('agent_marketplace_entry');
      $query = $storage->getQuery()
        ->accessCheck(TRUE)
        ->condition('status', 1);

      if (!empty($search)) {
        $query->condition('name', $search, 'CONTAINS');
      }

      $countQuery = clone $query;
      $total = (int) $countQuery->count()->execute();

      $entityIds = $query->range($offset, $limit)->execute();
      $entities = $storage->loadMultiple($entityIds);

      $currentRequest = $this->requestStack->getCurrentRequest();
      $baseUrl = $currentRequest ? $currentRequest->getSchemeAndHttpHost() : '';
      $host = $currentRequest ? $currentRequest->getHost() : 'localhost';

      $agents = [];
      foreach ($entities as $entity) {
        $machineName = $entity->getMachineName();
        $gaid = $entity->get('field_gaid')->value ?? "duadp://{$host}/agents/{$machineName}";

        // Skip if revoked.
        if ($this->federationService->isRevoked($gaid)) {
          continue;
        }

        $agents[] = [
          'apiVersion' => $entity->get('ossa_api_version')->value ?: 'ossa/v0.5',
          'kind' => 'Agent',
          'metadata' => [
            'name' => $entity->get('ossa_metadata_name')->value ?: $machineName,
            'version' => $entity->get('ossa_metadata_version')->value ?: $entity->get('version')->value,
            'description' => $entity->get('description')->value,
            'author' => $entity->get('author')->value,
            'labels' => $entity->get('ossa_metadata_labels')->value ? json_decode($entity->get('ossa_metadata_labels')->value, TRUE) : [],
          ],
          'spec' => [
            'role' => $entity->get('ossa_spec_role')->value,
            'taxonomy' => [
              'domain' => $entity->get('ossa_spec_taxonomy_domain')->value,
              'subdomain' => $entity->get('ossa_spec_taxonomy_subdomain')->value,
              'capability' => $entity->get('ossa_spec_taxonomy_capability')->value,
            ],
            'model' => [
              'provider' => $entity->get('ossa_spec_llm_provider')->value,
              'name' => $entity->get('ossa_spec_llm_model')->value,
              'temperature' => (float) $entity->get('ossa_spec_llm_temperature')->value,
              'max_tokens' => (int) $entity->get('ossa_spec_llm_max_tokens')->value,
            ],
            'tools' => $entity->get('ossa_spec_tools')->value ? json_decode($entity->get('ossa_spec_tools')->value, TRUE) : [],
            'autonomy' => [
              'level' => $entity->get('ossa_spec_autonomy_level')->value,
              'human_approval_required' => (bool) $entity->get('ossa_spec_autonomy_approval_required')->value,
            ],
          ],
          'extensions' => [
            'security' => [
              'cedar' => $entity->get('ossa_extensions_security_cedar')->value ?? '',
            ],
          ],
          '_duadp' => [
            'uri' => $gaid,
            'url' => "{$baseUrl}/api/v1/agents/{$machineName}",
            'trust_tier' => $entity->get('verified')->value ? 'official' : 'community',
            'origin_node' => 'local',
          ],
        ];
      }

      // Merge federated results if requested.
      if ($isFederated) {
        $federatedAgents = $this->federationService->federatedQuery('/api/v1/agents', $request->query->all());
        $agents = array_merge($agents, $federatedAgents);
        $total += count($federatedAgents);
      }

      $response = [
        'data' => $agents,
        'meta' => [
          'total' => $total,
          'page' => $page,
          'limit' => $limit,
          'pages' => (int) ceil($total / max($limit, 1)) ?: 1,
        ],
      ];

      return new JsonResponse($response, 200, ['Access-Control-Allow-Origin' => '*']);

    }
    catch (\Exception $e) {
      return new JsonResponse([
        'error' => 'Unable to retrieve registry',
        'message' => $e->getMessage(),
      ], 500);
    }
  }

}
