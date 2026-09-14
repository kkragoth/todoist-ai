import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "@/App.js";
import { HELP_TEXT, parseArgs } from "@/config.js";
import { useSessionStore } from "@/stores/session-store.js";
import { useAuthStore } from "@/stores/auth-store.js";

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(HELP_TEXT);
        process.exit(0);
    }

    useSessionStore.getState().init(options);
    useAuthStore.getState().boot();
    const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: true });
    createRoot(renderer).render(<App />);
}

main().catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
