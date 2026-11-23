import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, ImagePlus, LockKeyhole, Moon, ShieldCheck, Sparkles, Sun, UploadCloud, WandSparkles, X } from "lucide-react";
import { createOrder, getOrder } from "./lib/api";
import { restoreImage, type RestoreResult } from "./lib/restore";

type Phase = "idle" | "ready" | "processing" | "done" | "payment" | "paid";

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [resultPreview, setResultPreview] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [compare, setCompare] = useState(50);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [paymentState, setPaymentState] = useState("Төлбөр хүлээж байна");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("huuchin-zurag-theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("huuchin-zurag-theme", theme); }, [theme]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (resultPreview) URL.revokeObjectURL(resultPreview); }, [resultPreview]);

  function selectFile(next?: File) {
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) { setError("JPG, PNG эсвэл WEBP зураг сонгоно уу."); return; }
    if (next.size > 18 * 1024 * 1024) { setError("Зургийн хэмжээ 18 MB-аас бага байх ёстой."); return; }
    setError("");
    if (preview) URL.revokeObjectURL(preview);
    setFile(next); setPreview(URL.createObjectURL(next)); setResult(null); setResultPreview(""); setPhase("ready");
  }
  async function processPhoto() {
    if (!file) return;
    setBusy(true); setError(""); setPhase("processing");
    try {
      setProgress(2);
      const restored = await restoreImage(file, (value) => setProgress(value));
      setResult(restored); setResultPreview(URL.createObjectURL(restored.blob)); setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Зураг сэргээхэд алдаа гарлаа."); setPhase("ready");
    } finally { setBusy(false); }
  }
  async function startPayment() {
    if (!result || busy) return;
    const paymentTab = window.open("about:blank", "_blank");
    if (paymentTab) paymentTab.opener = null;
    setBusy(true); setError("");
    try {
      const order = await createOrder();
      setOrderId(order.orderId); setCheckoutUrl(order.checkoutUrl); setPhase("payment");
      if (paymentTab) paymentTab.location.href = order.checkoutUrl;
      else setError("Төлбөрийн цонх нээгдсэнгүй. Доорх холбоосоор үргэлжлүүлнэ үү.");
    } catch (e) {
      if (paymentTab) paymentTab.close();
      setError(e instanceof Error ? e.message : "Төлбөр үүсгэж чадсангүй.");
    } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!orderId || phase !== "payment") return;
    let active = true;
    const poll = async () => {
      try {
        const order = await getOrder(orderId);
        if (!active) return;
        if (order.status === "paid") { setPhase("paid"); setPaymentState("Төлбөр амжилттай баталгаажлаа"); }
        else if (order.status === "expired" || order.status === "failed") { setError("Төлбөрийн хугацаа дууссан эсвэл амжилтгүй боллоо."); setPhase("done"); }
        else setPaymentState("Төлбөрийг баталгаажуулж байна…");
      } catch { if (active) setPaymentState("Холболтыг шалгаж байна…"); }
    };
    void poll();
    const timer = window.setInterval(() => { if (active) void poll(); }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderId, phase]);
  function download() {
    if (!result || phase !== "paid") return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a"); a.href = url; a.download = `huuchin-zurag-${Date.now()}.png`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(""); setResult(null); setResultPreview(""); setPhase("idle"); setProgress(0); setCompare(50);
    setOrderId(""); setCheckoutUrl(""); setError("");
  }
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Хуучин зураг"><span className="brand-mark"><Sparkles size={21}/></span><span>Хуучин зураг<small>ДУРСАМЖИЙГ ТОДРУУЛНА</small></span></a>
      <div className="top-actions"><span className="privacy-chip"><ShieldCheck size={15}/> Зураг тань төхөөрөмж дээрээ</span><button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Өнгөний горим солих">{theme === "light" ? <Moon size={18}/> : <Sun size={18}/>}<span>{theme === "light" ? "Dark" : "Light"}</span></button></div>
    </header>
    <main className="main-wrap">
      <section className="intro">
        <div className="eyebrow"><span className="eyebrow-dot"/> AI ЗУРАГ СЭРГЭЭЛТ</div>
        <h1>Дурсамжаа <em>дахин тодруул.</em></h1>
        <p>Хуучирсан, зурагдсан, бүдгэрсэн гэрэл зургаа өөрийн хүссэнээр сэргээгээрэй.</p>
      </section>
      <section className="studio">
        <div className="studio-head"><div><span className="step-tag">01 / ЗУРАГ</span><h2>Зургаа оруулах</h2><p>JPG, PNG, WEBP · 18 MB хүртэл</p></div><span className="step-icon"><ImagePlus size={21}/></span></div>
        {!file ? <button className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFile(e.dataTransfer.files[0]); }}>
          <span className="upload-icon"><UploadCloud size={27}/></span><b>Зургаа энд чирж оруулна уу</b><span>эсвэл төхөөрөмжөөсөө сонгоно уу</span><span className="browse-btn">Зураг сонгох <ImagePlus size={16}/></span>
        </button> : <div className="selected-file"><div className="selected-top"><b>Эх зураг</b><button className="icon-btn" onClick={reset} aria-label="Зураг солих"><X size={17}/></button></div><img src={preview} alt="Оруулсан эх зураг"/><div className="file-meta"><span>{file.name}</span><span>{(file.size/1024/1024).toFixed(1)} MB</span></div></div>}
        <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e => selectFile(e.target.files?.[0])}/>
        <div className="ai-engine-card">
          <div className="ai-engine-icon"><Sparkles size={19}/></div>
          <div className="ai-engine-copy"><span className="step-tag">02 / OPEN-SOURCE AI</span><h2>Автомат AI сэргээх</h2><p>Real-ESRGAN x4plus · BSD-3-Clause</p><small>AI загвар таны төхөөрөмж дээр ажиллаж, зургийг 4× хүртэл томруулан деталь болон дүрсний чанарыг сайжруулна.</small></div>
          <span className="model-status">LOCAL AI</span>
        </div>
        <div className="model-privacy"><ShieldCheck size={17}/><span><b>Нээлттэй эхийн AI · Төхөөрөмж дээр боловсруулах</b><small>Зураг серверт илгээгдэхгүй. Одоогоор Real-ESRGAN x4plus загвар идэвхтэй.</small></span></div>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-btn full" onClick={processPhoto} disabled={!file || busy || phase === "payment" || phase === "paid"}>{busy ? <><span className="spinner"/> Боловсруулж байна…</> : <><WandSparkles size={18}/> Зургийг сэргээх</>}</button>
        <div className="local-note"><LockKeyhole size={14}/> Зураг серверт илгээгдэхгүй, таны browser дотор боловсруулагдана.</div>
        {busy && phase === "processing" && <div className="progress-card"><div className="progress-top"><b>AI боловсруулалт</b><span>{Math.round(progress)}%</span></div><div className="progress-track"><i style={{ width: `${progress}%` }}/></div><small>Эхлээд AI загварыг бэлдэж, дараа нь зургийг хэсэгчлэн сэргээж байна.</small></div>}
        <div className="divider-line"/>
        <div className="result-head"><div><span className="step-tag">03 / ҮР ДҮН</span><h2>Сэргээсэн зураг</h2></div><span className={phase === "done" || phase === "paid" ? "status-ready" : "status-wait"}>{phase === "done" || phase === "paid" ? "БЭЛЭН" : phase === "processing" ? "БОЛОВСРУУЛЖ БАЙНА" : "ХҮЛЭЭЖ БАЙНА"}</span></div>
        {result && resultPreview ? <div className="compare-wrap"><div className="compare-view"><img className="compare-after" src={resultPreview} alt="AI-аар сэргээсэн зураг"/><div className="compare-before" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}><img src={preview} alt="Эх зураг"/></div><span className="compare-label before-label">ӨМНӨ</span><span className="compare-label after-label">ДАРАА</span><div className="compare-divider" style={{ left: `${compare}%` }} /></div><input className="compare-range" aria-label="Өмнө ба дараах зургийг харьцуулах" type="range" min="0" max="100" value={compare} onChange={e => setCompare(Number(e.target.value))}/><div className="compare-hint">Харьцуулахын тулд гулсуурыг хөдөлгөнө үү</div></div> : <div className="empty-result"><span className="empty-icon"><WandSparkles size={25}/></span><b>Таны сэргээсэн зураг энд гарна</b><small>Зургаа оруулаад сэргээх товчийг дарна уу.</small></div>}
        {result && <div className="result-details"><span>{result.width} × {result.height} px</span><span>PNG · Төхөөрөмж дээр</span></div>}
        {phase === "done" && <div className="payment-card"><div><span className="payment-label">HD ЗУРАГ ТАТАХ</span><strong>3,000₮</strong><small>Нэг зураг · Нэг удаагийн төлбөр</small></div><button className="primary-btn" onClick={startPayment} disabled={busy}>Төлбөр төлөх <ArrowDownToLine size={16}/></button></div>}
        {phase === "payment" && <div className="payment-wait"><span className="spinner"/><b>{paymentState}</b><small>Төлбөрийн цонхонд гүйлгээгээ хийнэ үү. Энэ хуудсыг хааж болохгүй.</small><a href={checkoutUrl} target="_blank" rel="noreferrer">Төлбөрийн хуудсыг нээх ↗</a></div>}
        {phase === "paid" && <div className="paid-card"><div><Check size={18}/><b>Төлбөр баталгаажлаа</b></div><button className="primary-btn" onClick={download}>HD зураг татах <ArrowDownToLine size={17}/></button></div>}
      </section>
      <div className="bottom-note"><ShieldCheck size={17}/><span><b>Таны зураг — таны нууцлал.</b> Бүртгэл шаардахгүй. Зургийн файл серверт хадгалагдахгүй.</span><strong>3,000₮ / HD</strong></div>
      <p className="fine-print">© {new Date().getFullYear()} Хуучин зураг · Хуучин дурсамжийг хүндэтгэн сэргээнэ.</p>
    </main>
  </div>;
}
