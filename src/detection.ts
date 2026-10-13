import type { Photo } from "./model";
import { image, surface } from "./images";
import { summarizeFace, type Landmark, type Face } from "./placement";
export async function detectFaces(photo: Photo): Promise<Face[]> {
  const img = await image(photo.data),
    s = Math.min(1, 1024 / Math.max(photo.width, photo.height)),
    c = surface(photo.width * s, photo.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const bitmap = await createImageBitmap(c);
  const worker = new Worker(
    new URL(import.meta.env.BASE_URL + "face-worker.js", location.href),
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error("顔検出がタイムアウトしました。手動配置を利用できます。"));
    }, 60000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (
      e: MessageEvent<{ points?: Landmark[][]; error?: string }>,
    ) => {
      finish();
      if (e.data.error)
        reject(
          Error(
            "顔検出に失敗しました。手動配置を利用できます。 " + e.data.error,
          ),
        );
      else
        resolve(
          (e.data.points || []).map((p) =>
            summarizeFace(p, photo.width, photo.height),
          ),
        );
    };
    worker.onerror = (e) => {
      finish();
      reject(Error("顔検出Workerエラー: " + e.message));
    };
    worker.postMessage(
      { bitmap, base: new URL(import.meta.env.BASE_URL, location.href).href },
      [bitmap],
    );
  });
}
