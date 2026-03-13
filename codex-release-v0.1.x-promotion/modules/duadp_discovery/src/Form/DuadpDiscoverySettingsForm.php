<?php

namespace Drupal\duadp_discovery\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Url;

/**
 * Settings form for the DUADP Discovery module.
 *
 * Provides site-level configuration that applies across all DuadpNode
 * config entities, such as the site's own node identity and global sync settings.
 */
class DuadpDiscoverySettingsForm extends ConfigFormBase {

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames(): array {
    return ['duadp_discovery.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'duadp_discovery_settings_form';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('duadp_discovery.settings');

    $form['node_identity'] = [
      '#type' => 'details',
      '#title' => $this->t('This Site as a DUADP Node'),
      '#open' => TRUE,
    ];

    $form['node_identity']['node_id'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Node DID'),
      '#description' => $this->t('The W3C DID for this site, e.g. <code>did:web:yourdomain.com</code>. This will appear as the source in the DUADP federation mesh.'),
      '#default_value' => $config->get('node_id') ?: 'did:web:' . \Drupal::request()->getHost(),
      '#required' => TRUE,
    ];

    $form['node_identity']['node_name'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Node Name'),
      '#default_value' => $config->get('node_name') ?: \Drupal::config('system.site')->get('name') . ' DUADP Node',
      '#required' => TRUE,
    ];

    $form['sync'] = [
      '#type' => 'details',
      '#title' => $this->t('Sync Settings'),
      '#open' => TRUE,
    ];

    $form['sync']['auto_sync'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Sync on cron'),
      '#description' => $this->t('When enabled, all drupal/ai plugin definitions are synced to configured DUADP nodes on each cron run.'),
      '#default_value' => $config->get('auto_sync') ?? TRUE,
    ];

    $form['sync']['trust_tier_default'] = [
      '#type' => 'select',
      '#title' => $this->t('Default Trust Tier'),
      '#options' => [
        'community' => $this->t('Community (no signing required)'),
        'signed' => $this->t('Signed (Ed25519 signature required)'),
        'verified-signature' => $this->t('Verified Signature (signature + DID)'),
        'verified' => $this->t('Verified (signature + DID + DNS proof)'),
        'official' => $this->t('Official (highest tier)'),
      ],
      '#default_value' => $config->get('trust_tier_default') ?? 'community',
    ];

    $form['nodes_link'] = [
      '#markup' => '<p>' . $this->t('<a href=":url">Manage DUADP registry nodes →</a>', [
        ':url' => Url::fromRoute('duadp_discovery.node_collection')->toString(),
      ]) . '</p>',
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->config('duadp_discovery.settings')
      ->set('node_id', $form_state->getValue('node_id'))
      ->set('node_name', $form_state->getValue('node_name'))
      ->set('auto_sync', (bool) $form_state->getValue('auto_sync'))
      ->set('trust_tier_default', $form_state->getValue('trust_tier_default'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
