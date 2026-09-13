import "dotenv/config";
import path from "node:path";

/**
 * Country-code -> Exact Online base URL. Exact Online has separate clusters
 * per country; the OAuth + REST endpoints all live under the same host.
 * See: https://support.exactonline.com/community/s/knowledge-base#All-All-DNO-Content-restapireference-Login
 */
const COUNTRY_HOSTS: Record<string, string> = {
  nl: "https://start.exactonline.nl",
  be: "https://start.exactonline.be",
  de: "https://start.exactonline.de",
  fr: "https://start.exactonline.fr",
  uk: "https://start.exactonline.co.uk",
  es: "https://start.exactonline.es",
  us: "https://start.exactonline.com",
};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Ontbrekende environment variable: ${name}. Kopieer .env.example naar .env en vul in.`
    );
  }
  return value;
}

export interface Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  country: string;
  baseUrl: string;
  division: string | undefined;
  allowWrite: boolean;
  tokenStorePath: string;
  /** API key die Copilot Studio (of een andere HTTP-client) moet meesturen naar /mcp. */
  mcpApiKey: string | undefined;
  /** Losse sleutel die /oauth/login beschermt tegen willekeurige bezoekers. */
  adminSetupKey: string | undefined;
}

export function loadConfig(): Config {
  const country = (process.env.EXACT_COUNTRY || "nl").toLowerCase();
  const baseUrl = COUNTRY_HOSTS[country];
  if (!baseUrl) {
    throw new Error(
      `Onbekende EXACT_COUNTRY "${country}". Ondersteund: ${Object.keys(COUNTRY_HOSTS).join(", ")}`
    );
  }

  return {
    clientId: required("EXACT_CLIENT_ID", process.env.EXACT_CLIENT_ID),
    clientSecret: required("EXACT_CLIENT_SECRET", process.env.EXACT_CLIENT_SECRET),
    redirectUri: process.env.EXACT_REDIRECT_URI || "http://localhost:8934/callback",
    country,
    baseUrl,
    division: process.env.EXACT_DIVISION || undefined,
    allowWrite: (process.env.ALLOW_WRITE || "false").toLowerCase() === "true",
    tokenStorePath: path.resolve(process.env.TOKEN_STORE_PATH || "./tokens.json"),
    mcpApiKey: process.env.MCP_API_KEY || undefined,
    adminSetupKey: process.env.ADMIN_SETUP_KEY || undefined,
  };
}
