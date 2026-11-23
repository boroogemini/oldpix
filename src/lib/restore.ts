import * as ort from "onnxruntime-web";

export type RestoreResult = { blob: Blob; mode: "onnx" | "local"; width: number; height: number };

const MODEL_URL = import.meta.env.VITE_RESTORATION_MODEL_URL as string | undefined;
let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function getSession() {
  if (!MODEL_URL) return null;
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["webgpu", "wasm"],
      graphOptimizationLevel: "all",
    }).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Зураг үүсгэж чадсангүй.")), "image/png"));
}

async function localEnhance(source: HTMLImageElement, maxSide = 2400): Promise<RestoreResult> {
  const scale = Math.min(2, maxSide / Math.max(source.naturalWidth, source.naturalHeight));
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Таны browser зураг боловсруулах боломжгүй байна.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  // Local-only enhancement: mild contrast, color recovery and luminance sharpening.
  // This fallback is deterministic image processing, not a neural AI model.
  const copy = new Uint8ClampedArray(px);
  const contrast = 1.075;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[i + c];
        const avg = (copy[i - 4 + c] + copy[i + 4 + c] + copy[i - width * 4 + c] + copy[i + width * 4 + c]) / 4;
        const sharpened = center + (center - avg) * 0.28;
        px[i + c] = Math.max(0, Math.min(255, (sharpened - 128) * contrast + 128));
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return { blob: await canvasBlob(canvas), mode: "local", width, height };
}

async function neuralEnhance(source: HTMLImageElement): Promise<RestoreResult | null> {
  const session = await getSession();
  if (!session) return null;
  // The configured model must accept RGB NCHW float input in [0,1] and return RGB NCHW.
  // Model-specific preprocessing is deliberately not guessed: incompatible models fail safely.
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("AI зураг боловсруулах боломжгүй байна.");
  ctx.drawImage(source, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const input = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) {
    input[i] = data[i * 4] / 255;
    input[size * size + i] = data[i * 4 + 1] / 255;
    input[2 * size * size + i] = data[i * 4 + 2] / 255;
  }
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const output = await session.run({ [inputName]: new ort.Tensor("float32", input, [1, 3, size, size]) });
  const tensor = output[outputName];
  if (!tensor || tensor.dims.length !== 4 || tensor.dims[1] !== 3) {
    throw new Error("Сэргээх AI загварын оролт/гаралтын формат тохирохгүй байна.");
  }
  const [, , outH, outW] = tensor.dims;
  const out = tensor.data as Float32Array;
  const resultCanvas = document.createElement("canvas");
  resultCanvas.width = outW; resultCanvas.height = outH;
  const resultCtx = resultCanvas.getContext("2d");
  if (!resultCtx) throw new Error("AI үр дүнг дүрслэх боломжгүй байна.");
  const image = resultCtx.createImageData(outW, outH);
  for (let i = 0; i < outW * outH; i++) {
    image.data[i * 4] = Math.max(0, Math.min(255, out[i] * 255));
    image.data[i * 4 + 1] = Math.max(0, Math.min(255, out[outW * outH + i] * 255));
    image.data[i * 4 + 2] = Math.max(0, Math.min(255, out[2 * outW * outH + i] * 255));
    image.data[i * 4 + 3] = 255;
  }
  resultCtx.putImageData(image, 0, 0);
  return { blob: await canvasBlob(resultCanvas), mode: "onnx", width: outW, height: outH };
}

export async function restoreImage(file: File): Promise<RestoreResult> {
  const url = URL.createObjectURL(file);
  try {
    const source = new Image();
    source.decoding = "async";
    source.src = url;
    await source.decode();
    if (source.naturalWidth * source.naturalHeight > 36_000_000) {
      throw new Error("Зураг хэт том байна. 36 мегапикселээс бага зураг сонгоно уу.");
    }
    const neural = await neuralEnhance(source);
    return neural ?? await localEnhance(source);
  } finally {
    URL.revokeObjectURL(url);
  }
}