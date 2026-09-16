import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

/** Persisted OAuth state per backend, so browser login survives restarts.
 * Access tokens stay usable as plain `Authorization: Bearer` headers —
 * OAuth and password logins mint the same JWT format, so the REST/MCP
 * call sites don't care how the token was obtained. */
export interface ServerOAuthData {
    clientInfo?: OAuthClientInformationMixed;
    tokens?: StoredTokens;
}

export interface StoredTokens extends OAuthTokens {
    /** Epoch ms when access_token expires (computed from expires_in). */
    expires_at?: number;
}

interface OAuthFile {
    servers: Record<string, ServerOAuthData>;
}

const OAUTH_FILE = join(homedir(), ".todoist-ai-cli", "oauth.json");

function loadFile(): OAuthFile {
    try {
        if (!existsSync(OAUTH_FILE)) return { servers: {} };
        const data = JSON.parse(readFileSync(OAUTH_FILE, "utf8")) as Partial<OAuthFile>;
        if (data && typeof data === "object" && data.servers && typeof data.servers === "object") {
            return { servers: data.servers as Record<string, ServerOAuthData> };
        }
        return { servers: {} };
    } catch {
        return { servers: {} };
    }
}

function writeFile(data: OAuthFile): void {
    mkdirSync(join(homedir(), ".todoist-ai-cli"), { recursive: true });
    writeFileSync(OAUTH_FILE, JSON.stringify(data));
}

export function loadOAuthData(apiUrl: string): ServerOAuthData {
    return loadFile().servers[apiUrl] ?? {};
}

export function saveOAuthData(apiUrl: string, data: ServerOAuthData): void {
    const file = loadFile();
    file.servers[apiUrl] = data;
    writeFile(file);
}

export function clearOAuthData(apiUrl?: string): void {
    if (!apiUrl) {
        try {
            if (existsSync(OAUTH_FILE)) unlinkSync(OAUTH_FILE);
        } catch {
            // ignore
        }
        return;
    }
    const file = loadFile();
    delete file.servers[apiUrl];
    writeFile(file);
}

/** True when the JWT `exp` claim is past (with skew). Undecodable or
 * exp-less tokens are treated as fresh — the server is the authority. */
export function isAccessTokenExpired(accessToken: string, skewSec: number = 60): boolean {
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
            exp?: unknown;
        };
        if (typeof payload.exp !== "number") return false;
        return payload.exp * 1000 <= Date.now() + skewSec * 1000;
    } catch {
        return false;
    }
}
