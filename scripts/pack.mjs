import { readFile, mkdir, cp, rm, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { createZip } from "./zip.mjs";
import assert from "node:assert/strict";
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
await cp(root + "extension", unpacked, {
  recursive: true,
  filter: (source) => basename(source) !== ".DS_Store",
});
await cp(root + "LICENSE", unpacked + "/LICENSE");
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
const zip = createZip(entries);
assert.ok(zip.length < 1_000_000, `Extension ZIP exceeds the 1 MB budget: ${zip.length} bytes`);
await writeFile(archive, zip);
const bytes = await readFile(archive);
await writeFile(
  archive + ".sha256",
  createHash("sha256").update(bytes).digest("hex") +
    `  poetry-tab-v${version}.zip\n`,
);
console.log(`${archive} (${(bytes.length / 1024 / 1024).toFixed(2)} MiB)`);
