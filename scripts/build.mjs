import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const outputDirectory = path.join(repositoryRoot, "dist");
const webDirectory = path.join(repositoryRoot, "web");
const supabaseBundle = path.join(
  repositoryRoot,
  "node_modules",
  "@supabase",
  "supabase-js",
  "dist",
  "umd",
  "supabase.js"
);

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(path.join(outputDirectory, "vendor"), { recursive: true });
await cp(webDirectory, outputDirectory, { recursive: true });
await cp(supabaseBundle, path.join(outputDirectory, "vendor", "supabase.js"));

console.log(`Prime Role static assets built at ${outputDirectory}`);
