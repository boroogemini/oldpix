import type * as ort from "onnxruntime-web/wasm";

const REV = "0662739";
const BASE = `https://huggingface.co/ingmebs/bspicture-modelos/resolve/${REV}/`;
const MODELS = {
  scratches: { file: "reparar_rayas_v1.onnx", sha: "3ea1a382fb8660490f8ec44875adaa51f563342f0b2ac203d98574ad5631528e" },
  lama: { file: "borrar_objetos_v1.onnx", sha: "6c8a0cc49421023b3d2a0712a19c33f44bd300a001373a6e88ff3c6e1656e0f3" },
  color: { file: "colorear_v1.onnx", sha: "36ba53ed2c91d9d192a5ef5a30b4623440930bce2c995b8fa493a55e4dacff0" },
} as const;

type Runtime = typeof import("onnxruntime-web/wasm");
type Session = ort.InferenceSession;
const sessionCache = new Map<string, Promise<Session>>();

async function loadSession(key: keyof typeof MODELS, progress?: (p: number) => void): Promise<Session> {
  const existing = sessionCache.get(key);
  if (existing) return existing;
  const task = (async () => {
    const runtime = await import("onnxruntime-web/wasm");
    const model = MODELS[key];
    const url = BASE + model.file;
    progress?.(5);
    let bytes: ArrayBuffer | undefined;
    try {
      const cache = "caches" in globalThis ? await caches.open("oldpix-open-models-v1") : null;
      const cached = cache ? await cache.match(url) : undefined;
      if (cached) bytes = await cached.arrayBuffer();
      if (!bytes) {
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) throw new Error(`AI model download failed: ${response.status}`);
        bytes = await response.arrayBuffer();
      }
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
      if (hash !== model.sha) {
        if ("caches" in globalThis) await caches.delete("oldpix-open-models-v1");
        throw new Error("AI загварын SHA-256 шалгалт амжилтгүй боллоо. Загварын файлыг дахин татна уу.");
      }
      if (cache && !(await cache.match(url))) {
        await cache.put(url, new Response(bytes.slice(0), { headers: { "Content-Type": "application/octet-stream" } }));
      }
      progress?.(45);
      const session = await runtime.InferenceSession.create(new Uint8Array(bytes), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      progress?.(100);
      return session;
    } catch (error) {
      throw new Error("Нээлттэй эхийн AI загварыг татаж эсвэл эхлүүлж чадсангүй. Интернэт болон төхөөрөмжийн санах ойг шалгаад дахин оролдоно уу.", { cause: error });
    }
  })();
  sessionCache.set(key, task);
  try { return await task; } catch (error) { sessionCache.delete(key); throw error; }
}

function canvasOf(source: HTMLImageElement | HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Browser зураг боловсруулах боломжгүй байна.");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("AI үр дүнг хадгалж чадсангүй.")), "image/png"));
}
function toImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("AI боловсруулсан зургийг дахин уншиж чадсангүй.")); };
    image.src = url;
  });
}
function tensor(runtime: Runtime, values: Float32Array, dims: number[]): InstanceType<typeof runtime.Tensor> {
  return new runtime.Tensor("float32", values, dims);
}
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }

