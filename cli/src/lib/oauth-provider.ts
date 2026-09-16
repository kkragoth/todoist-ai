import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type {
    OAuthClientInformationMixed,
    OAuthClientMetadata,
    OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
    auth,
    discoverOAuthServerInfo,
    refreshAuthorization,
    type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import {
    clearOAuthData,
    isAccessTokenExpired,
    loadOAuthData,
    saveOAuthData,
    type StoredTokens,
} from "@/lib/oauth-store.js";

/** OAuth 2.1 login for the CLI (RFC 8252 native app, loopback callback).
 * The backend is its own authorization server with dynamic client
 * registration, so no pre-registered client id is needed: the MCP SDK
 * discovers metadata, registers, and exchanges the code — this module
 * only owns the loopback listener, the browser launch, and persistence.
 * Issued tokens are the same JWT format as password login, so every
 * `Authorization: Bearer` call site works unchanged. */

const CLIENT_NAME = "todoist-ai-cli";
const CALLBACK_PATH = "/callback";
/** Fixed loopback port so the registered redirect URI stays valid across
 * launches (dynamic client registration persists server-side). Falls back
 * to an ephemeral port when busy, re-registering for that run. */
const CALLBACK_PORT = 18731;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export function mcpServerUrl(apiUrl: string): string {
    return `${apiUrl.replace(/\/$/, "")}/mcp/`;
}

interface CallbackServer {
    url: string;
    waitForCode: () => Promise<string>;
    close: () => void;
}

export type { CallbackServer };

/** Listen on 127.0.0.1 (fixed port, ephemeral fallback); resolves with
 * the `code` query param when the backend redirects back after login.
 * Exported for tests; prefer loginWithOAuth. */
export function startCallbackServer(): Promise<CallbackServer> {
    return listenOn(CALLBACK_PORT).catch((err) => {
        if ((err as NodeJS.ErrnoException)?.code === "EADDRINUSE") return listenOn(0);
        throw err;
    });
}

function listenOn(port: number): Promise<CallbackServer> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let codePromise: Promise<string>;
        let codeResolve!: (code: string) => void;
        let codeReject!: (err: Error) => void;
        codePromise = new Promise<string>((res, rej) => {
            codeResolve = res;
            codeReject = rej;
        });
        const server: Server = createServer((req, res) => {
            const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");
            if (reqUrl.pathname !== CALLBACK_PATH) {
                res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found.");
                return;
            }
            const error = reqUrl.searchParams.get("error");
            if (error) {
                const detail = reqUrl.searchParams.get("error_description") ?? error;
                res.writeHead(400, { "Content-Type": "text/html" }).end(failurePage(detail));
                if (!settled) {
                    settled = true;
                    codeReject(new Error(`OAuth denied at login page: ${detail}`));
                }
                return;
            }
            const code = reqUrl.searchParams.get("code");
            if (!code) {
                res.writeHead(400, { "Content-Type": "text/html" }).end(failurePage("Missing code."));
                return;
            }
            res.writeHead(200, { "Content-Type": "text/html" }).end(successPage());
            if (!settled) {
                settled = true;
                codeResolve(code);
            }
        });
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                codeReject(
                    new Error("Timed out waiting for the browser login (5 min). Re-run and complete the login page."),
                );
                server.close();
            }
        }, CALLBACK_TIMEOUT_MS);
        timer.unref?.();
        server.on("error", (err) => reject(err instanceof Error ? err : new Error(String(err))));
        server.listen(port, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                reject(new Error("OAuth callback listener has no port."));
                return;
            }
            resolve({
                url: `http://127.0.0.1:${address.port}${CALLBACK_PATH}`,
                waitForCode: () => codePromise,
                close: () => {
                    clearTimeout(timer);
                    server.close();
                },
            });
        });
    });
}

function successPage(): string {
    return "<h1>Signed in to Todoist AI</h1><p>Return to your terminal — you can close this tab.</p>";
}

