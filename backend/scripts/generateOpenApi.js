// backend/scripts/generateOpenApi.js
// Generates and writes backend/docs/openapi.json from validator contracts.

const { writeOpenApiJson } = require('../validators/openapi');

try {
  const filePath = writeOpenApiJson();
  console.log(`OpenAPI specification generated successfully at ${filePath}`);
} catch (err) {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
}