// sRGB <-> CIE Lab (D65), matching DDColor's OpenCV float-Lab convention.
function srgbToLinear(v: number): number { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
function linearToSrgb(v: number): number { v = Math.max(0, Math.min(1, v)); return 255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055); }
function rgbLab(r: number, g: number, b: number): [number, number, number] {
  const R=srgbToLinear(r), G=srgbToLinear(g), B=srgbToLinear(b);
  const x=(.4124564*R+.3575761*G+.1804375*B)/.95047;
  const y=(.2126729*R+.7151522*G+.072175*B);
  const z=(.0193339*R+.119192*G+.9503041*B)/1.08883;
  const f=(v:number)=>v>.008856451679?Math.cbrt(v):7.787037*v+16/116;
  const fx=f(x),fy=f(y),fz=f(z);
  return [116*fy-16,500*(fx-fy),200*(fy-fz)];
}
function labRgb(L:number,a:number,b:number):[number,number,number] {
  const fy=(L+16)/116, fx=fy+a/500, fz=fy-b/200;
  const inv=(v:number)=>{const c=v*v*v;return c>.008856451679?c:(v-16/116)/7.787037;};
  const x=.95047*inv(fx), y=inv(fy), z=1.08883*inv(fz);
  const R=3.2404542*x-1.5371385*y-.4985314*z;
  const G=-.969266*x+1.8760108*y+.041556*z;
  const B=.0556434*x-.2040259*y+1.0572252*z;
  return [linearToSrgb(R),linearToSrgb(G),linearToSrgb(B)];
}
function bilinear(data: Float32Array, width:number, height:number, x:number, y:number):number {
  const x0=Math.max(0,Math.min(width-1,Math.floor(x))), y0=Math.max(0,Math.min(height-1,Math.floor(y)));
  const x1=Math.min(width-1,x0+1), y1=Math.min(height-1,y0+1), dx=x-x0,dy=y-y0;
  return data[y0*width+x0]*(1-dx)*(1-dy)+data[y0*width+x1]*dx*(1-dy)+data[y1*width+x0]*(1-dx)*dy+data[y1*width+x1]*dx*dy;
}

async function colorize(source: HTMLImageElement, progress?: (p:number)=>void): Promise<HTMLCanvasElement> {
  const w=source.naturalWidth,h=source.naturalHeight;
  const maxSide=1800, scale=Math.min(1,maxSide/Math.max(w,h));
  const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
  const canvas=canvasOf(source,width,height), ctx=canvas.getContext("2d",{willReadFrequently:true})!;
  const image=ctx.getImageData(0,0,width,height), px=image.data;
  let saturation=0, count=0;
  const L=new Float32Array(width*height);
  for(let i=0;i<L.length;i++){
    const j=i*4, max=Math.max(px[j],px[j+1],px[j+2]), min=Math.min(px[j],px[j+1],px[j+2]);
    saturation+=(max-min)/(max+1); count++;
    L[i]=rgbLab(px[j],px[j+1],px[j+2])[0];
  }
  // Preserve already-colour photos; DDColor is only applied to genuinely monochrome/faded inputs.
  if(saturation/count>.055) return canvas;
  progress?.(4);
  const session=await loadSession("color",progress);
  const size=512, inputCanvas=document.createElement("canvas");inputCanvas.width=size;inputCanvas.height=size;
  const ictx=inputCanvas.getContext("2d",{willReadFrequently:true})!;
  const gray=ictx.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const srcX=(x+.5)*width/size-.5,srcY=(y+.5)*height/size-.5;
    const l=bilinear(L,width,height,srcX,srcY);
    const [r,g,b]=labRgb(l,0,0),j=(y*size+x)*4;
    gray.data[j]=r;gray.data[j+1]=g;gray.data[j+2]=b;gray.data[j+3]=255;
  }
  ictx.putImageData(gray,0,0);
  const data=ictx.getImageData(0,0,size,size).data, input=new Float32Array(3*size*size);
  for(let i=0;i<size*size;i++){input[i]=data[i*4]/255;input[size*size+i]=data[i*4+1]/255;input[2*size*size+i]=data[i*4+2]/255;}
  progress?.(28);
  const out=await session.run({[session.inputNames[0]]:tensor(await import("onnxruntime-web/wasm"),input,[1,3,size,size])});
  await session.release(); sessionCache.delete("color");
  const chroma=out[session.outputNames[0]];
  if(!chroma || chroma.dims.length!==4 || chroma.dims[1]!==2) throw new Error("DDColor загварын гаралтын формат тохирохгүй байна.");
  const ab=chroma.data as Float32Array, plane=size*size;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,j=i*4, ax=bilinear(ab.subarray(0,plane),size,size,(x+.5)*size/width-.5,(y+.5)*size/height-.5), by=bilinear(ab.subarray(plane),size,size,(x+.5)*size/width-.5,(y+.5)*size/height-.5);
    const [r,g,b]=labRgb(L[i],ax,by);px[j]=r;px[j+1]=g;px[j+2]=b;
  }
  ctx.putImageData(image,0,0);progress?.(100);
  return canvas;
}

