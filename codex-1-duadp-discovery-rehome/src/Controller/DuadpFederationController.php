<?php

declare(strict_types=1);

namespace Drupal\duadp\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\duadp\Service\DuadpFederationService;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * Serves the /api/v1/federation endpoints.
 */
final class DuadpFederationController extends ControllerBase {

  public function __construct(
    protected readonly DuadpFederationService $federationService,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('duadp.federation_service'),
    );
  }

  /**
   * Returns a list of federated peers.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   JSON list of peers.
   */
  public function listPeers(): JsonResponse {
    $peers = $this->federationService->getPeers();

    return new JsonResponse([
      'data' => $peers,
      'meta' => [
        'total' => count($peers),
      ],
    ], 200, ['Access-Control-Allow-Origin' => '*']);
  }

  /**
   * Accepts a registration request from a peer node.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The incoming request.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The registered peer or error response.
   */
  public function registerPeer(Request $request): JsonResponse {
    $payload = json_decode($request->getContent(), TRUE);

    if (empty($payload['url'])) {
      return new JsonResponse(['error' => 'Missing peer URL'], 400);
    }

    try {
      $peer = $this->federationService->registerPeer((string) $payload['url'], $payload['peers'] ?? []);
      return new JsonResponse($peer, 201);
    }
    catch (\Exception $e) {
      return new JsonResponse(['error' => $e->getMessage()], 422);
    }
  }

  /**
   * Receives a revocation propagation from a federated node.
   */
  public function receiveRevocation(Request $request): JsonResponse {
    $payload = json_decode($request->getContent(), TRUE);

    if (empty($payload['gaid'])) {
      return new JsonResponse(['error' => 'Missing GAID'], 400);
    }

    try {
      $this->federationService->registerRevocation($payload);
      return new JsonResponse(['status' => 'revocation received'], 201);
    }
    catch (\Exception $e) {
      return new JsonResponse(['error' => $e->getMessage()], 422);
    }
  }

}
