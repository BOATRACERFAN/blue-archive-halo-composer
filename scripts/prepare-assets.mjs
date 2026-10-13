import { mkdir, cp, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("public/mediapipe/wasm", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", {
  recursive: true,
});
const sources = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "LICENSE.apache-2.0.txt":
    "https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE",
  "model-card-blazeface.pdf":
    "https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf",
  "model-card-face-mesh.pdf":
    "https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf",
  "model-card-blendshape.pdf":
    "https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf",
};
const manifest = {
  package: "@mediapipe/tasks-vision@0.10.32",
  modelVersion: "float16/1",
  files: [],
};
for (const [name, url] of Object.entries(sources)) {
  let data;
  try {
    data = await readFile("public/mediapipe/" + name);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw Error(name + ": " + response.status);
    data = Buffer.from(await response.arrayBuffer());
    await writeFile("public/mediapipe/" + name, data);
  }
  manifest.files.push({
    name,
    url,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
  console.log(name, data.length);
}
await writeFile(
  "public/mediapipe/manifest.json",
  JSON.stringify(manifest, null, 2),
);
