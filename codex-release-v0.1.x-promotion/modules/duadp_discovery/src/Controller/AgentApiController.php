<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Controller;

use Drupal\bluefly_agent_platform\AgentManager;
use Drupal\bluefly_agent_platform\Entity\AgentRun;
use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Uuid\UuidInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * REST controller for Agent CRUD and execution endpoints.
 */
class AgentApiController extends ControllerBase {

  /**
   * Constructs an AgentApiController.
   */
  public function __construct(
    protected AgentManager $agentManager,
    protected EntityTypeManagerInterface $entityTypeManager,
    protected UuidInterface $uuid,
    protected mixed $serializer,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('bluefly_agent_platform.agent_manager'),
      $container->get('entity_type.manager'),
      $container->get('uuid'),
      $container->get('serializer'),
    );
  }

  /**
   * POST /api/v1/agents — Create agent.
   */
  public function create(Request $request): JsonResponse {
    $data = json_decode($request->getContent(), TRUE);
    if (!$data || empty($data['name'])) {
      return new JsonResponse(['error' => 'Missing required field: name'], 400);
    }

    try {
      $agent = $this->agentManager->createAgent($data);
      $normalized = $this->serializer->normalize($agent, 'json');
      return new JsonResponse($normalized, 201);
    }
    catch (\InvalidArgumentException $e) {
      return new JsonResponse(['error' => $e->getMessage()], 409);
    }
    catch (\Exception $e) {
      return new JsonResponse(['error' => $e->getMessage()], 500);
    }
  }

  /**
   * GET /api/v1/agents/{agent_id} — Get agent.
   */
  public function get(string $agent_id): JsonResponse {
    $agent = $this->entityTypeManager
      ->getStorage('agent_definition')
      ->load($agent_id);

    if (!$agent) {
      return new JsonResponse(['error' => "Agent '$agent_id' not found"], 404);
    }

    return new JsonResponse(
      $this->serializer->normalize($agent, 'json'),
    );
  }

  /**
   * PATCH /api/v1/agents/{agent_id} — Update agent.
   */
  public function update(Request $request, string $agent_id): JsonResponse {
    $agent = $this->entityTypeManager
      ->getStorage('agent_definition')
      ->load($agent_id);

    if (!$agent) {
      return new JsonResponse(['error' => "Agent '$agent_id' not found"], 404);
    }

    $data = json_decode($request->getContent(), TRUE);
    if (!$data) {
      return new JsonResponse(['error' => 'Invalid JSON body'], 400);
    }

    // Apply partial updates.
    $allowedFields = [
      'name' => 'label',
      'description' => 'description',
      'status' => NULL,
      'ossa_manifest' => 'ossa_manifest',
      'approval_policy' => 'approval_policy',
      'provider_profile' => 'provider_profile',
    ];

    foreach ($allowedFields as $inputKey => $entityKey) {
      if (!array_key_exists($inputKey, $data)) {
        continue;
      }
      if ($inputKey === 'status') {
        $agent->set('status', $data['status'] === 'enabled');
      }
      elseif ($entityKey) {
        $agent->set($entityKey, $data[$inputKey]);
      }
    }

    try {
      $agent->save();
      return new JsonResponse(
        $this->serializer->normalize($agent, 'json'),
      );
    }
    catch (\Exception $e) {
      return new JsonResponse(['error' => $e->getMessage()], 500);
    }
  }

  /**
   * DELETE /api/v1/agents/{agent_id} — Delete agent.
   */
  public function delete(string $agent_id): JsonResponse {
    $agent = $this->entityTypeManager
      ->getStorage('agent_definition')
      ->load($agent_id);

    if (!$agent) {
      return new JsonResponse(['error' => "Agent '$agent_id' not found"], 404);
    }

    try {
      // Delete associated tool bindings.
      $bindings = $this->entityTypeManager
        ->getStorage('tool_binding')
        ->loadByProperties(['agent_id' => $agent_id]);
      foreach ($bindings as $binding) {
        $binding->delete();
      }

      $agent->delete();
      return new JsonResponse(NULL, 204);
    }
    catch (\Exception $e) {
      return new JsonResponse(['error' => $e->getMessage()], 500);
    }
  }

  /**
   * POST /api/v1/agents/{agent_id}/execute — Execute agent.
   */
  public function execute(Request $request, string $agent_id): JsonResponse {
    $agent = $this->entityTypeManager
      ->getStorage('agent_definition')
      ->load($agent_id);

    if (!$agent) {
      return new JsonResponse(['error' => "Agent '$agent_id' not found"], 404);
    }

    $data = json_decode($request->getContent(), TRUE);
    if (!$data || !isset($data['input'])) {
      return new JsonResponse(['error' => 'Missing required field: input'], 400);
    }

    try {
      // Create a run entity.
      $runStorage = $this->entityTypeManager->getStorage('agent_run');
      $correlationId = $this->uuid->generate();

      /** @var \Drupal\bluefly_agent_platform\Entity\AgentRun $run */
      $run = $runStorage->create([
        'correlation_id' => $correlationId,
        'status' => AgentRun::STATUS_QUEUED,
        'kind' => $data['kind'] ?? AgentRun::KIND_AGENT_TASK,
        'agent_id' => $agent_id,
        'flow_id' => $data['flow_id'] ?? NULL,
        'workspace_id' => $data['workspace_id'] ?? NULL,
        'input' => json_encode($data['input']),
        'approval_state' => AgentRun::APPROVAL_NOT_REQUIRED,
      ]);
      $run->save();

      $normalized = $this->serializer->normalize($run, 'json');
      return new JsonResponse($normalized, 202);
    }
    catch (\Exception $e) {
      return new JsonResponse(['error' => $e->getMessage()], 500);
    }
  }

}
