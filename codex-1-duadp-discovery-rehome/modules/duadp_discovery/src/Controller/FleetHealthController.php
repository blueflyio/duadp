<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * Fleet Health Endpoint Controller.
 *
 * Installed on each fleet MEMBER site via ai_agents_client.
 * Responds to GET /_fleet/health with a Drupal-aware health check.
 *
 * The fleet CONTROL PLANE (FleetVerificationService) polls this endpoint
 * after each rollout stage to confirm site health before advancing.
 *
 * Route: ai_agents_client.fleet.health
 *   path: /_fleet/health
 *   method: GET
 *   permission: access fleet health endpoint (public for verification)
 *
 * @see buildkit platform doctor (fleet/health checks)
 */
class FleetHealthController extends ControllerBase {

  /**
   * GET /_fleet/health
   *
   * Returns:
   * {
   *   "status": "ok",
   *   "site_url": "https://example.com",
   *   "drupal_version": "11.x",
   *   "timestamp": 1706123456,
   *   "checks": { "database": "ok", "cache": "ok" }
   * }
   */
  public function health(): JsonResponse {
    $checks = $this->runChecks();
    $allOk = !in_array('fail', array_values($checks), TRUE);

    return new JsonResponse([
      'status' => $allOk ? 'ok' : 'degraded',
      'site_url' => \Drupal::request()->getSchemeAndHttpHost(),
      'drupal_version' => \Drupal::VERSION,
      'timestamp' => time(),
      'checks' => $checks,
    ], $allOk ? 200 : 503);
  }

  /**
   * Run lightweight health checks.
   *
   * @return array<string, 'ok'|'fail'>
   */
  protected function runChecks(): array {
    $checks = [];

    // Database check.
    try {
      \Drupal::database()->select('users', 'u')->countQuery()->execute()->fetchField();
      $checks['database'] = 'ok';
    }
    catch (\Throwable) {
      $checks['database'] = 'fail';
    }

    // Cache check.
    try {
      $cid = 'fleet_health_probe_' . time();
      \Drupal::cache()->set($cid, 1, time() + 10);
      $checks['cache'] = \Drupal::cache()->get($cid) ? 'ok' : 'fail';
      \Drupal::cache()->delete($cid);
    }
    catch (\Throwable) {
      $checks['cache'] = 'fail';
    }

    // State check (confirms Drupal bootstrap is fully operational).
    try {
      \Drupal::state()->get('system.cron_last');
      $checks['state'] = 'ok';
    }
    catch (\Throwable) {
      $checks['state'] = 'fail';
    }

    return $checks;
  }

}
