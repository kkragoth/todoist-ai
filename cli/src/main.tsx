import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "@/App.js";
import { HELP_TEXT, parseArgs } from "@/config.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: true });
  createRoot(renderer).render(<App options={options} />);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
