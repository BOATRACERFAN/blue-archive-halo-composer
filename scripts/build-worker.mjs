import { build } from "rolldown";
await build({
  input: "src/face.worker.ts",
  output: { file: "public/face-worker.js", format: "iife", minify: true },
});
