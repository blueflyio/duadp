<?php

namespace Drupal\duadp_discovery;

use Drupal\Core\Config\Entity\ConfigEntityListBuilder;
use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Url;

/**
 * Provides a list of DuadpNode config entities for the admin UI.
 */
class DuadpNodeListBuilder extends ConfigEntityListBuilder {

  /**
   * {@inheritdoc}
   */
  public function buildHeader(): array {
    return [
      'label'      => $this->t('Node'),
      'node_url'   => $this->t('URL'),
      'trust_tier' => $this->t('Trust Tier'),
      'sync'       => $this->t('Auto-Sync'),
      'status'     => $this->t('Status'),
    ] + parent::buildHeader();
  }

  /**
   * {@inheritdoc}
   */
  public function buildRow(EntityInterface $entity): array {
    /** @var \Drupal\duadp_discovery\Entity\DuadpNode $entity */
    return [
      'label'      => $entity->label(),
      'node_url'   => $entity->node_url,
      'trust_tier' => $entity->trust_tier,
      'sync'       => $entity->sync_enabled ? $this->t('Yes') : $this->t('No'),
      'status'     => $entity->status() ? $this->t('Enabled') : $this->t('Disabled'),
    ] + parent::buildRow($entity);
  }

  /**
   * {@inheritdoc}
   *
   * Adds a "Sync now" operation to each row.
   */
  public function getOperations(EntityInterface $entity): array {
    $operations = parent::getOperations($entity);
    $operations['sync'] = [
      'title' => $this->t('Sync now'),
      'url'   => Url::fromRoute('duadp_discovery.sync', ['duadp_node' => $entity->id()]),
      'weight' => 50,
    ];
    return $operations;
  }

}
