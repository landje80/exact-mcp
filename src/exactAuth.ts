import type { Config } from "./config.js";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: string | number;
  token_type: string;
}

export function buildAuthorizationUrl(config: Config, state: string): string {
  const url = new URL(`${config.baseUrl}/api/oauth2/auth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("force_login", "0");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postForm(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Exact OAuth-fout (${res.status}): ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export async function exchangeCodeForTokens(config: Config, code: string): Promise<TokenResponse> {
  return postForm(`${config.baseUrl}/api/oauth2/token`, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}

export async function refreshTokens(config: Config, refreshToken: string): Promise<TokenResponse> {
  return postForm(`${config.baseUrl}/api/oauth2/token`, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}
