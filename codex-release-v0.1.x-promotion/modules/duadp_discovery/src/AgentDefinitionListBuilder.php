<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform;

use Drupal\bluefly_agent_platform\Entity\AgentDefinition;
use Drupal\Core\Config\Entity\ConfigEntityListBuilder;
use Drupal\Core\Entity\EntityInterface;

/**
 * List builder for AgentDefinition config entities.
 */
class AgentDefinitionListBuilder extends ConfigEntityListBuilder {

  /**
   * {@inheritdoc}
   */
  public function buildHeader(): array {
    $header = [
      'label' => $this->t('Name'),
      'id' => $this->t('Machine name'),
      'status' => $this->t('Status'),
      'ossa_version' => $this->t('OSSA version'),
    ];
    return $header + parent::buildHeader();
  }

  /**
   * {@inheritdoc}
   */
  public function buildRow(EntityInterface $entity): array {
    assert($entity instanceof AgentDefinition);
    $row = [
      'label' => $entity->label(),
      'id' => $entity->id(),
      'status' => $entity->status() ? $this->t('Enabled') : $this->t('Disabled'),
      'ossa_version' => $entity->getOssaVersion() ?: '-',
    ];
    return $row + parent::buildRow($entity);
  }

}
