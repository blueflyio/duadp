<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Controller;

use Drupal\bluefly_agent_platform\AgentManager;
use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * REST controller for DUADP discovery and metrics endpoints.
 */
class DiscoveryController extends ControllerBase {

  /**
   * Constructs a DiscoveryController.
   */
  public function __construct(
    protected AgentManager $agentManager,
    protected EntityTypeManagerInterface $entityTypeManager,
    protected mixed $serializer,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('bluefly_agent_platform.agent_manager'),
      $container->get('entity_type.manager'),
      $container->get('serializer'),
    );
  }

  /**
   * GET /.well-known/duadp.json — DUADP well-known manifest.
   */
  public function wellKnown(): JsonResponse {
    $manifest = [
      'protocol_version' => '0.1.0',
      'node_name' => 'Bluefly Agent Hub',
      'node_description' => 'OSSA/DUADP-native discovery node backed by Drupal config entities',
      'endpoints' => [
        'skills' => '/api/v1/skills',
        'agents' => '/api/v1/agents',
        'tools' => '/api/v1/tools',
        'metrics' => '/api/v1/metrics',
      ],
      'capabilities' => ['skills', 'agents', 'tools', 'metrics'],
      'ossa_versions' => ['v0.4', 'v0.5'],
    ];

    return new JsonResponse($manifest, 200, [
      'Cache-Control' => 'public, max-age=3600',
    ]);
  }

  /**
   * GET /api/v1/agents — List all registered agents (DUADP).
   */
  public function agents(Request $request): JsonResponse {
    $filters = [
      'search' => $request->query->get('search'),
      'status' => $request->query->get('status'),
    ];
    $limit = min((int) ($request->query->get('limit', 20)), 100);
    $offset = max((int) ($request->query->get('offset', 0)), 0);

    $result = $this->agentManager->listAgents(
      array_filter($filters),
      $limit,
      $offset,
    );

    // Normalize entities.
    $data = [];
    foreach ($result['data'] as $agent) {
      $data[] = $this->serializer->normalize($agent, 'json');
    }

    return new JsonResponse([
      'data' => $data,
      'meta' => $result['meta'],
    ], 200, [
      'Cache-Control' => 'public, max-age=300',
    ]);
  }

  /**
   * GET /api/v1/tools — List all registered tools.
   *
   * Returns tool bindings aggregated across all agents, with agent associations.
   */
  public function tools(Request $request): JsonResponse {
    $bindingStorage = $this->entityTypeManager->getStorage('tool_binding');
    $bindings = $bindingStorage->loadMultiple();

    $data = [];
    foreach ($bindings as $binding) {
      /** @var \Drupal\bluefly_agent_platform\Entity\ToolBinding $binding */
      $data[] = [
        'id' => $binding->id(),
        'tool_plugin_id' => $binding->getToolPluginId(),
        'label' => $binding->label(),
        'agent_id' => $binding->getAgentId(),
        'approval_required' => $binding->isApprovalRequired(),
        'max_invocations' => $binding->getMaxInvocations(),
      ];
    }

    // Optional filter by agent.
    $agentFilter = $request->query->get('agent_id');
    if ($agentFilter) {
      $data = array_values(array_filter($data, fn($t) => $t['agent_id'] === $agentFilter));
    }

    return new JsonResponse([
      'data' => $data,
      'meta' => ['count' => count($data)],
    ], 200, [
      'Cache-Control' => 'public, max-age=300',
    ]);
  }

  /**
   * GET /api/v1/skills — List skills (aggregated capabilities).
   *
   * Skills are composite capabilities derived from agent capabilities
   * and tool bindings. Each agent's capabilities + tools form its "skills."
   */
  public function skills(Request $request): JsonResponse {
    $agentStorage = $this->entityTypeManager->getStorage('agent_definition');
    $agents = $agentStorage->loadMultiple();

    $skills = [];
    foreach ($agents as $agent) {
      /** @var \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $agent */
      if (!$agent->status()) {
        continue;
      }

      $capabilities = $agent->getCapabilities();
      $manifest = $agent->getOssaManifest();

      // Build skill entry from capabilities and manifest spec.
      $agentSkills = [];
      foreach ($capabilities as $cap) {
        $agentSkills[] = [
          'name' => $cap,
          'agent_id' => $agent->id(),
          'agent_name' => $agent->label(),
          'ossa_version' => $agent->getOssaVersion() ?: NULL,
        ];
      }

      // Also include skills from manifest extensions.
      if (!empty($manifest['spec']['skills'])) {
        foreach ($manifest['spec']['skills'] as $skill) {
          $name = is_array($skill) ? ($skill['name'] ?? '') : (string) $skill;
          if ($name) {
            $agentSkills[] = [
              'name' => $name,
              'description' => is_array($skill) ? ($skill['description'] ?? '') : '',
              'agent_id' => $agent->id(),
              'agent_name' => $agent->label(),
            ];
          }
        }
      }

      $skills = array_merge($skills, $agentSkills);
    }

    // Optional search filter.
    $search = $request->query->get('q');
    if ($search) {
      $search = mb_strtolower($search);
      $skills = array_values(array_filter($skills, fn($s) =>
        str_contains(mb_strtolower($s['name'] ?? ''), $search) ||
        str_contains(mb_strtolower($s['description'] ?? ''), $search) ||
        str_contains(mb_strtolower($s['agent_name'] ?? ''), $search)
      ));
    }

    return new JsonResponse([
      'data' => $skills,
      'meta' => ['count' => count($skills)],
    ], 200, [
      'Cache-Control' => 'public, max-age=300',
    ]);
  }

  /**
   * GET /api/v1/discovery/agent-card/{agent_id} — Agent discovery card.
   */
  public function agentCard(string $agent_id): JsonResponse {
    $agent = $this->entityTypeManager
      ->getStorage('agent_definition')
      ->load($agent_id);

    if (!$agent) {
      return new JsonResponse(['error' => "Agent '$agent_id' not found"], 404);
    }

    /** @var \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $agent */
    $bindings = $this->entityTypeManager
      ->getStorage('tool_binding')
      ->loadByProperties(['agent_id' => $agent_id]);

    $card = [
      'id' => $agent->id(),
      'name' => $agent->label(),
      'description' => $agent->getDescription(),
      'capabilities' => $agent->getCapabilities(),
      'ossa_version' => $agent->getOssaVersion() ?: NULL,
      'tools_count' => count($bindings),
      'status' => $agent->status() ? 'enabled' : 'disabled',
    ];

    return new JsonResponse($card, 200, [
      'Cache-Control' => 'public, max-age=300',
    ]);
  }

  /**
   * GET /api/v1/metrics — Platform metrics (DUADP).
   */
  public function metrics(): JsonResponse {
    // Count agents.
    $agentStorage = $this->entityTypeManager->getStorage('agent_definition');
    $allAgents = $agentStorage->loadMultiple();
    $enabledAgents = array_filter($allAgents, fn($a) => $a->status());

    // Count tools.
    $toolCount = count($this->entityTypeManager
      ->getStorage('tool_binding')
      ->loadMultiple());

    // Count runs.
    $runStorage = $this->entityTypeManager->getStorage('agent_run');
    $totalRuns = (int) $runStorage->getQuery()
      ->accessCheck(FALSE)
      ->count()
      ->execute();

    $activeRuns = (int) $runStorage->getQuery()
      ->accessCheck(FALSE)
      ->condition('status', ['queued', 'running', 'waiting_approval'], 'IN')
      ->count()
      ->execute();

    $succeededRuns = (int) $runStorage->getQuery()
      ->accessCheck(FALSE)
      ->condition('status', 'succeeded')
      ->count()
      ->execute();

    $failedRuns = (int) $runStorage->getQuery()
      ->accessCheck(FALSE)
      ->condition('status', 'failed')
      ->count()
      ->execute();

    $pendingApprovals = (int) $runStorage->getQuery()
      ->accessCheck(FALSE)
      ->condition('status', 'waiting_approval')
      ->count()
      ->execute();

    return new JsonResponse([
      'agents_total' => count($allAgents),
      'agents_enabled' => count($enabledAgents),
      'tools_total' => $toolCount,
      'runs_total' => $totalRuns,
      'runs_active' => $activeRuns,
      'runs_succeeded' => $succeededRuns,
      'runs_failed' => $failedRuns,
      'approvals_pending' => $pendingApprovals,
      'timestamp' => date('c'),
    ]);
  }

  /**
   * GET /api/v1/openapi.json — OpenAPI 3.1 specification.
   *
   * Serves a contract-first spec that documents all platform endpoints.
   */
  public function openapi(): JsonResponse {
    $spec = [
      'openapi' => '3.1.0',
      'info' => [
        'title' => 'Bluefly Agent Platform API',
        'version' => '0.1.0',
        'description' => 'OSSA/DUADP-native Drupal agent platform. Manages agent definitions, tool bindings, approval policies, and run lifecycle.',
        'license' => [
          'name' => 'GPL-2.0-or-later',
          'url' => 'https://www.gnu.org/licenses/gpl-2.0.html',
        ],
      ],
      'paths' => [
        '/.well-known/duadp.json' => [
          'get' => [
            'summary' => 'DUADP well-known manifest',
            'operationId' => 'getDuadpManifest',
            'tags' => ['Discovery'],
            'responses' => [
              '200' => ['description' => 'DUADP manifest with endpoint registry'],
            ],
          ],
        ],
        '/api/v1/agents' => [
          'get' => [
            'summary' => 'List agent definitions',
            'operationId' => 'listAgents',
            'tags' => ['Agents'],
            'parameters' => [
              ['name' => 'search', 'in' => 'query', 'schema' => ['type' => 'string']],
              ['name' => 'status', 'in' => 'query', 'schema' => ['type' => 'string', 'enum' => ['enabled', 'disabled']]],
              ['name' => 'limit', 'in' => 'query', 'schema' => ['type' => 'integer', 'default' => 20]],
              ['name' => 'offset', 'in' => 'query', 'schema' => ['type' => 'integer', 'default' => 0]],
            ],
            'responses' => [
              '200' => ['description' => 'Paginated agent list'],
            ],
          ],
          'post' => [
            'summary' => 'Create agent definition',
            'operationId' => 'createAgent',
            'tags' => ['Agents'],
            'responses' => [
              '201' => ['description' => 'Agent created'],
            ],
          ],
        ],
        '/api/v1/agents/{agent_id}' => [
          'get' => [
            'summary' => 'Get agent definition',
            'operationId' => 'getAgent',
            'tags' => ['Agents'],
            'responses' => [
              '200' => ['description' => 'Agent definition'],
              '404' => ['description' => 'Agent not found'],
            ],
          ],
          'patch' => [
            'summary' => 'Update agent definition',
            'operationId' => 'updateAgent',
            'tags' => ['Agents'],
            'responses' => [
              '200' => ['description' => 'Agent updated'],
            ],
          ],
          'delete' => [
            'summary' => 'Delete agent definition',
            'operationId' => 'deleteAgent',
            'tags' => ['Agents'],
            'responses' => [
              '204' => ['description' => 'Agent deleted'],
            ],
          ],
        ],
        '/api/v1/agents/{agent_id}/execute' => [
          'post' => [
            'summary' => 'Execute agent (creates a run)',
            'operationId' => 'executeAgent',
            'tags' => ['Runs'],
            'responses' => [
              '202' => ['description' => 'Run created (async)'],
            ],
          ],
        ],
        '/api/v1/runs' => [
          'get' => [
            'summary' => 'List runs',
            'operationId' => 'listRuns',
            'tags' => ['Runs'],
            'responses' => [
              '200' => ['description' => 'Paginated run list'],
            ],
          ],
        ],
        '/api/v1/runs/{run_id}' => [
          'get' => [
            'summary' => 'Get run details',
            'operationId' => 'getRun',
            'tags' => ['Runs'],
            'responses' => [
              '200' => ['description' => 'Run details'],
            ],
          ],
        ],
        '/api/v1/runs/{run_id}/logs' => [
          'get' => [
            'summary' => 'Stream run logs',
            'operationId' => 'getRunLogs',
            'tags' => ['Runs'],
            'responses' => [
              '200' => ['description' => 'Append-only log entries'],
            ],
          ],
        ],
        '/api/v1/runs/{run_id}/approve' => [
          'post' => [
            'summary' => 'Approve or reject a run',
            'operationId' => 'approveRun',
            'tags' => ['Runs'],
            'responses' => [
              '200' => ['description' => 'Run approved/rejected'],
            ],
          ],
        ],
        '/api/v1/tools' => [
          'get' => [
            'summary' => 'List registered tools',
            'operationId' => 'listTools',
            'tags' => ['Discovery'],
            'responses' => [
              '200' => ['description' => 'Tool binding list'],
            ],
          ],
        ],
        '/api/v1/skills' => [
          'get' => [
            'summary' => 'List skills (aggregated capabilities)',
            'operationId' => 'listSkills',
            'tags' => ['Discovery'],
            'parameters' => [
              ['name' => 'q', 'in' => 'query', 'schema' => ['type' => 'string']],
            ],
            'responses' => [
              '200' => ['description' => 'Skills list'],
            ],
          ],
        ],
        '/api/v1/metrics' => [
          'get' => [
            'summary' => 'Platform metrics',
            'operationId' => 'getMetrics',
            'tags' => ['Discovery'],
            'responses' => [
              '200' => ['description' => 'Metric counters'],
            ],
          ],
        ],
        '/api/v1/ossa/import' => [
          'post' => [
            'summary' => 'Import OSSA manifest',
            'operationId' => 'importOssaManifest',
            'tags' => ['OSSA'],
            'responses' => [
              '201' => ['description' => 'Agent created from manifest'],
            ],
          ],
        ],
        '/api/v1/ossa/export/{agent_id}' => [
          'get' => [
            'summary' => 'Export agent as OSSA manifest',
            'operationId' => 'exportOssaManifest',
            'tags' => ['OSSA'],
            'responses' => [
              '200' => ['description' => 'OSSA manifest'],
            ],
          ],
        ],
      ],
      'tags' => [
        ['name' => 'Agents', 'description' => 'Agent definition CRUD'],
        ['name' => 'Runs', 'description' => 'Run lifecycle management'],
        ['name' => 'Discovery', 'description' => 'DUADP discovery endpoints'],
        ['name' => 'OSSA', 'description' => 'OSSA manifest operations'],
      ],
    ];

    return new JsonResponse($spec, 200, [
      'Content-Type' => 'application/json',
      'Cache-Control' => 'public, max-age=3600',
    ]);
  }

}
