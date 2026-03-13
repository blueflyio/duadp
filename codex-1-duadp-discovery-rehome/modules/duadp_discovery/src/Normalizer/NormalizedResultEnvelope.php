<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Normalizer;

/**
 * Value object for normalized tool results.
 *
 * Every tool invocation should return results wrapped in this envelope.
 * This ensures cache metadata, audit fields, and provenance are consistently
 * carried alongside the actual result data.
 *
 * Mirrors the Zod NormalizedResultEnvelope from the control plane contract:
 * - tool_name: string
 * - ok: boolean
 * - result: mixed
 * - cache: { tags, contexts, max_age }
 * - audit: { source, started_at, finished_at, correlation_id }
 *
 * @see \Drupal\bluefly_agent_platform\Service\OssaManifestImporter
 */
final class NormalizedResultEnvelope {

  /**
   * Source constants.
   */
  public const SOURCE_TOOL_API = 'drupal_tool_api';
  public const SOURCE_MCP = 'mcp';
  public const SOURCE_CLI = 'cli';
  public const SOURCE_WORKFLOW = 'workflow';

  /**
   * Constructs a NormalizedResultEnvelope.
   *
   * @param string $toolName
   *   The tool plugin ID that produced this result.
   * @param bool $ok
   *   Whether the tool execution succeeded.
   * @param mixed $result
   *   The actual result payload (any serializable data).
   * @param array<string, mixed> $cache
   *   Cache metadata: 'tags' (string[]), 'contexts' (string[]), 'max_age' (int).
   * @param array<string, mixed> $audit
   *   Audit metadata: 'source', 'started_at', 'finished_at', 'correlation_id'.
   */
  public function __construct(
    public readonly string $toolName,
    public readonly bool $ok,
    public readonly mixed $result,
    public readonly array $cache = [],
    public readonly array $audit = [],
  ) {}

  /**
   * Creates a successful result envelope.
   *
   * @param string $toolName
   *   The tool name.
   * @param mixed $result
   *   The result data.
   * @param string $source
   *   The source (drupal_tool_api, mcp, cli, workflow).
   * @param string|null $correlationId
   *   Optional correlation ID for tracing.
   * @param array<string> $cacheTags
   *   Optional Drupal cache tags.
   * @param array<string> $cacheContexts
   *   Optional Drupal cache contexts.
   * @param int $maxAge
   *   Cache max age in seconds (0 = no caching).
   */
  public static function success(
    string $toolName,
    mixed $result,
    string $source = self::SOURCE_TOOL_API,
    ?string $correlationId = NULL,
    array $cacheTags = [],
    array $cacheContexts = [],
    int $maxAge = 0,
  ): self {
    return new self(
      toolName: $toolName,
      ok: TRUE,
      result: $result,
      cache: [
        'tags' => $cacheTags,
        'contexts' => $cacheContexts,
        'max_age' => $maxAge,
      ],
      audit: [
        'source' => $source,
        'started_at' => date('c'),
        'finished_at' => date('c'),
        'correlation_id' => $correlationId,
      ],
    );
  }

  /**
   * Creates a failure result envelope.
   *
   * @param string $toolName
   *   The tool name.
   * @param string $errorMessage
   *   The error message.
   * @param string $source
   *   The source.
   * @param string|null $correlationId
   *   Optional correlation ID.
   */
  public static function failure(
    string $toolName,
    string $errorMessage,
    string $source = self::SOURCE_TOOL_API,
    ?string $correlationId = NULL,
  ): self {
    return new self(
      toolName: $toolName,
      ok: FALSE,
      result: ['error' => $errorMessage],
      cache: ['tags' => [], 'contexts' => [], 'max_age' => 0],
      audit: [
        'source' => $source,
        'started_at' => date('c'),
        'finished_at' => date('c'),
        'correlation_id' => $correlationId,
      ],
    );
  }

  /**
   * Converts the envelope to an array suitable for JSON encoding.
   *
   * @return array<string, mixed>
   *   The envelope as an associative array.
   */
  public function toArray(): array {
    return [
      'tool_name' => $this->toolName,
      'ok' => $this->ok,
      'result' => $this->result,
      'cache' => [
        'tags' => $this->cache['tags'] ?? [],
        'contexts' => $this->cache['contexts'] ?? [],
        'max_age' => $this->cache['max_age'] ?? 0,
      ],
      'audit' => [
        'source' => $this->audit['source'] ?? self::SOURCE_TOOL_API,
        'started_at' => $this->audit['started_at'] ?? '',
        'finished_at' => $this->audit['finished_at'] ?? '',
        'correlation_id' => $this->audit['correlation_id'] ?? NULL,
      ],
    ];
  }

}
