import * as UPNG from 'upng-js';

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface Point {
  x: number;
  y: number;
}

export type RemovalMode = 'flood' | 'global';

export type CompressionMode = 'lossless' | 'smart' | 'palette256' | 'palette128';

export type ExportScale = 1 | 0.75 | 0.5;

export interface BrushStroke {
  type: 'erase' | 'restore';
  points: Point[];
  radius: number;
}

export interface ProcessOptions {
  mode: RemovalMode;
  targetColor: RGBColor;
  tolerance: number; // 0 to 100
  feather: number; // 0 to 50 (softness of color transition)
  edgeChoke: number; // 0 to 5 pixels (shrink opaque edge to remove dark halo)
  decontaminate: boolean; // remove background color matte from semi-transparent edge pixels
  seedPoints: Point[]; // additional user-clicked points for hole punching in flood mode
  brushStrokes: BrushStroke[]; // manual erase/restore strokes
}

export interface ExportOptions {
  autoTrim: boolean;
  trimMargin?: number;
  compression: CompressionMode;
  scale: ExportScale;
}

export interface EncodedPngResult {
  blob: Blob;
  width: number;
  height: number;
  byteSize: number;
}

/**
 * Format byte count into human-readable KB / MB
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 100 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Compute Euclidean distance in RGB space (0 to ~441.67), scaled to 0..100
 */
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (Math.sqrt(dr * dr + dg * dg + db * db) / 441.67295593) * 100;
}

export function rgbToHex({ r, g, b }: RGBColor): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): RGBColor {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  };
}

/**
 * Core high-speed transparency processor using TypedArrays.
 * Preserves internal black when mode === 'flood'.
 */