async function repairScratches(source: HTMLImageElement, progress?: (p:number)=>void): Promise<HTMLCanvasElement> {
  const originalW=source.naturalWidth, originalH=source.naturalHeight;
  const scale=256/Math.min(originalW,originalH);
  const dw=Math.max(16,Math.round(originalW*scale/16)*16), dh=Math.max(16,Math.round(originalH*scale/16)*16);
  const detectorInput=canvasOf(source,dw,dh), ctx=detectorInput.getContext("2d",{willReadFrequently:true})!;
  const rgba=ctx.getImageData(0,0,dw,dh).data, gray=new Float32Array(dw*dh);
  for(let i=0;i<gray.length;i++){const j=i*4;gray[i]=(((rgba[j]*.299+rgba[j+1]*.587+rgba[j+2]*.114)/255)-.5)/.5;}
  progress?.(5);
  const detector=await loadSession("scratches",progress);
  const runtime=await import("onnxruntime-web/wasm");
  const detection=await detector.run({[detector.inputNames[0]]:tensor(runtime,gray,[1,1,dh,dw])});
  await detector.release(); sessionCache.delete("scratches");
  const prediction=detection[detector.outputNames[0]];
  if(!prediction || prediction.dims.length!==4) throw new Error("Зураас илрүүлэх AI загварын гаралт буруу байна.");
  const logits=prediction.data as Float32Array;
  const mask=new Uint8Array(dw*dh);let marked=0;
  for(let i=0;i<mask.length;i++){if(sigmoid(logits[i])>=.4){mask[i]=1;marked++;}}
  progress?.(45);
  // Avoid hallucinated edits on clean images. Only invoke LaMa when the detector finds a meaningful mask.
  if(marked<Math.max(8,mask.length*.00004)) return canvasOf(source,originalW,originalH);
  const lama=await loadSession("lama",progress);
  const base=canvasOf(source,512,512), bctx=base.getContext("2d",{willReadFrequently:true})!, pixels=bctx.getImageData(0,0,512,512);
  const maskCanvas=document.createElement("canvas");maskCanvas.width=512;maskCanvas.height=512;
  const mctx=maskCanvas.getContext("2d")!, maskImage=mctx.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const sx=Math.min(dw-1,Math.floor(x*dw/512)),sy=Math.min(dh-1,Math.floor(y*dh/512)), hit=mask[sy*dw+sx],j=(y*512+x)*4;
    // Slight dilation catches scratch edges before inpainting.
    let near=0;for(let oy=-1;oy<=1&&!near;oy++)for(let ox=-1;ox<=1;ox++){const xx=sx+ox,yy=sy+oy;if(xx>=0&&yy>=0&&xx<dw&&yy<dh&&mask[yy*dw+xx]){near=1;break;}}
    const fill=hit||near;maskImage.data[j]=maskImage.data[j+1]=maskImage.data[j+2]=fill?255:0;maskImage.data[j+3]=255;
    if(fill){pixels.data[j]=0;pixels.data[j+1]=0;pixels.data[j+2]=0;}
  }
  mctx.putImageData(maskImage,0,0);bctx.putImageData(pixels,0,0);
  const rgb=new Float32Array(3*512*512), m=new Float32Array(512*512);
  for(let i=0;i<m.length;i++){const j=i*4;rgb[i]=pixels.data[j]/255;rgb[m.length+i]=pixels.data[j+1]/255;rgb[2*m.length+i]=pixels.data[j+2]/255;m[i]=maskImage.data[j]/255;}
  progress?.(65);
  const inputs:Record<string,InstanceType<typeof runtime.Tensor>>={};
  for(const name of lama.inputNames){
    const lower=name.toLowerCase();
    if(lower.includes("mask")) inputs[name]=tensor(runtime,m,[1,1,512,512]);
    else inputs[name]=tensor(runtime,rgb,[1,3,512,512]);
  }
  const restored=await lama.run(inputs);
  await lama.release(); sessionCache.delete("lama");
  const result=restored[lama.outputNames[0]];
  if(!result || result.dims.length!==4 || result.dims[1]!==3) throw new Error("LaMa засварын AI гаралтын формат тохирохгүй байна.");
  const values=result.data as Float32Array, output=new ImageData(512,512);
  const max=values.reduce((a,b)=>Math.max(a,b),0), factor=max>1.5?1/255:1;
  for(let i=0;i<512*512;i++){const j=i*4;output.data[j]=Math.max(0,Math.min(255,values[i]*factor*255));output.data[j+1]=Math.max(0,Math.min(255,values[512*512+i]*factor*255));output.data[j+2]=Math.max(0,Math.min(255,values[2*512*512+i]*factor*255));output.data[j+3]=255;}
  const restoredCanvas=document.createElement("canvas");restoredCanvas.width=512;restoredCanvas.height=512;
  restoredCanvas.getContext("2d")!.putImageData(output,0,0);
  // Keep the original detail outside the detected scratch mask.
  const merged=canvasOf(source,originalW,originalH), mfull=document.createElement("canvas");mfull.width=originalW;mfull.height=originalH;
  const mf=mfull.getContext("2d")!;mf.drawImage(maskCanvas,0,0,originalW,originalH);
  const outCtx=merged.getContext("2d")!;outCtx.save();outCtx.globalCompositeOperation="destination-out";outCtx.drawImage(mfull,0,0);outCtx.restore();
  outCtx.drawImage(restoredCanvas,0,0,originalW,originalH);
  // Restore original photo outside mask by overlaying its inverse mask.
  const inverse=document.createElement("canvas");inverse.width=originalW;inverse.height=originalH;
  const inv=inverse.getContext("2d")!, invData=inv.createImageData(originalW,originalH);
  const maskData=mf.getImageData(0,0,originalW,originalH).data;
  for(let i=0;i<originalW*originalH;i++){const j=i*4;invData.data[j]=invData.data[j+1]=invData.data[j+2]=255-maskData[j];invData.data[j+3]=255;}
  inv.putImageData(invData,0,0);
  const original=canvasOf(source,originalW,originalH);
  const restoredFull=canvasOf(restoredCanvas,originalW,originalH);
  const finalCanvas=document.createElement("canvas");finalCanvas.width=originalW;finalCanvas.height=originalH;
  const fctx=finalCanvas.getContext("2d")!;fctx.drawImage(original,0,0);
  fctx.save();fctx.globalCompositeOperation="destination-in";fctx.drawImage(inverse,0,0);fctx.restore();
  const repairLayer=document.createElement("canvas");repairLayer.width=originalW;repairLayer.height=originalH;
  const rctx=repairLayer.getContext("2d")!;rctx.drawImage(restoredFull,0,0);rctx.globalCompositeOperation="destination-in";rctx.drawImage(mfull,0,0);
  fctx.drawImage(repairLayer,0,0);
  progress?.(100);
  return finalCanvas;
}

export async function runOldPhotoAI(source: HTMLImageElement, onProgress?: (value:number)=>void): Promise<Blob> {
  // Sequential model execution limits peak memory on ordinary laptops and phones.
  onProgress?.(3);
  let current=await repairScratches(source,p=>onProgress?.(5+p*.35));
  let intermediate=await canvasToBlob(current);
  let colorInput=await toImage(intermediate);
  onProgress?.(43);
  current=await colorize(colorInput,p=>onProgress?.(43+p*.22));
  intermediate=await canvasToBlob(current);
  onProgress?.(66);
  return intermediate;
}
