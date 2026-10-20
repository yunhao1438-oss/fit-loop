import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, "tests/.build");
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/lib/testExports.ts")],
  outfile: resolve(outdir, "lib.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
});

console.log("[tests] 已构建 src/lib/testExports.ts -> tests/.build/lib.mjs");
