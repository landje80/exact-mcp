// Handmatig gecompileerd (CommonJS) uit src/exactAuth.ts.
"use strict";

function buildAuthorizationUrl(config, state) {
  const url = new URL(`${config.baseUrl}/api/oauth2/auth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("force_login", "0");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postForm(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Exact OAuth-fout (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

async function exchangeCodeForTokens(config, code) {
  return postForm(`${config.baseUrl}/api/oauth2/token`, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}

async function refreshTokens(config, refreshToken) {
  return postForm(`${config.baseUrl}/api/oauth2/token`, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}

module.exports = { buildAuthorizationUrl, exchangeCodeForTokens, refreshTokens };
