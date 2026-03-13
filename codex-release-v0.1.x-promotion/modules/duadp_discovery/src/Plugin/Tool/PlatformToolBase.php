<?php
namespace Drupal\bluefly_agent_platform\Plugin\Tool;

use Drupal\tool\Plugin\ToolPluginBase;
use Drupal\bluefly_agent_platform\Contracts\SchemaValidatorInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * A standard base class for all Agent Platform tools.
 * It enforces DRY input validation using our central SchemaValidator.
 */
abstract class PlatformToolBase extends ToolPluginBase implements ContainerFactoryPluginInterface {
  protected SchemaValidatorInterface $validator;

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = new static($configuration, $plugin_id, $plugin_definition);
    $instance->validator = $container->get('agent_platform.schema_validator');
    return $instance;
  }

  /**
   * Defines the JSON Schema ID for this specific tool's expected input.
   */
  abstract protected function getInputSchemaId(): string;

  /**
   * Child classes should call this as their first step in invoke().
   */
  protected function validateInput(array $input): void {
    $result = $this->validator->validate($input, $this->getInputSchemaId());
    if (!$result->isValid()) {
      throw new \InvalidArgumentException($result->getFormattedErrors());
    }
  }
}
