// backend/scripts/generateOpenApi.js
// Generates and writes docs/openapi.json from backend/openapi/spec.js contracts.

const { writeOpenApiJson } = require('../openapi/spec');

try {
  const filePath = writeOpenApiJson();
  console.log(`OpenAPI specification generated successfully at ${filePath}`);
} catch (err) {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
}
