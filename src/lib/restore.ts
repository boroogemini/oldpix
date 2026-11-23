import type * as ort from "onnxruntime-web/wasm";

export type RestoreResult = {
  blob: Blob;
  mode: "onnx";
  width: number;
  height: number;
};

// Real-ESRGAN x4plus: higher-detail general photo restoration/upscaling.
// Free BSD-3-Clause weights, exported to ONNX for local browser inference.
const MODEL_URL =
  "https://huggingface.co/skillsafe-ai/realesrgan-x4plus/resolve/107475e49b7d46412cc966481efccc3500955801/model_fp16.onnx";
const MODEL_SHA256 =
  "38fe853c9cd8e1d6fd0ff387f2d43c51c1352feb9d7b3e2533d4c07b1b932f68";

let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = import("onnxruntime-web/wasm")
      .then(async (runtime) => {
        const response = await fetch(MODEL_URL, { credentials: "omit" });
        if (!response.ok) {
          throw new Error(`Model download failed: ${response.status}`);
        }
        const modelBytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", modelBytes);
        const actualHash = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (actualHash !== MODEL_SHA256) {
          throw new Error("AI model checksum verification failed.");
        }
        return runtime.InferenceSession.create(new Uint8Array(modelBytes), {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        });
      })
      .catch((error) => {
        sessionPromise = null;
        throw new Error(
          "Үнэгүй AI загварыг татаж эсвэл эхлүүлж чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.",
          { cause: error },
        );
      });
  }
  return sessionPromise;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Сэргээсэн зургийг үүсгэж чадсангүй.")),
      "image/png",
    );
  });
}

function makeInputTensor(
  runtime: typeof import("onnxruntime-web/wasm"),
  data: Uint8ClampedArray,
  width: number,
  height: number,
): InstanceType<typeof runtime.Tensor> {
  const plane = width * height;
  const rgb = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    rgb[i] = data[i * 4] / 255;
    rgb[plane + i] = data[i * 4 + 1] / 255;
    rgb[plane * 2 + i] = data[i * 4 + 2] / 255;
  }
  return new runtime.Tensor("float32", rgb, [1, 3, height, width]);
}

async function restoreTiled(source: HTMLImageElement, onProgress?: (value: number) => void): Promise<RestoreResult> {
  onProgress?.(5);
  const runtime = await import("onnxruntime-web/wasm");
  const session = await getSession();
  onProgress?.(18);

  // Keep browser memory bounded. 4x output is capped at about 32 megapixels.
  const maxInputPixels = 2_000_000;
  const scale = Math.min(
    1,
    Math.sqrt(maxInputPixels / (source.naturalWidth * source.naturalHeight)),
  );
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sourceContext) {
    throw new Error("Таны browser зураг боловсруулах боломжгүй байна.");
  }
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = "high";
  sourceContext.drawImage(source, 0, 0, width, height);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width * 4;
  outputCanvas.height = height * 4;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) {
    throw new Error("AI үр дүнг дүрслэх боломжгүй байна.");
  }

  // Overlapping tiles avoid running the full high-resolution image at once.
  const coreSize = 160;
  const overlap = 16;
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const totalTiles = Math.ceil(width / coreSize) * Math.ceil(height / coreSize);
  let completedTiles = 0;

  for (let coreY = 0; coreY < height; coreY += coreSize) {
    const coreHeight = Math.min(coreSize, height - coreY);
    for (let coreX = 0; coreX < width; coreX += coreSize) {
      const coreWidth = Math.min(coreSize, width - coreX);
      const tileX = Math.max(0, coreX - overlap);
      const tileY = Math.max(0, coreY - overlap);
      const tileRight = Math.min(width, coreX + coreWidth + overlap);
      const tileBottom = Math.min(height, coreY + coreHeight + overlap);
      const tileWidth = tileRight - tileX;
      const tileHeight = tileBottom - tileY;

      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileWidth;
      tileCanvas.height = tileHeight;
      const tileContext = tileCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!tileContext) {
        throw new Error("Зургийн хэсгийг боловсруулах боломжгүй байна.");
      }
      tileContext.drawImage(
        sourceCanvas,
        tileX,
        tileY,
        tileWidth,
        tileHeight,
        0,
        0,
        tileWidth,
        tileHeight,
      );
      const pixels = tileContext.getImageData(
        0,
        0,
        tileWidth,
        tileHeight,
      ).data;
      const input = makeInputTensor(runtime, pixels, tileWidth, tileHeight);
      const outputs = await session.run({ [inputName]: input });
      const tensor = outputs[outputName];
      if (
        !tensor ||
        tensor.dims.length !== 4 ||
        tensor.dims[1] !== 3 ||
        tensor.dims[2] !== tileHeight * 4 ||
        tensor.dims[3] !== tileWidth * 4
      ) {
        throw new Error("AI загварын гаралтын хэмжээ тохирохгүй байна.");
      }

      const values = tensor.data as Float32Array;
      const outputWidth = tileWidth * 4;
      const outputHeight = tileHeight * 4;
      const outputPlane = outputWidth * outputHeight;
      const cropLeft = (coreX - tileX) * 4;
      const cropTop = (coreY - tileY) * 4;
      const coreImage = new ImageData(coreWidth * 4, coreHeight * 4);

      for (let y = 0; y < coreHeight * 4; y++) {
        for (let x = 0; x < coreWidth * 4; x++) {
          const sourceIndex =
            (cropTop + y) * outputWidth + cropLeft + x;
          const targetIndex = (y * coreWidth * 4 + x) * 4;
          coreImage.data[targetIndex] = Math.round(
            Math.max(0, Math.min(1, values[sourceIndex])) * 255,
          );
          coreImage.data[targetIndex + 1] = Math.round(
            Math.max(0, Math.min(1, values[outputPlane + sourceIndex])) * 255,
          );
          coreImage.data[targetIndex + 2] = Math.round(
            Math.max(0, Math.min(1, values[outputPlane * 2 + sourceIndex])) * 255,
          );
          coreImage.data[targetIndex + 3] = 255;
        }
      }
      outputContext.putImageData(coreImage, coreX * 4, coreY * 4);
      completedTiles++;
      onProgress?.(18 + (completedTiles / totalTiles) * 78);
    }
  }

  return {
    blob: await canvasBlob(outputCanvas),
    mode: "onnx",
    width: outputCanvas.width,
    height: outputCanvas.height,
  };
}

export async function restoreImage(file: File, onProgress?: (value: number) => void): Promise<RestoreResult> {
  const url = URL.createObjectURL(file);
  try {
    const source = new Image();
    source.decoding = "async";
    source.src = url;
    await source.decode();
    onProgress?.(3);
    if (!source.naturalWidth || !source.naturalHeight) {
      throw new Error("Зургийн файлыг уншиж чадсангүй.");
    }
    const result = await restoreTiled(source, onProgress);
    onProgress?.(100);
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
