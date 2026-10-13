import JSZip from "jszip";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const zip = new JSZip();
for (const directory of ["src", "scripts", "tests", "public", "dist", "docs"]) {
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const p = join(path, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile())
        zip.file("halo-composer/" + p.replaceAll("\\", "/"), await readFile(p));
    }
  }
  await walk(directory);
}
for (const path of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "playwright.config.ts",
  "index.html",
  ".gitignore",
  ".gitattributes",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "TEST_RESULTS.md",
  "start-dev.cmd",
  "start-offline.cmd",
])
  zip.file("halo-composer/" + path, await readFile(path));
const data = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 6 },
});
const out = resolve("../BlueArchiveHaloComposer.zip");
await writeFile(out, data);
await writeFile(
  resolve("../BlueArchiveHaloComposer.sha256.txt"),
  createHash("sha256").update(data).digest("hex") +
    "  BlueArchiveHaloComposer.zip\n",
);
console.log(out + "\n" + data.length + " bytes");