export function processImageTransparency(
  sourceData: ImageData,
  options: ProcessOptions
): ImageData {
  const width = sourceData.width;
  const height = sourceData.height;
  const totalPixels = width * height;
  const src = sourceData.data;

  const outData = new ImageData(new Uint8ClampedArray(src), width, height);
  const dst = outData.data;

  const {
    mode,
    targetColor,
    tolerance,
    feather,
    edgeChoke,
    decontaminate,
    seedPoints,
    brushStrokes,
  } = options;

  const tr = targetColor.r;
  const tg = targetColor.g;
  const tb = targetColor.b;

  // Precompute color distance for each pixel (Float32Array for precision)
  const distMap = new Float32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    distMap[i] = colorDistance(src[idx], src[idx + 1], src[idx + 2], tr, tg, tb);
  }

  // bgMask: 1 = removed background pixel, 0 = kept foreground pixel
  const bgMask = new Uint8Array(totalPixels);

  if (mode === 'global') {
    for (let i = 0; i < totalPixels; i++) {
      if (distMap[i] <= tolerance) {
        bgMask[i] = 1;
      }
    }
  } else {
    // Flood Fill (BFS from outer perimeter + user seedPoints)
    const queue = new Int32Array(totalPixels);
    let head = 0;
    let tail = 0;

    const tryEnqueue = (idx: number) => {
      if (bgMask[idx] === 0 && distMap[idx] <= tolerance) {
        bgMask[idx] = 1;
        queue[tail++] = idx;
      }
    };

    // 1. Seed top and bottom borders
    for (let x = 0; x < width; x++) {
      tryEnqueue(x);
      tryEnqueue((height - 1) * width + x);
    }
    // 2. Seed left and right borders
    for (let y = 1; y < height - 1; y++) {
      tryEnqueue(y * width);
      tryEnqueue(y * width + (width - 1));
    }

    // 3. Seed user-clicked hole punch points
    for (const pt of seedPoints) {
      const cx = Math.round(pt.x);
      const cy = Math.round(pt.y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const pIdx = ny * width + nx;
            if (bgMask[pIdx] === 0 && distMap[pIdx] <= Math.max(tolerance + 8, 12)) {
              bgMask[pIdx] = 1;
              queue[tail++] = pIdx;
            }
          }
        }
      }
    }

    // 4-way BFS flood fill
    while (head < tail) {
      const curr = queue[head++];
      const x = curr % width;
      const y = (curr - x) / width;

      if (x > 0) {
        const next = curr - 1;
        if (bgMask[next] === 0 && distMap[next] <= tolerance) {
          bgMask[next] = 1;
          queue[tail++] = next;
        }
      }
      if (x < width - 1) {
        const next = curr + 1;
        if (bgMask[next] === 0 && distMap[next] <= tolerance) {
          bgMask[next] = 1;
          queue[tail++] = next;
        }
      }
      if (y > 0) {
        const next = curr - width;
        if (bgMask[next] === 0 && distMap[next] <= tolerance) {
          bgMask[next] = 1;
          queue[tail++] = next;
        }
      }
      if (y < height - 1) {
        const next = curr + width;
        if (bgMask[next] === 0 && distMap[next] <= tolerance) {
          bgMask[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }

  // Optional Edge Choke (dilate bgMask by `edgeChoke` iterations to shave off dark fringes)
  let currentBgMask = bgMask;
  if (edgeChoke > 0) {
    const steps = Math.min(5, Math.round(edgeChoke));
    for (let s = 0; s < steps; s++) {
      const nextMask = new Uint8Array(currentBgMask);
      for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
          const i = rowOffset + x;
          if (currentBgMask[i] === 1) continue;
          if (
            (x > 0 && currentBgMask[i - 1] === 1) ||
            (x < width - 1 && currentBgMask[i + 1] === 1) ||
            (y > 0 && currentBgMask[i - width] === 1) ||
            (y < height - 1 && currentBgMask[i + width] === 1)
          ) {
            nextMask[i] = 1;
          }
        }
      }
      currentBgMask = nextMask;
    }
  }

  // Apply alpha & feathering on boundary pixels
  const softRange = Math.max(0, feather);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const i = rowOffset + x;
      const rgbaIdx = i * 4;

      if (currentBgMask[i] === 1) {
        // Zero out RGB on transparent pixels so DEFLATE compresses much better
        dst[rgbaIdx] = 0;
        dst[rgbaIdx + 1] = 0;
        dst[rgbaIdx + 2] = 0;
        dst[rgbaIdx + 3] = 0;
        continue;
      }

      if (softRange > 0) {
        let nearBg = mode === 'global';
        if (!nearBg) {
          for (let dy = -2; dy <= 2 && !nearBg; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            const nRow = ny * width;
            for (let dx = -2; dx <= 2; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < width && currentBgMask[nRow + nx] === 1) {
                nearBg = true;
                break;
              }
            }
          }
        }

        if (nearBg) {
          const d = distMap[i];
          if (d < tolerance + softRange) {
            const ratio = Math.max(0, Math.min(1, (d - tolerance) / softRange));
            const smoothAlpha = ratio * ratio * (3 - 2 * ratio);
            const origAlpha = src[rgbaIdx + 3] / 255;
            const finalAlpha = smoothAlpha * origAlpha;
            const alphaByte = Math.round(finalAlpha * 255);
            dst[rgbaIdx + 3] = alphaByte;

            if (alphaByte === 0) {
              dst[rgbaIdx] = 0;
              dst[rgbaIdx + 1] = 0;
              dst[rgbaIdx + 2] = 0;
            } else if (decontaminate && finalAlpha > 0.02 && finalAlpha < 0.99) {
              const invBg = 1 - finalAlpha;
              dst[rgbaIdx] = Math.min(255, Math.max(0, Math.round((src[rgbaIdx] - invBg * tr) / finalAlpha)));
              dst[rgbaIdx + 1] = Math.min(255, Math.max(0, Math.round((src[rgbaIdx + 1] - invBg * tg) / finalAlpha)));
              dst[rgbaIdx + 2] = Math.min(255, Math.max(0, Math.round((src[rgbaIdx + 2] - invBg * tb) / finalAlpha)));
            }
          }
        }
      }
    }
  }

  // Apply manual brush strokes (Eraser / Restore)
  if (brushStrokes.length > 0) {
    for (const stroke of brushStrokes) {
      const r = Math.max(1, stroke.radius);
      const rSq = r * r;
      const pts = stroke.points;

      for (let p = 0; p < pts.length; p++) {
        const pt = pts[p];
        const prev = p > 0 ? pts[p - 1] : pt;
        const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
        const steps = Math.max(1, Math.ceil(dist / (r * 0.35)));

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = prev.x + (pt.x - prev.x) * t;
          const cy = prev.y + (pt.y - prev.y) * t;

          const minX = Math.max(0, Math.floor(cx - r));
          const maxX = Math.min(width - 1, Math.ceil(cx + r));
          const minY = Math.max(0, Math.floor(cy - r));
          const maxY = Math.min(height - 1, Math.ceil(cy + r));

          for (let y = minY; y <= maxY; y++) {
            const dy = y - cy;
            const rowOffset = y * width;
            for (let x = minX; x <= maxX; x++) {
              const dx = x - cx;
              if (dx * dx + dy * dy <= rSq) {
                const idx = (rowOffset + x) * 4;
                if (stroke.type === 'erase') {
                  dst[idx] = 0;
                  dst[idx + 1] = 0;
                  dst[idx + 2] = 0;
                  dst[idx + 3] = 0;
                } else {
                  dst[idx] = src[idx];
                  dst[idx + 1] = src[idx + 1];
                  dst[idx + 2] = src[idx + 2];
                  dst[idx + 3] = src[idx + 3];
                }
              }
            }
          }
        }
      }
    }
  }

  return outData;
}

