"use client";

import React, { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { CloudShader } from "@/components/ui/cloud-shader";
import { cn } from "@/lib/utils";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export interface CloudMotionFrameProps {
  children?: React.ReactNode;
  className?: string;
  speed?: number;
  count?: number;
  showWing?: boolean;
}

/**
 * Exact Cloud Motion Frame from Aceternity UI
 * Full width plane window: black shell → dark bezel → light bezel → the view.
 * Four dotted walls with 3D perspective rotation, procedural CloudShader,
 * LiquidGlassLayer optical refraction, and in-flight bobbing plane wing.
 */
export function CloudMotionFrame({
  children,
  className,
  speed = 1,
  count,
  showWing = true,
}: CloudMotionFrameProps) {
  const isMobile = useIsMobile();
  const effectiveCount = count ?? (isMobile ? 3 : 6);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-gradient-to-r from-neutral-900 via-neutral-700 to-neutral-900 px-2 pt-6 md:px-8 md:pt-10",
        className
      )}
    >
      {/* plane window: black shell → dark bezel → light bezel → the view.
          full width, rounded at the top, the bottom runs past the viewport */}
      <div className="relative min-h-[640px] md:min-h-[780px] w-full rounded-t-[56px] bg-neutral-950 p-0.5 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9),0_12px_32px_rgba(0,0,0,0.6)] md:rounded-t-[200px]">
        <div className="relative min-h-[636px] md:min-h-[776px] h-full overflow-hidden rounded-t-[54px] bg-neutral-900 p-3 shadow-[inset_0_2px_4px_rgba(255,255,255,0.12),inset_0_-8px_20px_rgba(0,0,0,0.55)] md:rounded-t-[198px] md:p-8">
          {/* four dotted walls, one per edge, each rotated into the page.
              the mitred triangle clip sits on an untransformed wrapper, so
              the seams meet exactly in screen space — no gaps, no overlap.
              the rotated planes inside are oversized to keep the triangles
              covered after the perspective shrink */}
          <div aria-hidden className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,50%_50%)] [perspective:2000px]">
              <div className="absolute -inset-x-1/4 inset-y-0 origin-top [transform:rotateX(-40deg)] bg-[radial-gradient(circle,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-[size:16px_16px]" />
            </div>
            <div className="absolute inset-0 [clip-path:polygon(0_100%,100%_100%,50%_50%)] [perspective:2000px]">
              <div className="absolute -inset-x-1/4 inset-y-0 origin-bottom [transform:rotateX(40deg)] bg-[radial-gradient(circle,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-[size:16px_16px]" />
            </div>
            <div className="absolute inset-0 [clip-path:polygon(0_0,0_100%,50%_50%)] [perspective:2000px]">
              <div className="absolute inset-x-0 -inset-y-1/4 origin-left [transform:rotateY(40deg)] bg-[radial-gradient(circle,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-[size:16px_16px]" />
            </div>
            <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,50%_50%)] [perspective:2000px]">
              <div className="absolute inset-x-0 -inset-y-1/4 origin-right [transform:rotateY(-40deg)] bg-[radial-gradient(circle,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-[size:16px_16px]" />
            </div>
          </div>

          {/* Viewport: Sky and clouds */}
          <div className="relative min-h-[600px] md:min-h-[720px] h-full overflow-hidden rounded-t-[38px] bg-gradient-to-t from-[#8cbfe8] to-[#3876ba] md:rounded-t-[166px]">
            {/* clouds drift left to right; fewer clouds on phones to keep the
                fragment shader cheap. the sky fades in softly on mount */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            >
              {/* the shader renders at half size and upscales 2x — the clouds
                  are soft so nothing visible is lost, and the GPU does a
                  quarter of the fragment work, which keeps the drift smooth */}
              <div className="absolute h-1/2 w-1/2 origin-top-left scale-[2]">
                <CloudShader
                  speed={speed}
                  count={effectiveCount}
                  className="absolute inset-0"
                />
              </div>
            </motion.div>

            {/* the window glass — liquid glass over the view, so the rim
                refraction follows the window corners. content sits above.
                aberration/frost stay 0 — extra filter passes over an
                animated backdrop are too expensive. skipped entirely on
                phones: a full-screen SVG backdrop filter over an animated
                canvas is too heavy for mobile GPUs */}
            {!isMobile && (
              <LiquidGlassLayer
                className="absolute inset-0 z-[15] pointer-events-none"
                radius={166}
                bevelDepth={44}
                aberration={0}
                frost={0}
              />
            )}

            {/* window-seat wing view with a gentle in-flight bob */}
            {showWing && (
              <motion.div
                className="pointer-events-none absolute -bottom-6 left-0 z-10 w-[85%] md:w-[65%]"
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              >
                <img
                  src="/plane-wing.png"
                  alt="Airplane wing above the clouds"
                  className="h-auto w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "https://assets.aceternity.com/components/plane-wing.png";
                  }}
                />
              </motion.div>
            )}

            {/* Embedded Content Layer */}
            <div className="relative z-20 h-full w-full">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Liquid glass — optical refraction                                   */
