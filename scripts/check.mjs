import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { QUOTES } from "../extension/quotes.js";
const root = fileURLToPath(new URL("../extension/", import.meta.url));
const manifest = JSON.parse(await readFile(root + "manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["storage"]);
assert.deepEqual(manifest.host_permissions, [
  "https://poetry-api.nabulalogic.com/*",
  "https://v2.jinrishici.com/*",
]);
assert.ok(
  manifest.content_security_policy.extension_pages.includes(
    "connect-src 'self' https: http:",
  ),
);
assert.deepEqual(manifest.optional_host_permissions, [
  "https://*/*",
  "http://*/*",
]);
for (const file of [
  manifest.chrome_url_overrides.newtab,
  manifest.background.service_worker,
  ...Object.values(manifest.icons),
])
  await access(root + file);
for (const name of (await readdir(root)).filter((file) =>
  file.endsWith(".js"),
)) {
  const text = await readFile(root + name, "utf8");
  execFileSync(process.execPath, ["--check", root + name]);
  for (const [, dependency] of text.matchAll(/from ['"](.+?)['"]/g)) {
    assert.ok(dependency.startsWith("./"), "All JavaScript is local");
    await access(root + dependency);
  }
}
await access(root + "assets/fonts/poetry-serif.ttf");
await access(root + "assets/fonts/OFL.txt");
const prompts = JSON.parse(
  await readFile(root + "assets/art/prompts.json", "utf8"),
);
assert.equal(prompts.length, QUOTES.length);
for (const quote of QUOTES) {
  const bytes = await readFile(root + `assets/art/${quote.art}.webp`);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.ok(bytes.length > 20000, `Real illustration for ${quote.id}`);
  assert.ok(
    prompts.some(
      (p) => p.id === quote.art && p.prompt && p.tool === "image_gen built-in",
    ),
  );
}
for (const file of ["newtab.html", "styles.css", "app.js"]) {
  const text = await readFile(root + file, "utf8");
  assert.ok(
    !/(?:src|href)=["']https?:\/\/|url\(["']?https?:\/\/|\bfetch\s*\(/.test(
      text,
    ),
    `${file} has no remote runtime dependency`,
  );
}
console.log(
  `Manifest, local imports, icon files and ${QUOTES.length} AI illustration mappings validated.`,
);
