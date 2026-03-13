<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Config\Entity\ConfigEntityListBuilder;
use Drupal\Core\Datetime\DateFormatterInterface;
use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Entity\EntityStorageInterface;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Entity\EntityHandlerInterface;
use Drupal\Core\Datetime\TimeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * List builder for A2A Agent config entities.
 */
class A2aAgentListBuilder extends ConfigEntityListBuilder implements EntityHandlerInterface {

  /**
   * The date formatter service.
   *
   * @var \Drupal\Core\Datetime\DateFormatterInterface
   */
  protected DateFormatterInterface $dateFormatter;

  /**
   * The time service.
   *
   * @var \Drupal\Core\Datetime\TimeInterface
   */
  protected TimeInterface $time;

  /**
   * Constructs a new A2aAgentListBuilder.
   *
   * @param \Drupal\Core\Entity\EntityTypeInterface $entity_type
   *   The entity type definition.
   * @param \Drupal\Core\Entity\EntityStorageInterface $storage
   *   The entity storage.
   * @param \Drupal\Core\Datetime\DateFormatterInterface $date_formatter
   *   The date formatter service.
   * @param \Drupal\Core\Datetime\TimeInterface $time
   *   The time service.
   */
  public function __construct(
    EntityTypeInterface $entity_type,
    EntityStorageInterface $storage,
    DateFormatterInterface $date_formatter,
    TimeInterface $time,
  ) {
    parent::__construct($entity_type, $storage);
    $this->dateFormatter = $date_formatter;
    $this->time = $time;
  }

  /**
   * {@inheritdoc}
   */
  public static function createInstance(ContainerInterface $container, EntityTypeInterface $entity_type): static {
    return new static(
      $entity_type,
      $container->get('entity_type.manager')->getStorage($entity_type->id()),
      $container->get('date.formatter'),
      $container->get('datetime.time'),
    );
  }

  /**
   * {@inheritdoc}
   */
  public function buildHeader(): array {
    $header['label'] = $this->t('Agent');
    $header['agent_type'] = $this->t('Type');
    $header['endpoint_url'] = $this->t('Endpoint');
    $header['status'] = $this->t('Status');
    $header['last_seen'] = $this->t('Last seen');
    return $header + parent::buildHeader();
  }

  /**
   * {@inheritdoc}
   */
  public function buildRow(EntityInterface $entity): array {
    assert($entity instanceof A2aAgentInterface);
    $row['label'] = $entity->label();
    $row['agent_type'] = $entity->getAgentType() ?: $this->t('—');
    $row['endpoint_url'] = $entity->getEndpointUrl() ?: $this->t('—');
    $row['status'] = $entity->status() ? $this->t('Active') : $this->t('Inactive');
    $last_seen = $entity->getLastSeen();
    $row['last_seen'] = $last_seen
      ? $this->t('@time ago', ['@time' => $this->dateFormatter->formatInterval($this->time->getRequestTime() - $last_seen)])
      : $this->t('Never');
    return $row + parent::buildRow($entity);
  }

}
