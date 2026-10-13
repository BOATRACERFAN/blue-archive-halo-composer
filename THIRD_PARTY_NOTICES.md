# 参照OSS・素材・モデルの調査（2026-10-12）

| 対象                                                                                                           | ソフトウェア／モデルのライセンス | 素材再配布の判断・使用方法                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Mizera-Mondo/blue-archive-logos](https://github.com/Mizera-Mondo/blue-archive-logos)                          | リポジトリーにはMIT LICENSE      | READMEはNexon & Yostarの著作権を明記。ゲーム側の図形権利までの再配布許諾は確定できないため、素材もリポジトリーのコードも同梱していない。ユーザーインポートを採用。 |
| [tkoz0/blue-archive-halo-svgs](https://github.com/tkoz0/blue-archive-halo-svgs)                                | 調査時点のルートにLICENSEなし    | Wiki由来画像と、それを参考にしたSVGとの説明。明確な再配布ライセンスを確認できないため未同梱。表示ページのコードは流用しない。                                      |
| [Fabric.js](https://github.com/fabricjs/fabric.js) 7.4.0                                                       | MIT                              | Canvas、FabricImage、座標変換、選択と変形の公開APIを使用。ソースの大量コピーを行わずnpm依存として採用。                                                            |
| [MediaPipe samples web](https://github.com/google-ai-edge/mediapipe-samples-web)                               | Apache 2.0                       | face-landmarker.tsのAPI利用方法と公式ガイドを参考にした。サンプルコードの大量コピーは行っていない。                                                                |
| [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) 0.10.32 | Apache 2.0                       | FaceLandmarker.createFromOptions、FilesetResolver、detectの公開APIをclassic Workerで使用。npm付属WASMをローカル同梱。                                              |
| MediaPipe Face Landmarker float16/version 1                                                                    | Apache 2.0                       | FaceDetector、FaceMesh V2、Blendshape V2それぞれの公式モデルカードがApache 2.0を明記。モデルをローカル同梱。                                                       |
| React / React DOM 19.3.0                                                                                       | MIT                              | npm公開APIを使用。                                                                                                                                                 |
| JSZip 3.10.1                                                                                                   | MIT / GPLv3のデュアル            | MITの条件で使用。ZIP公開APIで保存・復元。                                                                                                                          |
| Zod 4.3.6                                                                                                      | MIT                              | 読み込みデータの検証。                                                                                                                                             |
| [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE) 0.186.1                                        | MIT                              | 公式FBXLoader・WebGLRenderer・OrthographicCameraを使用。ユーザーのFBXをローカルで透過描画。外部モデル素材は同梱していない。                                        |

公式モデルカード：

- [BlazeFace Short Range](<https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf>)
- [Face Mesh V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf)
- [Blendshape V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf)

本アプリの独自幾何学素材はこの実装のために作成したものです。原作キャラクターの素材の許諾を代替するものではありません。

固定依存関係はpackage.json / package-lock.jsonに記録しています。再配布用のライセンス本文をpublic/licensesとビルド出力へ含めます。MediaPipeライセンスとモデルカードはmediapipeディレクトリーにも含めます。
