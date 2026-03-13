<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Controller;

use Drupal\bluefly_agent_platform\Service\OssaManifestImporter;
use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * REST controller for OSSA manifest import and export.
 */
class OssaImportController extends ControllerBase {

  /**
   * Constructs an OssaImportController.
   */
  public function __construct(
    protected OssaManifestImporter $ossaImporter,
    protected EntityTypeManagerInterface $entityTypeManager,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('bluefly_agent_platform.ossa_importer'),
      $container->get('entity_type.manager'),
    );
  }

  /**
   * POST /api/v1/ossa/import — Import an OSSA manifest.
   *
   * Accepts JSON body with:
   * - manifest: The OSSA manifest object (required).
   * - update: bool — Update existing if found (default: false).
   * - approval_policy: string — Approval policy ID to assign.
   * - provider_profile: string — Provider profile ID to assign.
   */
  public function import(Request $request): JsonResponse {
    $data = json_decode($request->getContent(), TRUE);
    if (!$data || empty($data['manifest'])) {
      return new JsonResponse([
        'error' => 'Missing required field: manifest',
        'hint' => 'POST a JSON body with { "manifest": { "apiVersion": "ossa/v0.4", "kind": "Agent", "metadata": { "name": "..." }, "spec": { ... } } }',
      ], 400);
    }

    $options = [
      'update' => !empty($data['update']),
    ];
    if (isset($data['approval_policy'])) {
      $options['approval_policy'] = $data['approval_policy'];
    }
    if (isset($data['provider_profile'])) {
      $options['provider_profile'] = $data['provider_profile'];
    }

    try {
      $agent = $this->ossaImporter->import($data['manifest'], $options);

      return new JsonResponse([
        'status' => 'imported',
        'agent_id' => $agent->id(),
        'agent_label' => $agent->label(),
        'ossa_version' => $agent->getOssaVersion(),
        'capabilities' => $agent->getCapabilities(),
      ], 201);
    }
    catch (\InvalidArgumentException $e) {
      return new JsonResponse(['error' => $e->getMessage()], 409);
    }
    catch (\Exception $e) {
      return new JsonResponse(['error' => $e->getMessage()], 500);
    }
  }

  /**
   * GET /api/v1/ossa/export/{agent_id} — Export agent as OSSA manifest.
   */
  public function export(string $agent_id): JsonResponse {
    $agent = $this->entityTypeManager
      ->getStorage('agent_definition')
      ->load($agent_id);

    if (!$agent) {
      return new JsonResponse(['error' => "Agent '$agent_id' not found"], 404);
    }

    /** @var \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $agent */
    $manifest = $this->ossaImporter->export($agent);

    return new JsonResponse($manifest, 200, [
      'Content-Type' => 'application/json',
      'Cache-Control' => 'public, max-age=300',
    ]);
  }

}
