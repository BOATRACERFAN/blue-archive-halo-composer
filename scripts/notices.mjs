import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
const modules = [
  "react",
  "react-dom",
  "scheduler",
  "fabric",
  "three",
  "@types/three",
  "jszip",
  "pako",
  "lie",
  "immediate",
  "setimmediate",
  "readable-stream",
  "safe-buffer",
  "string_decoder",
  "core-util-is",
  "inherits",
  "isarray",
  "util-deprecate",
  "zod",
  "vite",
  "typescript",
  "@vitejs/plugin-react",
  "@playwright/test",
  "playwright",
  "playwright-core",
  "prettier",
  "rolldown",
];
await mkdir("public/licenses", { recursive: true });
for (const name of modules) {
  let entries;
  try {
    entries = await readdir("node_modules/" + name);
  } catch {
    continue;
  }
  const files = entries.filter((f) =>
    /^licen[cs]e(?:[.-]|$)|^copyright|^third-party-license/i.test(f),
  );
  for (const file of files) {
    const content = await readFile(`node_modules/${name}/${file}`);
    await writeFile(
      `public/licenses/${name.replaceAll("/", "_")}-${file.replaceAll("/", "_")}`,
      content,
    );
  }
}
await writeFile(
  "public/licenses/mediapipe-LICENSE.apache-2.0.txt",
  await readFile("public/mediapipe/LICENSE.apache-2.0.txt"),
);
await writeFile(
  "public/licenses/THIRD_PARTY_NOTICES.md",
  await readFile("THIRD_PARTY_NOTICES.md"),
);
