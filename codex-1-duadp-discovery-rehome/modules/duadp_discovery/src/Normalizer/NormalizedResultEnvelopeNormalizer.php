<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Normalizer;

use Drupal\serialization\Normalizer\NormalizerBase;

/**
 * Normalizes NormalizedResultEnvelope objects.
 *
 * Ensures consistent output format for tool results, including cache tags
 * and audit metadata as required by the DUADP/OSSA blueprint.
 */
class NormalizedResultEnvelopeNormalizer extends NormalizerBase {

  /**
   * {@inheritdoc}
   */
  protected $supportedInterfaceOrClass = NormalizedResultEnvelope::class;

  /**
   * {@inheritdoc}
   *
   * @param \Drupal\bluefly_agent_platform\Normalizer\NormalizedResultEnvelope $object
   *   The result envelope object.
   * @param string|null $format
   *   The format.
   * @param array<string, mixed> $context
   *   Context options.
   *
   * @return array<string, mixed>
   *   The normalized array.
   */
  public function normalize(mixed $object, ?string $format = NULL, array $context = []): array {
    /** @var \Drupal\bluefly_agent_platform\Normalizer\NormalizedResultEnvelope $envelope */
    $envelope = $object;

    return $envelope->toArray();
  }

  /**
   * {@inheritdoc}
   */
  public function getSupportedTypes(?string $format): array {
    return [
      NormalizedResultEnvelope::class => TRUE,
    ];
  }

}
