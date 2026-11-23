import { Aperture, Contrast, RotateCcw, SlidersHorizontal, Sun, Thermometer, WandSparkles, Zap } from "lucide-react";
import type { RestoreAdjustments } from "../lib/restore";

type Props = { value: RestoreAdjustments; onChange: (value: RestoreAdjustments) => void };
const controls = [
  { key: "brightness", label: "Гэрэлтүүлэг", icon: Sun, min: -40, max: 40, hint: "Гэрэл сүүдрийг тохируулах" },
  { key: "contrast", label: "Контраст", icon: Contrast, min: -40, max: 40, hint: "Өнгөний ялгарал" },
  { key: "saturation", label: "Өнгө", icon: Aperture, min: -50, max: 50, hint: "Өнгөний ханалт" },
  { key: "warmth", label: "Дулаан өнгө", icon: Thermometer, min: -35, max: 35, hint: "Хүйтэн / дулаан туяа" },
  { key: "sharpness", label: "Тодрол", icon: Zap, min: 0, max: 100, hint: "Ирмэгийн тодрол нэмэх" },
] as const;

export default function Toolbar({ value, onChange }: Props) {
  const set = (key: keyof RestoreAdjustments, amount: number) => onChange({ ...value, [key]: amount });
  const reset = () => onChange({ brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpness: 0 });
  const auto = () => onChange({ brightness: 5, contrast: 12, saturation: 8, warmth: 3, sharpness: 28 });
  return <section className="edit-toolbar" aria-label="Зураг засварлах хэрэгслүүд">
    <div className="toolbar-heading"><span className="toolbar-icon"><SlidersHorizontal size={18}/></span><div><b>Зураг засварлах хэрэгсэл</b><small>Өөрийн хүссэнээр нарийн тохируулна</small></div><button className="toolbar-reset" onClick={reset}><RotateCcw size={13}/> Reset</button></div>
    <button className="auto-enhance" onClick={auto}><WandSparkles size={17}/><span><b>Автомат сайжруулалт</b><small>Гэрэл, өнгө, тодролыг нэг дор тохируулах</small></span></button>
    <div className="toolbar-controls">{controls.map(({ key, label, icon: Icon, min, max, hint }) => <label className="tool-control" key={key}>
      <span className="tool-label"><span><Icon size={15}/>{label}</span><output>{value[key]}</output></span>
      <input type="range" min={min} max={max} value={value[key]} onChange={e => set(key, Number(e.target.value))} />
      <small>{hint}</small>
    </label>)}</div>
  </section>;
}