/* (Snell's law displacement map → feDisplacementMap).                 */
/* ------------------------------------------------------------------ */

type LiquidGlassLayerProps = {
  className?: string;
  radius?: number;
  bevelDepth?: number;
  scale?: number;
  aberration?: number;
  frost?: number;
  tint?: number;
};

function supportsUrlBackdropFilter(): boolean {
  if (typeof CSS === "undefined" || !CSS.supports) return false;
  return (
    CSS.supports("backdrop-filter", "url(#x)") ||
    CSS.supports("-webkit-backdrop-filter", "url(#x)")
  );
}

function prefersReducedTransparency(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
}

function isSafariLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

function sdRoundedBox(
  px: number,
  py: number,
  halfW: number,
  halfH: number,
  r: number
): number {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return inside + outside - r;
}

function bendFromDepth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  const u = 1 - t;
  const denom = (1 - u ** 4) ** 0.75;
  if (denom < 1e-6) return 0;
  const slope = Math.min(u ** 3 / denom, 8);
  const thetaI = Math.atan(slope);
  const sinT = Math.sin(thetaI) / 1.5;
  if (sinT >= 1) return Math.sin(thetaI);
  return Math.sin(thetaI - Math.asin(sinT));
}

function buildPhiTable(bevelPx: number): Float32Array {
  const n = Math.max(1, Math.ceil(bevelPx));
  const phi = new Float32Array(n + 1);
  for (let d = 1; d <= n; d++) {
    phi[d] = (phi[d - 1] ?? 0) + bendFromDepth(d / n);
  }
  return phi;
}

function samplePhi(phi: Float32Array, depth: number): number {
  if (depth <= 0) return phi[0] ?? 0;
  const max = phi.length - 1;
  if (depth >= max) return phi[max] ?? 0;
  const i = Math.floor(depth);
  const f = depth - i;
  return (phi[i] ?? 0) * (1 - f) + (phi[i + 1] ?? 0) * f;
}

