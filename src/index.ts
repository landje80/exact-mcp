import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ExactClient } from "./exactClient.js";
import { buildMcpServer } from "./mcpServer.js";

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
