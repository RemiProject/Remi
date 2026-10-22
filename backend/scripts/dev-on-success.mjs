
import { spawn, execFileSync } from "node:child_process";
import { mkdir, rm, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

process.chdir(root);

execFileSync(
  process.execPath,
  [
    "node_modules/tsc-alias/bin/index.js",
    "-p",
    "tsconfig.build.json",
  ],
  { stdio: "inherit" }
);

const destination = path.join(root, "dist/platform/mail");

await mkdir(destination, { recursive: true });
await rm(path.join(destination, "templates"), {
  recursive: true,
  force: true,
});

await cp(
  path.join(root, "src/platform/mail/templates"),
  path.join(destination, "templates"),
  { recursive: true }
);

const server = spawn(process.execPath, ["dist/main.js"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

server.on("error", (error) => {
  console.error("Failed to start API:", error);
  process.exitCode = 1;
});

server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