/**
 * Crops transparent borders and scales the canvas if requested.
 */
export function createExportCanvas(
  processedData: ImageData,
  autoTrim: boolean,
  trimMargin = 16,
  scale: ExportScale = 1
): HTMLCanvasElement {
  const { width, height, data } = processedData;
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = width;
  fullCanvas.height = height;
  const ctx = fullCanvas.getContext('2d')!;
  ctx.putImageData(processedData, 0, 0);

  let sourceCanvas = fullCanvas;

  if (autoTrim) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const alpha = data[(rowOffset + x) * 4 + 3];
        if (alpha > 5) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX >= minX && maxY >= minY) {
      const cropX = Math.max(0, minX - trimMargin);
      const cropY = Math.max(0, minY - trimMargin);
      const cropRight = Math.min(width - 1, maxX + trimMargin);
      const cropBottom = Math.min(height - 1, maxY + trimMargin);
      const cropW = cropRight - cropX + 1;
      const cropH = cropBottom - cropY + 1;

      const trimmedCanvas = document.createElement('canvas');
      trimmedCanvas.width = cropW;
      trimmedCanvas.height = cropH;
      const trimmedCtx = trimmedCanvas.getContext('2d')!;
      trimmedCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      sourceCanvas = trimmedCanvas;
    }
  }

  if (scale !== 1) {
    const targetW = Math.max(1, Math.round(sourceCanvas.width * scale));
    const targetH = Math.max(1, Math.round(sourceCanvas.height * scale));
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = targetW;
    scaledCanvas.height = targetH;
    const scaledCtx = scaledCanvas.getContext('2d')!;
    scaledCtx.imageSmoothingEnabled = true;
    scaledCtx.imageSmoothingQuality = 'high';
    scaledCtx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
    return scaledCanvas;
  }

  return sourceCanvas;
}

/**
 * Encodes an ImageData into an optimized PNG Blob using the selected compression mode.
 * - 'palette256': TinyPNG-style 8-bit indexed PNG with full alpha support (~70% smaller)
 * - 'palette128': Extra compact 128-color indexed PNG (~80% smaller)
 * - 'smart': 32-bit TrueColor with JPEG micro-noise rounding (~40% smaller)
 * - 'lossless': 32-bit TrueColor lossless with transparent pixel zeroing
 */
export function encodeOptimizedPng(
  processedData: ImageData,
  options: ExportOptions
): EncodedPngResult {
  const canvas = createExportCanvas(
    processedData,
    options.autoTrim,
    options.trimMargin ?? 16,
    options.scale
  );
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, w, h);
  const rgba = new Uint8Array(imgData.data.buffer.slice(0));

  // Ensure all transparent pixels have RGB=0,0,0
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
    } else if (options.compression === 'smart') {
      // Snap subtle JPEG noise (quantize RGB in steps of 6) so DEFLATE finds long repeated sequences
      rgba[i] = Math.min(255, Math.round(rgba[i] / 6) * 6);
      rgba[i + 1] = Math.min(255, Math.round(rgba[i + 1] / 6) * 6);
      rgba[i + 2] = Math.min(255, Math.round(rgba[i + 2] / 6) * 6);
      rgba[i + 3] = Math.min(255, Math.round(rgba[i + 3] / 4) * 4);
    }
  }

  let cnum = 0; // 0 = lossless RGBA in UPNG
  if (options.compression === 'palette256') {
    cnum = 256;
  } else if (options.compression === 'palette128') {
    cnum = 128;
  }

  const pngBuffer = UPNG.encode([rgba.buffer], w, h, cnum);
  const blob = new Blob([pngBuffer], { type: 'image/png' });

  return {
    blob,
    width: w,
    height: h,
    byteSize: blob.size,
  };
}
