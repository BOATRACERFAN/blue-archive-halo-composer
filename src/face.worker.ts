import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
let task: FaceLandmarker | undefined;
self.onmessage = async (
  e: MessageEvent<{ bitmap: ImageBitmap; base: string }>,
) => {
  try {
    task ??= await FaceLandmarker.createFromOptions(
      await FilesetResolver.forVisionTasks(e.data.base + "mediapipe/wasm"),
      {
        baseOptions: {
          modelAssetPath: e.data.base + "mediapipe/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numFaces: 10,
        minFaceDetectionConfidence: 0.4,
        minFacePresenceConfidence: 0.4,
      },
    );
    const result = task.detect(e.data.bitmap);
    self.postMessage({ points: result.faceLandmarks });
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    e.data.bitmap.close();
  }
};
