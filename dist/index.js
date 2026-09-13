// Handmatig gecompileerd (CommonJS) uit src/index.ts.
// Lokale stdio-server, voor gebruik met Claude Code/Desktop op je eigen
// machine (npm start). Niet gebruikt door de Plesk/Copilot Studio-deployment
// — daarvoor is dist/httpApp.js (via app.js) de ingang.
"use strict";
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { loadConfig } = require("./config.js");
const { ExactClient } = require("./exactClient.js");
const { buildMcpServer } = require("./mcpServer.js");

const config = loadConfig();
const client = new ExactClient(config);
const server = buildMcpServer(config, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Exact Online MCP server (stdio) gestart (${config.country}, ${config.allowWrite ? "lezen+schrijven" : "alleen-lezen"}).`
  );
}

main().catch((err) => {
  console.error("Fout bij opstarten MCP server:", err);
  process.exit(1);
});
