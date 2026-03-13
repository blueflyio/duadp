<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;

/**
 * Manages feature flags for optional contrib module integrations.
 *
 * Provides centralized control over which optional features are enabled
 * and checks if required modules/libraries are available.
 */
class FeatureManager {

  use StringTranslationTrait;

  /**
   * The config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected ConfigFactoryInterface $configFactory;

  /**
   * The module handler.
   *
   * @var \Drupal\Core\Extension\ModuleHandlerInterface
   */
  protected ModuleHandlerInterface $moduleHandler;

  /**
   * Constructs a FeatureManager object.
   *
   * @param \Drupal\Core\Config\ConfigFactoryInterface $config_factory
   *   The config factory.
   * @param \Drupal\Core\Extension\ModuleHandlerInterface $module_handler
   *   The module handler.
   */
  public function __construct(
    ConfigFactoryInterface $config_factory,
    ModuleHandlerInterface $module_handler,
  ) {
    $this->configFactory = $config_factory;
    $this->moduleHandler = $module_handler;
  }

  /**
   * Checks if a feature is enabled and available.
   *
   * @param string $feature
   *   The feature machine name.
   *
   * @return bool
   *   TRUE if feature is enabled and all requirements are met, FALSE otherwise.
   */
  public function isEnabled(string $feature): bool {
    $config = $this->configFactory->get('ai_agents_communication.features');
    $features = $config->get('features');

    if (!isset($features[$feature])) {
      return FALSE;
    }

    $feature_config = $features[$feature];

    // Check if feature is enabled in config.
    if (empty($feature_config['enabled'])) {
      return FALSE;
    }

    // Check if all required modules are installed.
    if (!$this->isAvailable($feature)) {
      return FALSE;
    }

    return TRUE;
  }

  /**
   * Checks if a feature's requirements are available.
   *
   * @param string $feature
   *   The feature machine name.
   *
   * @return bool
   *   TRUE if all required modules/libraries are available, FALSE otherwise.
   */
  public function isAvailable(string $feature): bool {
    $config = $this->configFactory->get('ai_agents_communication.features');
    $features = $config->get('features');

    if (!isset($features[$feature])) {
      return FALSE;
    }

    $feature_config = $features[$feature];

    // Check required modules.
    if (!empty($feature_config['required_modules'])) {
      foreach ($feature_config['required_modules'] as $module) {
        if (!$this->moduleHandler->moduleExists($module)) {
          return FALSE;
        }
      }
    }

    return TRUE;
  }

  /**
   * Gets all features with their status.
   *
   * @return array
   *   Array of features with keys:
   *   - label: Human-readable name
   *   - description: Feature description
   *   - enabled: Whether enabled in config
   *   - available: Whether requirements are met
   *   - active: Whether enabled AND available
   *   - required_modules: List of required modules
   *   - category: Feature category
   */
  public function getFeatures(): array {
    $config = $this->configFactory->get('ai_agents_communication.features');
    $features = $config->get('features') ?? [];
    $result = [];

    foreach ($features as $machine_name => $feature_config) {
      $available = $this->isAvailable($machine_name);
      $enabled = !empty($feature_config['enabled']);

      $result[$machine_name] = [
        'label' => $feature_config['label'] ?? $machine_name,
        'description' => $feature_config['description'] ?? '',
        'enabled' => $enabled,
        'available' => $available,
        'active' => $enabled && $available,
        'required_modules' => $feature_config['required_modules'] ?? [],
        'category' => $feature_config['category'] ?? 'other',
      ];
    }

    return $result;
  }

  /**
   * Gets all features in a specific category.
   *
   * @param string $category
   *   The category machine name.
   *
   * @return array
   *   Array of features in the category.
   */
  public function getFeaturesByCategory(string $category): array {
    $all_features = $this->getFeatures();
    return array_filter($all_features, function ($feature) use ($category) {
      return $feature['category'] === $category;
    });
  }

  /**
   * Gets all feature categories.
   *
   * @return array
   *   Array of categories with label, description, and weight.
   */
  public function getCategories(): array {
    $config = $this->configFactory->get('ai_agents_communication.features');
    return $config->get('categories') ?? [];
  }

  /**
   * Enables a feature.
   *
   * @param string $feature
   *   The feature machine name.
   *
   * @return bool
   *   TRUE if feature was enabled, FALSE if requirements not met.
   */
  public function enableFeature(string $feature): bool {
    if (!$this->isAvailable($feature)) {
      return FALSE;
    }

    $config = $this->configFactory->getEditable('ai_agents_communication.features');
    $features = $config->get('features');

    if (!isset($features[$feature])) {
      return FALSE;
    }

    $features[$feature]['enabled'] = TRUE;
    $config->set('features', $features)->save();

    return TRUE;
  }

  /**
   * Disables a feature.
   *
   * @param string $feature
   *   The feature machine name.
   */
  public function disableFeature(string $feature): void {
    $config = $this->configFactory->getEditable('ai_agents_communication.features');
    $features = $config->get('features');

    if (!isset($features[$feature])) {
      return;
    }

    $features[$feature]['enabled'] = FALSE;
    $config->set('features', $features)->save();
  }

}
