<?php

namespace Drupal\duadp_discovery\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Url;
use Drupal\duadp_discovery\DuadpDiscoveryService;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\RedirectResponse;

/**
 * Handles manual DUADP sync requests from the admin UI.
 */
class DuadpSyncController extends ControllerBase {

  public function __construct(
    private readonly DuadpDiscoveryService $discoveryService,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('duadp_discovery.service'),
    );
  }

  /**
   * Triggers a manual sync and redirects back to the node list.
   */
  public function sync(): RedirectResponse {
    $this->discoveryService->syncPluginCatalogue();
    $this->messenger()->addStatus($this->t('DUADP plugin catalogue sync triggered. Check the logs for results.'));
    return new RedirectResponse(Url::fromRoute('duadp_discovery.node_collection')->toString());
  }

}
