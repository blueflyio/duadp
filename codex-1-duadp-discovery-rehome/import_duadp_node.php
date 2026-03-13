<?php

/**
 * @file
 * Script to import the DUADP Reference Node as a native MCP Server.
 */

try {
  $entity_type_manager = \Drupal::entityTypeManager();
  $storage = $entity_type_manager->getStorage('mcp_server');

  // Check if it already exists.
  $existing = $storage->loadByProperties(['title' => 'DUADP Reference Node']);
  if (!empty($existing)) {
    echo "MCP Server 'DUADP Reference Node' already exists.\n";
    return;
  }

  // Define server entity properties.
  $mcp_server = $storage->create([
    'type' => 'mcp_server',
    'title' => 'DUADP Reference Node',
    // We assume field_server_type handles connection strings, falling back to basic fields.
    'field_server_type' => 'sse',
    'field_endpoint_url' => 'http://localhost:3000/mcp',
  ]);

  $mcp_server->save();
  echo "Successfully created MCP Server: DUADP Reference Node (ID: " . $mcp_server->id() . ")\n";

} catch (\Exception $e) {
  echo "Error creating MCP server entity: " . $e->getMessage() . "\n";
}
