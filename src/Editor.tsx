import { useEffect, useRef, useState } from "react";
import { Canvas, FabricImage, Point, util } from "fabric";
import type { Layer, Project } from "./model";
import { image } from "./images";
import { objectFor, sourceSizes } from "./render";
type Brush = {
  mode: "move" | "hide" | "restore";
  size: number;
  hardness: number;
  show: boolean;
};
type Props = {
  project: Project;
  selected: string | null;
  zoom: number;
  fitSignal: number;
  before: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Layer>) => void;
  brush: Brush;
  onStroke: (stroke: import("./model").Stroke) => void;
  clickPlace: boolean;
  onPlace: (x: number, y: number) => void;
  onZoom: (z: number) => void;
  onError: (message: string) => void;
};
export default function Editor(p: Props) {
  const [rendering, setRendering] = useState(false);
  const host = useRef<HTMLDivElement>(null),
    element = useRef<HTMLCanvasElement>(null),
    canvas = useRef<Canvas | null>(null),
    latest = useRef(p);
  latest.current = p;
  const objects = useRef(new Map<string, FabricImage>());
  const stroke = useRef<import("./model").Stroke | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const background = useRef<{ data: string; canvas: HTMLCanvasElement } | null>(
    null,
  );
  useEffect(() => {
    const c = new Canvas(element.current!, {
      preserveObjectStacking: true,
      selection: false,
      enableRetinaScaling: true,
      uniformScaling: true,
      uniScaleKey: null,
    });
    canvas.current = c;
    const resize = new ResizeObserver(() => {
      c.setDimensions({
        width: host.current!.clientWidth,
        height: host.current!.clientHeight,
      });
      c.requestRenderAll();
    });
    resize.observe(host.current!);
    c.on("selection:created", (e) =>
      latest.current.onSelect(
        [...objects.current].find(([, v]) => v === e.selected[0])?.[0] || null,
      ),
    );
    c.on("selection:updated", (e) =>
      latest.current.onSelect(
        [...objects.current].find(([, v]) => v === e.selected[0])?.[0] || null,
      ),
    );
    c.on("object:modified", (e) => {
      const entry = [...objects.current].find(([, v]) => v === e.target);
      if (!entry) return;
      const [id, o] = entry;
      latest.current.onChange(id, {
        x: o.left,
        y: o.top,
        width: o.scaleX * sourceSizes.get(o)!.w,
        height: o.scaleY * sourceSizes.get(o)!.h,
        angle: o.angle,
        skewX: o.skewX,
        skewY: o.skewY,
        manual: true,
      });
    });
    c.on("mouse:down", (e) => {
      const m = e.e as MouseEvent;
      if (m.altKey || m.button === 1) {
        pan.current = { x: m.clientX, y: m.clientY };
        return;
      }
      if (latest.current.brush.mode !== "move") {
        const props = latest.current,
          o = objects.current.get(props.selected || ""),
          l = props.project.layers.find((l) => l.id === props.selected);
        if (o && l) {
          const t = sourceSizes.get(o)!;
          const q = c
            .getScenePoint(e.e)
            .transform(util.invertTransform(o.calcTransformMatrix()));
          stroke.current = {
            mode: props.brush.mode as "hide" | "restore",
            size: props.brush.size / l.width,
            hardness: props.brush.hardness,
            points: [{ x: q.x / t.w + 0.5, y: q.y / t.h + 0.5 }],
          };
        }
        return;
      }
      if (latest.current.clickPlace) {
        const point = c.getScenePoint(e.e);
        latest.current.onPlace(point.x, point.y);
        return;
      }
    });
    // Set before Fabric performs hit testing, so Alt-drag never moves the halo.
    const beforeDown = (event: MouseEvent) => {
      if (event.altKey || event.button === 1) {
        c.skipTargetFind = true;
        c.discardActiveObject();
      }
    };
    c.upperCanvasEl.addEventListener("mousedown", beforeDown, true);
    c.on("mouse:move", (e) => {
      if (stroke.current) {
        const o = objects.current.get(latest.current.selected || "");
        if (o) {
          const t = sourceSizes.get(o)!;
          const q = c
            .getScenePoint(e.e)
            .transform(util.invertTransform(o.calcTransformMatrix()));
          stroke.current.points.push({
            x: q.x / t.w + 0.5,
            y: q.y / t.h + 0.5,
          });
          c.renderTop();
          const ctx = c.contextTop;
          ctx.save();
          ctx.strokeStyle =
            stroke.current.mode === "hide" ? "#ff638a" : "#82efd5";
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = latest.current.brush.size * c.getZoom();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          for (const [i, pt] of stroke.current.points.entries()) {
            const v = new Point((pt.x - 0.5) * t.w, (pt.y - 0.5) * t.h)
              .transform(o.calcTransformMatrix())
              .transform(c.viewportTransform);
            if (i === 0) ctx.moveTo(v.x, v.y);
            else ctx.lineTo(v.x, v.y);
          }
          ctx.stroke();
          ctx.restore();
        }
        return;
      }
      if (!pan.current) return;
      const m = e.e as MouseEvent;
      c.relativePan(
        new Point(m.clientX - pan.current.x, m.clientY - pan.current.y),
      );
      pan.current = { x: m.clientX, y: m.clientY };
    });
    c.on("mouse:up", () => {
      if (stroke.current) {
        latest.current.onStroke(stroke.current);
        stroke.current = null;
        c.renderTop();
      }
      if (pan.current) {
        const o = objects.current.get(latest.current.selected || "");
        if (o && latest.current.brush.mode === "move") c.setActiveObject(o);
      }
      pan.current = null;
      c.skipTargetFind =
        latest.current.brush.mode !== "move" || latest.current.clickPlace;
    });
    c.on("mouse:wheel", (e) => {
      const m = e.e as WheelEvent;
      const z = Math.max(
        0.05,
        Math.min(4, c.getZoom() * Math.pow(0.999, m.deltaY)),
      );
      c.zoomToPoint(new Point(m.offsetX, m.offsetY), z);
      latest.current.onZoom(z);
      m.preventDefault();
    });
    return () => {
      c.upperCanvasEl.removeEventListener("mousedown", beforeDown, true);
      resize.disconnect();
      void c.dispose();
      canvas.current = null;
    };
  }, []);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      const pending: FabricImage[] = [],
        nextObjects = new Map<string, FabricImage>();
      if (p.project.photo) {
        if (background.current?.data !== p.project.photo.data) {
          const img = await image(p.project.photo.data);
          if (cancelled) return;
          const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
          const preview = document.createElement("canvas");
          preview.width = Math.ceil(img.width * ratio);
          preview.height = Math.ceil(img.height * ratio);
          preview
            .getContext("2d")!
            .drawImage(img, 0, 0, preview.width, preview.height);
          background.current = { data: p.project.photo.data, canvas: preview };
        }
        const preview = background.current!.canvas;
        const bg = new FabricImage(preview, {
          left: 0,
          top: 0,
          originX: "left",
          originY: "top",
          scaleX: p.project.photo.width / preview.width,
          scaleY: p.project.photo.height / preview.height,
          selectable: false,
          evented: false,
          objectCaching: false,
        });
        pending.push(bg);
        for (const l of p.project.layers) {
          const a = p.project.assets.find((a) => a.id === l.assetId)!;
          const o = await objectFor(a, l, 1400, p.brush.show);
          if (cancelled) return;
          o.visible = l.visible && !p.before;
          o.selectable = p.brush.mode === "move" && !p.clickPlace;
          nextObjects.set(l.id, o);
          pending.push(o);
        }
      }
      if (cancelled) return;
      c.clear();
      objects.current = nextObjects;
      for (const o of pending) c.add(o);
      if (p.project.photo) {
        const chosen = objects.current.get(latest.current.selected || "");
        if (chosen && !p.before && p.brush.mode === "move" && !p.clickPlace)
          c.setActiveObject(chosen);
      }
      c.requestRenderAll();
    })()
      .catch((e) => {
        if (!cancelled) p.onError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [p.project, p.before, p.brush.show, p.brush.mode, p.clickPlace]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.setZoom(p.zoom);
    c.requestRenderAll();
  }, [p.zoom]);
  useEffect(() => {
    canvas.current?.setViewportTransform([p.zoom, 0, 0, p.zoom, 0, 0]);
  }, [p.fitSignal]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const o = objects.current.get(p.selected || "");
    if (o && p.brush.mode === "move" && !p.clickPlace) c.setActiveObject(o);
    else c.discardActiveObject();
    c.requestRenderAll();
  }, [p.selected]);
  useEffect(() => {
    const c = canvas.current;
    if (c) {
      c.skipTargetFind = p.brush.mode !== "move" || p.clickPlace;
      c.defaultCursor =
        p.brush.mode === "move" && !p.clickPlace ? "default" : "crosshair";
    }
  }, [p.brush.mode, p.clickPlace]);
  return (
    <div
      className="editor"
      ref={host}
      aria-busy={rendering}
      style={{ pointerEvents: rendering ? "none" : undefined }}
    >
      <canvas ref={element} />
      {rendering && (
        <span className="preview-updating">プレビューを更新中…</span>
      )}
    </div>
  );
}
