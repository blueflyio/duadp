<?php

declare(strict_types=1);

namespace Drupal\duadp\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\Url;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Serves the /.well-known/duadp.json endpoint for the node.
 */
final class DuadpManifestController extends ControllerBase {

  public function __construct(
    protected RequestStack $requestStack,
    ModuleHandlerInterface $moduleHandler,
  ) {
    $this->moduleHandler = $moduleHandler;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('request_stack'),
      $container->get('module_handler'),
    );
  }

  /**
   * Returns the node discovery manifest.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The DUADP manifest as JSON.
   */
  public function manifest(): JsonResponse {
    $config = $this->config('duadp.settings');
    $siteConfig = $this->config('system.site');

    $request = $this->requestStack->getCurrentRequest();
    $baseUrl = $request ? $request->getSchemeAndHttpHost() : '';

    // Build dynamic capabilities and endpoints.
    $capabilities = ['skills', 'agents', 'federation', 'revocations', 'trust-verification'];
    $endpoints = [
      'skills'      => $baseUrl . Url::fromRoute('duadp.registry.skills')->toString(),
      'agents'      => $baseUrl . Url::fromRoute('duadp.registry.agents')->toString(),
      'federation'  => $baseUrl . Url::fromRoute('duadp.federation.peers')->toString(),
      'revocations' => $baseUrl . Url::fromRoute('duadp.federation.revocation')->toString(),
    ];

    // When project_context_connector is installed, expose its snapshot endpoints.
    // AI agents and the Fleet Manager can then read live site state (PHP version,
    // active modules, security status) without requiring Drupal user credentials.
    if ($this->moduleHandler->moduleExists('project_context_connector')) {
      $endpoints['context_snapshot']        = $baseUrl . '/project-context-connector/snapshot';
      $endpoints['context_snapshot_signed'] = $baseUrl . '/project-context-connector/snapshot/signed';
      $capabilities[] = 'context-snapshot';
    }

    // When the orchestration module is installed and an N8N webhook URL is
    // configured, advertise fleet dispatch capability so the Fleet Manager knows
    // this node can receive N8N-driven bulk operations (updates, cache clears, etc).
    if ($this->moduleHandler->moduleExists('orchestration')) {
      $capabilities[] = 'orchestration';
      $n8nWebhookUrl = $config->get('n8n_webhook_url');
      if ($n8nWebhookUrl) {
        $endpoints['n8n_fleet_dispatch'] = rtrim($n8nWebhookUrl, '/') . '/fleet/dispatch';
        $capabilities[] = 'n8n-fleet-dispatch';
      }
    }

    $response = [
      'protocol_version' => '0.2.0',
      'node_name'        => $config->get('node_name') ?: $siteConfig->get('name'),
      'node_description' => $config->get('node_description') ?: 'Drupal DUADP Node',
      'contact'          => $siteConfig->get('mail'),
      'endpoints'        => $endpoints,
      'capabilities'     => $capabilities,
      'ossa_versions'    => ['v0.4', 'v0.5'],
    ];

    // If there is a public key configured for verifying this node's identity.
    $publicKey = $config->get('public_key');
    if ($publicKey) {
      $response['public_key'] = $publicKey;
    }

    $jsonResponse = new JsonResponse($response);
    $jsonResponse->headers->set('Content-Type', 'application/json');
    $jsonResponse->headers->set('Access-Control-Allow-Origin', '*');

    return $jsonResponse;
  }

}
