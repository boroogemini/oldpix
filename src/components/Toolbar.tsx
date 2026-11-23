import { Aperture, Contrast, RotateCcw, SlidersHorizontal, Sun, Thermometer, WandSparkles, Zap, Brush, Palette, RotateCw, FlipHorizontal, FlipVertical, Rotate3D, Droplets, Eraser, ImageMinus } from "lucide-react";
import type { RestoreAdjustments } from "../lib/restore";

type Props = { value: RestoreAdjustments; onChange: (value: RestoreAdjustments) => void };
const controls = [
  { key: "brightness", label: "Гэрэлтүүлэг", icon: Sun, min: -40, max: 40, hint: "Гэрэл сүүдрийг тохируулах" },
  { key: "contrast", label: "Контраст", icon: Contrast, min: -40, max: 40, hint: "Өнгөний ялгарал" },
  { key: "saturation", label: "Өнгөний ханалт", icon: Aperture, min: -50, max: 50, hint: "Өнгөний эрч" },
  { key: "warmth", label: "Дулаан өнгө", icon: Thermometer, min: -35, max: 35, hint: "Хүйтэн / дулаан туяа" },
  { key: "sharpness", label: "Тодрол", icon: Zap, min: 0, max: 100, hint: "Ирмэгийн тодрол нэмэх" },
  { key: "scratchReduction", label: "Зураас, тоос багасгах", icon: Eraser, min: 0, max: 100, hint: "Жижиг толбо, тусгаарлагдсан зураасыг зөөлрүүлнэ" },
  { key: "colorize", label: "Хар цагаан зурагт өнгөний туяа", icon: Palette, min: 0, max: 100, hint: "Туршилтын алгоритмын өнгө оруулалт; AI өнгө танилт биш" },
  { key: "sepia", label: "Vintage / Sepia", icon: ImageMinus, min: 0, max: 100, hint: "Дурсамжийн бор шаргал өнгө" },
] as const;

export default function Toolbar({ value, onChange }: Props) {
  const set = (key: keyof RestoreAdjustments, amount: number) => onChange({ ...value, [key]: amount });
  const reset = () => onChange({ brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpness: 0, scratchReduction: 0, colorize: 0, rotation: 0, flipHorizontal: false, flipVertical: false, grayscale: false, sepia: 0 });
  const auto = () => onChange({ ...value, brightness: 5, contrast: 12, saturation: 8, warmth: 3, sharpness: 28, scratchReduction: 18 });
  const rotate = (amount: number) => onChange({ ...value, rotation: (value.rotation + amount + 360) % 360 });
  return <section className="edit-toolbar" aria-label="Зураг засварлах хэрэгслүүд">
    <div className="toolbar-heading"><span className="toolbar-icon"><SlidersHorizontal size={18}/></span><div><b>Зураг засварлах студи</b><small>Үйлдлүүдийг сонгоод дараа нь AI-аар сэргээнэ</small></div><button className="toolbar-reset" onClick={reset}><RotateCcw size={13}/> Бүгдийг цэвэрлэх</button></div>
    <button className="auto-enhance" onClick={auto}><WandSparkles size={17}/><span><b>Автомат сайжруулалт</b><small>Гэрэл, өнгө, тодрол болон зураас багасгалт</small></span></button>
    <div className="editor-action-grid">
      <button type="button" onClick={() => rotate(-90)}><RotateCcw size={16}/> Зүүн тийш эргүүлэх</button>
      <button type="button" onClick={() => rotate(90)}><RotateCw size={16}/> Баруун тийш эргүүлэх</button>
      <button type="button" onClick={() => onChange({ ...value, flipHorizontal: !value.flipHorizontal })}><FlipHorizontal size={16}/> Хэвтээ толь</button>
      <button type="button" onClick={() => onChange({ ...value, flipVertical: !value.flipVertical })}><FlipVertical size={16}/> Босоо толь</button>
    </div>
    <div className="toolbar-controls">{controls.map(({ key, label, icon: Icon, min, max, hint }) => <label className="tool-control" key={key}>
      <span className="tool-label"><span><Icon size={15}/>{label}</span><output>{value[key]}</output></span>
      <input type="range" min={min} max={max} value={value[key]} onChange={e => set(key, Number(e.target.value)} />
      <small>{hint}</small>
    </label>)}</div>
    <div className="editor-note"><Brush size={14}/> Зураас багасгалт нь жижиг толбо, нимгэн гэмтэлд зориулагдсан; том урагдал, дутуу хэсгийг нөхөх AI засвар одоогоор ороогүй.</div>
  </section>;
}