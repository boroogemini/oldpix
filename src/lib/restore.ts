import * as ort from "onnxruntime-web";

export type RestoreResult = { blob: Blob; mode: "onnx" | "local"; width: number; height: number };

// Real-ESRGAN general x4v3 ONNX export. BSD-3-Clause model weights.
// Dynamic graph: use WASM provider for reliable arbitrary input dimensions.
const MODEL_URL = (import.meta.env.VITE_RESTORATION_MODEL_URL as string | undefined)
  || "https://huggingface.co/thisismert/real-esrgan-onnx/resolve/main/onnx/realesr-general-x4v3.onnx";
let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["wasm"],
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
  // Local-only enhancement: mild contrast and luminance sharpening.
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

async function neuralEnhance(source: HTMLImageElement): Promise<RestoreResult> {
  const session = await getSession();
  // Keep browser memory bounded. The x4 model returns up to 2048px on its longest side.
  const scale = Math.min(1, 512 / Math.max(source.naturalWidth, source.naturalHeight));
  const width = Math.max(4, Math.round(source.naturalWidth * scale / 4) * 4);
  const height = Math.max(4, Math.round(source.naturalHeight * scale / 4) * 4);
  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = width; inputCanvas.height = height;
  const inputCtx = inputCanvas.getContext("2d", { willReadFrequently: true });
  if (!inputCtx) throw new Error("AI зураг боловсруулах боломжгүй байна.");
  inputCtx.imageSmoothingEnabled = true;
  inputCtx.imageSmoothingQuality = "high";
  inputCtx.drawImage(source, 0, 0, width, height);
  const data = inputCtx.getImageData(0, 0, width, height).data;
  const input = new Float32Array(3 * width * height);
  for (let i = 0; i < width * height; i++) {
    input[i] = data[i * 4] / 255;
    input[width * height + i] = data[i * 4 + 1] / 255;
    input[2 * width * height + i] = data[i * 4 + 2] / 255;
  }
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const output = await session.run({
    [inputName]: new ort.Tensor("float32", input, [1, 3, height, width]),
  });
  const tensor = output[outputName];
  if (!tensor || tensor.dims.length !== 4 || tensor.dims[1] !== 3) {
    throw new Error("AI загварын гаралтын формат тохирохгүй байна.");
  }
  const outH = tensor.dims[2];
  const outW = tensor.dims[3];
  const values = tensor.data as Float32Array;
  const plane = outW * outH;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outW; outputCanvas.height = outH;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("AI үр дүнг дүрслэх боломжгүй байна.");
  const image = outputCtx.createImageData(outW, outH);
  for (let i = 0; i < plane; i++) {
    image.data[i * 4] = Math.max(0, Math.min(255, values[i] * 255));
    image.data[i * 4 + 1] = Math.max(0, Math.min(255, values[plane + i] * 255));
    image.data[i * 4 + 2] = Math.max(0, Math.min(255, values[2 * plane + i] * 255));
    image.data[i * 4 + 3] = 255;
  }
  outputCtx.putImageData(image, 0, 0);
  return { blob: await canvasBlob(outputCanvas), mode: "onnx", width: outW, height: outH };
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
    try {
      return await neuralEnhance(source);
    } catch {
      // Model download/runtime failures fall back to local enhancement; no image is uploaded.
      return await localEnhance(source);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}