function computeDisplacementData(opts: {
  width: number;
  height: number;
  radius: number;
  bevelDepth: number;
  dpr?: number;
}) {
  const dpr = opts.dpr ?? 1;
  const gain = 1.35;
  const light = { x: -0.55, y: -0.85 };
  const lightLen = Math.hypot(light.x, light.y) || 1;
  const lx = light.x / lightLen;
  const ly = light.y / lightLen;

  const W = Math.max(1, Math.round(opts.width * dpr));
  const H = Math.max(1, Math.round(opts.height * dpr));
  const halfW = W / 2;
  const halfH = H / 2;
  const r = Math.min(opts.radius * dpr, halfW, halfH);
  const bevel = Math.max(1, opts.bevelDepth * dpr);
  const phi = buildPhiTable(bevel);

  const field = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - halfW + 0.5;
      const d = sdRoundedBox(px, py, halfW, halfH, r);
      const idx = y * W + x;
      field[idx] = d > 0 ? 0 : samplePhi(phi, Math.min(bevel, -d));
    }
  }

  const data = new Uint8ClampedArray(W * H * 4);
  const EPS = 1;

  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - halfW + 0.5;
      const i = (y * W + x) << 2;
      const d = sdRoundedBox(px, py, halfW, halfH, r);

      if (d > 0) {
        data[i] = 128;
        data[i + 1] = 128;
        data[i + 2] = 128;
        data[i + 3] = 0;
        continue;
      }

      const x0 = Math.max(0, x - EPS);
      const x1 = Math.min(W - 1, x + EPS);
      const y0 = Math.max(0, y - EPS);
      const y1 = Math.min(H - 1, y + EPS);
      const dPhiX =
        ((field[y * W + x1] ?? 0) - (field[y * W + x0] ?? 0)) / (x1 - x0 || 1);
      const dPhiY =
        ((field[y1 * W + x] ?? 0) - (field[y0 * W + x] ?? 0)) / (y1 - y0 || 1);

      const dx = Math.max(-1, Math.min(1, dPhiX * gain));
      const dy = Math.max(-1, Math.min(1, dPhiY * gain));

      let specular = 0;
      if (d >= -bevel) {
        const gx =
          sdRoundedBox(px + EPS, py, halfW, halfH, r) -
          sdRoundedBox(px - EPS, py, halfW, halfH, r);
        const gy =
          sdRoundedBox(px, py + EPS, halfW, halfH, r) -
          sdRoundedBox(px, py - EPS, halfW, halfH, r);
        const len = Math.hypot(gx, gy) || 1;
        const nx = gx / len;
        const ny = gy / len;
        const facing = Math.max(0, nx * lx + ny * ly);
        const opposite = Math.max(0, -(nx * lx + ny * ly)) * 0.35;
        const rim = 1 - Math.min(1, -d / bevel);
        specular = (facing + opposite) * rim;
      }

      data[i] = 128 + dx * 127;
      data[i + 1] = 128 + dy * 127;
      data[i + 2] = Math.round(specular * 255);
      data[i + 3] = 255;
    }
  }

  return { data, width: W, height: H };
}