function failurePage(detail: string): string {
    const safe = detail.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<h1>Todoist AI login failed</h1><p>${safe}</p><p>Return to your terminal and retry.</p>`;
}

function openBrowser(url: string): void {
    const target = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    const args = process.platform === "win32" ? ["", url] : [url];
    try {
        const child = spawn(target, args, { detached: true, stdio: "ignore" });
        child.unref();
        child.on("error", () => {
            // Headless/SSH: the URL is printed by the caller as fallback.
        });
    } catch {
        // Headless/SSH: the URL is printed by the caller as fallback.
    }
}

function toStoredTokens(tokens: OAuthTokens): StoredTokens {
    const stored: StoredTokens = {
        access_token: tokens.access_token,
        token_type: tokens.token_type,
    };
    if (tokens.expires_in !== undefined) {
        stored.expires_in = tokens.expires_in;
        stored.expires_at = Date.now() + Number(tokens.expires_in) * 1000;
    }
    if (tokens.refresh_token !== undefined) stored.refresh_token = tokens.refresh_token;
    if (tokens.scope !== undefined) stored.scope = tokens.scope;
    return stored;
}

function toOAuthTokens(stored: StoredTokens): OAuthTokens {
    const tokens: OAuthTokens = { access_token: stored.access_token, token_type: stored.token_type ?? "Bearer" };
    if (stored.expires_in !== undefined) tokens.expires_in = stored.expires_in;
    if (stored.refresh_token !== undefined) tokens.refresh_token = stored.refresh_token;
    if (stored.scope !== undefined) tokens.scope = stored.scope;
    return tokens;
}

export class TodoistOAuthProvider implements OAuthClientProvider {
    private codeVerifierValue = "";

    constructor(
        private readonly apiUrl: string,
        private readonly callbackUrl: string,
        private readonly onAuthUrl?: (url: string) => void,
    ) {}

    get redirectUrl(): string {
        return this.callbackUrl;
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            redirect_uris: [this.callbackUrl],
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            client_name: CLIENT_NAME,
        };
    }

    clientInformation(): OAuthClientInformationMixed | undefined {
        const info = loadOAuthData(this.apiUrl).clientInfo;
        if (!info) return undefined;
        // The registered redirect URI must match this run's callback URL
        // (ephemeral-port fallback runs re-register instead of failing at
        // /authorize with "redirect URI not registered").
        if (
            "redirect_uris" in info &&
            Array.isArray(info.redirect_uris) &&
            !info.redirect_uris.includes(this.callbackUrl)
        ) {
            return undefined;
        }
        return info;
    }

    saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
        saveOAuthData(this.apiUrl, { ...loadOAuthData(this.apiUrl), clientInfo: clientInformation });
    }

    tokens(): OAuthTokens | undefined {
        const stored = loadOAuthData(this.apiUrl).tokens;
        return stored ? toOAuthTokens(stored) : undefined;
    }

    saveTokens(tokens: OAuthTokens): void {
        saveOAuthData(this.apiUrl, { ...loadOAuthData(this.apiUrl), tokens: toStoredTokens(tokens) });
    }

    redirectToAuthorization(authorizationUrl: URL): void {
        this.onAuthUrl?.(String(authorizationUrl));
        openBrowser(String(authorizationUrl));
    }

    saveCodeVerifier(codeVerifier: string): void {
        this.codeVerifierValue = codeVerifier;
    }

    codeVerifier(): string {
        if (!this.codeVerifierValue) throw new Error("OAuth code verifier missing — restart the login.");
        return this.codeVerifierValue;
    }

    invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
        const data = loadOAuthData(this.apiUrl);
        switch (scope) {
            case "tokens":
                saveOAuthData(this.apiUrl, { ...data, tokens: undefined });
                break;
            case "client":
                saveOAuthData(this.apiUrl, { ...data, clientInfo: undefined });
                break;
            case "verifier":
                this.codeVerifierValue = "";
                break;
            case "all":
                clearOAuthData(this.apiUrl);
                this.codeVerifierValue = "";
                break;
            case "discovery":
                break;
        }
    }

    currentAccessToken(): string | null {
        return loadOAuthData(this.apiUrl).tokens?.access_token ?? null;
    }
}

/** Full browser login: DCR → authorize (browser) → loopback code → tokens.
 * Returns fresh OAuth tokens, persisted to the oauth store. */
export async function loginWithOAuth(apiUrl: string, onAuthUrl?: (url: string) => void): Promise<OAuthTokens> {
    const quick = loadOAuthData(apiUrl).tokens;
    if (quick && !isAccessTokenExpired(quick.access_token)) return toOAuthTokens(quick);
    const server = await startCallbackServer();
    const provider = new TodoistOAuthProvider(apiUrl, server.url, onAuthUrl);
    try {
        const first = await auth(provider, { serverUrl: mcpServerUrl(apiUrl) });
        if (first === "AUTHORIZED") {
            const accessToken = provider.currentAccessToken();
            if (!accessToken) throw new Error("OAuth authorized but no token was stored.");
            const stored = loadOAuthData(apiUrl).tokens;
            if (!stored) throw new Error("OAuth authorized but no token was stored.");
            return toOAuthTokens(stored);
        }
        const code = await server.waitForCode();
        const second = await auth(provider, { serverUrl: mcpServerUrl(apiUrl), authorizationCode: code });
        if (second !== "AUTHORIZED") throw new Error("OAuth code exchange was rejected.");
        const stored = loadOAuthData(apiUrl).tokens;
        if (!stored) throw new Error("OAuth authorized but no token was stored.");
        return toOAuthTokens(stored);
    } finally {
        server.close();
    }
}

/** Exchange the stored refresh token for a new access token (null when
 * there is nothing to refresh with, or the server refused it). */
export async function refreshAccessToken(apiUrl: string): Promise<string | null> {
    const data = loadOAuthData(apiUrl);
    const refreshToken = data.tokens?.refresh_token;
    if (!data.clientInfo || !refreshToken) return null;
    let serverInfo;
    try {
        serverInfo = await discoverOAuthServerInfo(mcpServerUrl(apiUrl));
    } catch {
        return null;
    }
    let tokens: OAuthTokens;
    try {
        tokens = await refreshAuthorization(serverInfo.authorizationServerUrl, {
            metadata: serverInfo.authorizationServerMetadata,
            clientInformation: data.clientInfo,
            refreshToken,
        });
    } catch {
        return null;
    }
    // The SDK keeps the previous refresh token when the server rotates
    // silently; our backend rotates, so prefer the fresh one when present.
    const merged: OAuthTokens = { ...tokens };
    if (!merged.refresh_token) merged.refresh_token = refreshToken;
    saveOAuthData(apiUrl, { ...loadOAuthData(apiUrl), tokens: toStoredTokens(merged) });
    return merged.access_token;
}

/** Access token for Bearer call sites: fresh OAuth token when present
 * (refreshing transparently), otherwise the password-login token as-is. */
export async function resolveSessionToken(apiUrl: string, currentToken: string | null): Promise<string | null> {
    if (!currentToken) return null;
    const stored = loadOAuthData(apiUrl).tokens;
    if (!stored) return currentToken;
    if (!isAccessTokenExpired(stored.access_token)) {
        return stored.access_token === currentToken ? currentToken : stored.access_token;
    }
    const refreshed = await refreshAccessToken(apiUrl);
    return refreshed ?? currentToken;
}
