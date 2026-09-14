import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_FILE = join(homedir(), ".todoist-ai-cli", "token.json");

export function loadToken(): string | null {
    try {
        if (!existsSync(TOKEN_FILE)) return null;
        const data = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
        return typeof data.access_token === "string" ? data.access_token : null;
    } catch {
        return null;
    }
}

export function saveTokenData(data: unknown): void {
    mkdirSync(join(homedir(), ".todoist-ai-cli"), { recursive: true });
    writeFileSync(TOKEN_FILE, JSON.stringify(data));
}

export function clearToken(): void {
    try {
        if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE);
    } catch {
        // ignore
    }
}