async function generateDisplacementBlobUrl(opts: {
  width: number;
  height: number;
  radius: number;
  bevelDepth: number;
  dpr?: number;
}): Promise<string> {
  const { data, width, height } = computeDisplacementData(opts);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.putImageData(new ImageData(data, width, height), 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("Failed to encode displacement map");
  return URL.createObjectURL(blob);
}

function buildFilterSvg(opts: {
  id: string;
  mapUrl: string;
  width: number;
  height: number;
  scale: number;
  aberration: number;
  frost: number;
}): string {
  const { id, mapUrl, width, height, scale, aberration, frost } = opts;

  const pad = Math.ceil(scale + aberration + 4);
  const px = ((pad / Math.max(1, width)) * 100).toFixed(3);
  const py = ((pad / Math.max(1, height)) * 100).toFixed(3);
  const w = (100 + 2 * Number(px)).toFixed(3);
  const h = (100 + 2 * Number(py)).toFixed(3);

  const map = `<feImage href="${mapUrl}" xlink:href="${mapUrl}" x="0" y="0" width="${width}" height="${height}" result="map" preserveAspectRatio="none"/>`;

  let filter: string;
  if (aberration <= 0) {
    const blur =
      frost > 0 ? `\n  <feGaussianBlur in="disp" stdDeviation="${frost}"/>` : "";
    filter = `<filter id="${id}" color-interpolation-filters="sRGB" x="-${px}%" y="-${py}%" width="${w}%" height="${h}%">
  ${map}
  <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"${
    frost > 0 ? ` result="disp"` : ""
  }/>${blur}
</filter>`;
  } else {
    const sR = scale + aberration;
    const sG = scale;
    const sB = Math.max(0, scale - aberration);
    filter = `<filter id="${id}" color-interpolation-filters="sRGB" x="-${px}%" y="-${py}%" width="${w}%" height="${h}%">
  ${map}
  <feDisplacementMap in="SourceGraphic" in2="map" scale="${sR}" xChannelSelector="R" yChannelSelector="G" result="dispR"/>
  <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>
  <feDisplacementMap in="SourceGraphic" in2="map" scale="${sG}" xChannelSelector="R" yChannelSelector="G" result="dispG"/>
  <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>
  <feDisplacementMap in="SourceGraphic" in2="map" scale="${sB}" xChannelSelector="R" yChannelSelector="G" result="dispB"/>
  <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>
  <feBlend in="red" in2="green" mode="screen" result="rg"/>
  <feBlend in="rg" in2="blue" mode="screen" result="rgb"/>
  <feGaussianBlur in="rgb" stdDeviation="${frost}"/>
</filter>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${filter}</svg>`;
}

const LiquidGlassLayer = ({
  className,
  radius = 0,
  bevelDepth = 56,
  scale = 90,
  aberration = 5,
  frost = 0.2,
  tint = 0.04,
}: LiquidGlassLayerProps) => {
  const reactId = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [filterSvg, setFilterSvg] = useState("");
  const [filterId, setFilterId] = useState("");
  const [refract, setRefract] = useState(false);
  const [simpleGlass, setSimpleGlass] = useState(false);

  useEffect(() => {
    setSimpleGlass(isSafariLike() || prefersReducedTransparency());
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || simpleGlass) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const width = box?.inlineSize ?? entry.contentRect.width;
      const height = box?.blockSize ?? entry.contentRect.height;
      setSize({
        w: Math.max(1, Math.round(width)),
        h: Math.max(1, Math.round(height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [simpleGlass]);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      if (
        simpleGlass ||
        size.w <= 0 ||
        size.h <= 0 ||
        !supportsUrlBackdropFilter() ||
        prefersReducedTransparency()
      ) {
        if (blobRef.current) {
          URL.revokeObjectURL(blobRef.current);
          blobRef.current = null;
        }
        if (!cancelled) {
          setFilterSvg("");
          setFilterId("");
          setRefract(false);
        }
        return;
      }

      const r = Math.min(radius, size.w / 2, size.h / 2);
      const mapUrl = await generateDisplacementBlobUrl({
        width: size.w,
        height: size.h,
        radius: r,
        bevelDepth: Math.min(bevelDepth, Math.min(size.w, size.h) / 2),
        dpr: 1,
      });

      if (cancelled) {
        URL.revokeObjectURL(mapUrl);
        return;
      }

      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      blobRef.current = mapUrl;

      const id = `lg-${reactId}-${size.w}x${size.h}-${Date.now().toString(36)}`;
      const svg = buildFilterSvg({
        id,
        mapUrl,
        width: size.w,
        height: size.h,
        scale,
        aberration,
        frost,
      });

      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = mapUrl;
      });

      if (cancelled) return;
      setFilterId(id);
      setFilterSvg(svg);
      setRefract(true);
    }

    void build();
    return () => {
      cancelled = true;
    };
  }, [
    simpleGlass,
    size.w,
    size.h,
    radius,
    bevelDepth,
    scale,
    aberration,
    frost,
    reactId,
  ]);

  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, []);

  const backdropFilter = refract
    ? `url(#${filterId}) saturate(1.5)`
    : simpleGlass
    ? "blur(8px) saturate(1.4)"
    : "blur(10px) saturate(1.6) brightness(1.04)";

  const style: CSSProperties = {
    borderRadius: radius,
    background: `rgb(255 255 255 / ${simpleGlass ? 0.16 : tint})`,
    backdropFilter,
    WebkitBackdropFilter: backdropFilter,
  };

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`pointer-events-none overflow-hidden ${className ?? ""}`}
      style={style}
    >
      {filterSvg ? (
        <span
          key={filterId}
          className="pointer-events-none absolute size-0 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: filterSvg }}
        />
      ) : null}
    </div>
  );
};

export default CloudMotionFrame;
