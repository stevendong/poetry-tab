import { readFile, mkdir, cp, rm, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createZip } from "./zip.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(process.execPath, [root + "scripts/check.mjs"], {
  stdio: "inherit",
});
const { version } = JSON.parse(
  await readFile(root + "extension/manifest.json", "utf8"),
);
const unpacked = root + "dist/poetry-tab";
await mkdir(root + "dist", { recursive: true });
await rm(unpacked, { recursive: true, force: true });
await cp(root + "extension", unpacked, { recursive: true });
const archive = root + `dist/poetry-tab-v${version}.zip`;
await rm(archive, { force: true });
const entries = [];
async function collect(relative = "") {
  for (const item of (
    await readdir(unpacked + "/" + relative, { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative + item.name;
    if (item.isDirectory()) await collect(name + "/");
    else entries.push({ name, bytes: await readFile(unpacked + "/" + name) });
  }
}
await collect();
await writeFile(archive, createZip(entries));
const bytes = await readFile(archive);
await writeFile(
  archive + ".sha256",
  createHash("sha256").update(bytes).digest("hex") +
    `  poetry-tab-v${version}.zip\n`,
);
console.log(`${archive} (${(bytes.length / 1024 / 1024).toFixed(2)} MiB)`);
