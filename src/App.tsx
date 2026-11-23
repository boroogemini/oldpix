import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, CircleHelp, ImagePlus, LockKeyhole, Menu, ShieldCheck, Sparkles, UploadCloud, WandSparkles, X } from "lucide-react";
import { createOrder, getOrder } from "./lib/api";
import { restoreImage, type RestoreResult } from "./lib/restore";

type Phase = "idle" | "ready" | "processing" | "done" | "payment" | "paid";
const money = new Intl.NumberFormat("mn-MN");

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [resultPreview, setResultPreview] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [paymentState, setPaymentState] = useState("Төлбөр хүлээж байна");
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (resultPreview) URL.revokeObjectURL(resultPreview); }, [resultPreview]);

  function selectFile(next?: File) {
    if (!next) return;
    if (!next.type.startsWith("image/")) { setError("Зөвхөн зураг файл сонгоно уу."); return; }
    if (next.size > 18 * 1024 * 1024) { setError("Зургийн хэмжээ 18 MB-аас бага байх ёстой."); return; }
    setError("");
    if (preview) URL.revokeObjectURL(preview);
    setFile(next); setPreview(URL.createObjectURL(next)); setResult(null); setResultPreview(""); setPhase("ready");
  }

  async function processPhoto() {
    if (!file) return;
    setBusy(true); setError(""); setPhase("processing");
    try {
      const restored = await restoreImage(file);
      setResult(restored); setResultPreview(URL.createObjectURL(restored.blob)); setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Зураг сэргээхэд алдаа гарлаа.");
      setPhase("ready");
    } finally { setBusy(false); }
  }

  async function startPayment() {
    if (!result || busy) return;
    setBusy(true); setError("");
    try {
      const order = await createOrder();
      setOrderId(order.orderId); setCheckoutUrl(order.checkoutUrl); setPhase("payment");
      const tab = window.open(order.checkoutUrl, "_blank", "noopener,noreferrer");
      if (!tab) setError("Төлбөрийн цонх нээгдсэнгүй. Pop-up зөвшөөрөөд дахин оролдоно уу.");
    } catch (e) {
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
        else if (order.status === "expired" || order.status === "failed") { setError("Төлбөрийн хугацаа дууссан эсвэл амжилтгүй боллоо. Дахин төлбөр үүсгэнэ үү."); setPhase("done"); }
        else setPaymentState("Wire.mn төлбөрийг баталгаажуулж байна…");
      } catch { if (active) setPaymentState("Холболтыг шалгаж байна…"); }
    };
    void poll();
    const timer = window.setInterval(() => { if (active) void poll(); }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderId, phase]);

  function download() {
    if (!result || phase !== "paid") return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url; a.download = `oldpix-ai-${Date.now()}.png`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(""); setResult(null); setResultPreview(""); setPhase("idle");
    setOrderId(""); setCheckoutUrl(""); setError("");
  }

  const faqs = [
    ["Миний зураг хаана хадгалагдах вэ?", "Таны зураг зөвхөн өөрийн browser дотор боловсруулагдана. Эх зураг болон сэргээсэн зураг манай сервер рүү илгээгдэхгүй."],
    ["Хэзээ төлбөр төлөх вэ?", "Зургаа сонгож боловсруулан үр дүнг урьдчилан харсны дараа өндөр нягтралтай PNG татахын өмнө нэг зурагт 3,000₮ төлнө."],
    ["Төлбөр хийсний дараа зураг татагдахгүй бол яах вэ?", "Төлбөрийг Wire.mn webhook-оор сервер баталгаажуулна. Энэ үед хуудсыг хаахгүй байгаарай. Төлбөр баталгаажмагц татах товч идэвхжинэ."],
    ["Утаснаас ашиглаж болох уу?", "Орчин үеийн Chrome, Edge, Safari болон Firefox browser дээр ажиллахаар бүтээгдсэн. Том хэмжээний зураг боловсруулахад төхөөрөмжийн хүчин чадал нөлөөлнө."]
  ];

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="OLDPix AI нүүр"><span className="brand-mark"><Sparkles size={20}/></span><span>OLDPix<span className="brand-ai"> AI</span><small>ХУУЧИН ДУРСАМЖИЙГ ШИНЭЧИЛНЭ</small></span></a>
      <nav><a href="#how">Хэрхэн ажиллах вэ</a><a href="#privacy">Нууцлал</a><a href="#faq">Түгээмэл асуулт</a></nav>
      <a className="nav-cta" href="#restore">Зураг сэргээх <ArrowRight size={16}/></a>
      <button className="mobile-menu" aria-label="Цэс"><Menu/></button>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot"/> ДУРСАМЖ БҮХЭН ҮНЭ ЦЭНТЭЙ</div>
          <h1>Хуучин дурсамжийг<br/><em>шинэчилнэ.</em></h1>
          <p className="hero-lead">Он цагийн бүдэгрүүлсэн гэрэл зургаа сэргээж, хайртай мөчүүдээ дахин тод хараарай.</p>
          <div className="hero-points"><span><Check size={16}/> Зураг таны төхөөрөмжөөс гарахгүй</span><span><Check size={16}/> Бүртгэл шаардлагагүй</span></div>
          <a className="primary-btn" href="#restore">Зургаа сэргээж эхлэх <ArrowRight size={18}/></a>
          <div className="price-note"><strong>3,000₮</strong><span>Зөвхөн HD зураг татах үед · Нэг удаагийн төлбөр</span></div>
        </div>
        <div className="hero-art">
          <div className="photo-stack">
            <div className="photo-back"><div className="fake-photo old"><span>1994</span></div></div>
            <div className="photo-front"><div className="fake-photo new"><div className="photo-glow"/><span>Дурсамж</span></div><div className="photo-caption"><span>ӨЧИГДӨР</span><ArrowRight size={15}/><span>ӨНӨӨДӨР</span></div></div>
            <div className="floating-seal"><Sparkles size={19}/><span>ШИНЭ<br/>АМЬДРАЛ</span></div>
          </div>
          <div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/>
          <div className="art-label"><span className="art-label-icon"><WandSparkles size={16}/></span><span><b>Дурсамж сэргээх</b><small>Гэрэл зурагт шинэ амьдрал</small></span></div>
        </div>
      </section>

      <section className="trust-strip"><div><ShieldCheck/><span><b>Нууцлал хамгаалагдсан</b><small>Зураг серверт хадгалахгүй</small></span></div><div><Sparkles/><span><b>Хялбар боловсруулалт</b><small>Өөрийн төхөөрөмж дээр</small></span></div><div><LockKeyhole/><span><b>Нэг удаагийн төлбөр</b><small>Сарын эрх, нэмэлт төлбөргүй</small></span></div></section>

      <section className="restore-section" id="restore">
        <div className="section-heading"><div className="eyebrow">ЭХЛЭХЭД АМАРХАН</div><h2>Таны дурсамж эндээс <em>сэргэнэ.</em></h2><p>Зургаа оруулаад сэргээх үйлдлийг эхлүүлээрэй.</p></div>
        <div className="workspace">
          <div className="upload-panel">
            {!file ? <button className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault(); selectFile(e.dataTransfer.files[0]);}}>
              <span className="upload-icon"><UploadCloud size={28}/></span><b>Зургаа энд оруулна уу</b><span>Эсвэл энд дарж төхөөрөмжөөсөө сонгоно уу</span><small>JPG, PNG, WEBP · Дээд хэмжээ 18 MB</small><span className="browse-btn">Зураг сонгох <ImagePlus size={16}/></span>
            </button> : <div className="selected-file"><div className="selected-top"><b>Таны зураг</b><button className="icon-btn" onClick={reset} aria-label="Зураг солих"><X size={18}/></button></div><img src={preview} alt="Сонгосон эх зураг"/><div className="file-meta"><span>{file.name}</span><span>{(file.size/1024/1024).toFixed(1)} MB</span></div></div>}
            <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e => selectFile(e.target.files?.[0])}/>
            {error && <div className="error-box">{error}</div>}
            {file && phase !== "done" && phase !== "payment" && phase !== "paid" && <button className="primary-btn full" onClick={processPhoto} disabled={busy}>{busy ? <><span className="spinner"/> Боловсруулж байна…</> : <>Зураг сэргээх <WandSparkles size={18}/></>}</button>}
            {phase === "processing" && <div className="processing-note"><span className="spinner"/> Зургийг таны төхөөрөмж дээр боловсруулж байна. Хуудсыг хаахгүй түр хүлээнэ үү.</div>}
            <div className="local-note"><LockKeyhole size={15}/> Зургийн файл сервер рүү илгээгдэхгүй.</div>
          </div>
          <div className="result-panel">
            <div className="result-head"><b>Сэргээсэн зураг</b><span className={phase === "done" || phase === "paid" ? "status-ready" : "status-wait"}>{phase === "done" || phase === "paid" ? "БЭЛЭН" : "ХҮЛЭЭЖ БАЙНА"}</span></div>
            {result && preview ? <div className="result-image"><img src={resultPreview} alt="Сэргээсэн зураг"/><span>{result.mode === "onnx" ? "AI ЗАГВАР" : "ЛОКАЛ САЙЖРУУЛАЛТ"}</span></div> : <div className="empty-result"><span className="empty-icon"><WandSparkles size={26}/></span><b>Таны сэргээсэн зураг энд харагдана</b><small>Эхлээд зургaa сонгоод боловсруулна уу.</small></div>}
            {result && <div className="result-details"><span>{result.width} × {result.height} px</span><span>PNG · Төхөөрөмж дээр</span></div>}
            {phase === "done" && <div className="payment-card"><div><span className="payment-label">HD ТАТАХ ЭРХ</span><strong>3,000₮</strong><small>Нэг зураг · Нэг удаагийн төлбөр</small></div><button className="primary-btn" onClick={startPayment} disabled={busy}>{busy ? "Үүсгэж байна…" : <>Төлбөр төлөх <ArrowRight size={17}/></>}</button></div>}
            {phase === "payment" && <div className="payment-wait"><span className="spinner"/><b>{paymentState}</b><small>Wire.mn төлбөрийн цонхонд гүйлгээгээ хийнэ үү. Энэ хуудсыг хааж болохгүй.</small><a href={checkoutUrl} target="_blank" rel="noreferrer">Төлбөрийн цонхыг дахин нээх <ArrowRight size={14}/></a></div>}
            {phase === "paid" && <div className="paid-card"><div><Check size={19}/><b>Төлбөр баталгаажлаа!</b></div><button className="primary-btn" onClick={download}>HD зураг татах <ArrowDownToLine size={18}/></button></div>}
          </div>
        </div>
        <p className="workspace-foot"><CircleHelp size={15}/> Төлбөр зөвхөн өндөр нягтралтай зургийг татах үед хийгдэнэ.</p>
      </section>

      <section className="steps-section" id="how"><div className="section-heading"><div className="eyebrow">ГУРАВХАН АЛХАМ</div><h2>Хялбар. Аюулгүй. <em>Таны мэдэлд.</em></h2></div><div className="steps-grid"><article><span>01</span><div className="step-icon"><ImagePlus/></div><h3>Зургаа оруулах</h3><p>Хуучин зургаа төхөөрөмжөөсөө сонгоно. Бүртгэл, нэвтрэх шаардлагагүй.</p></article><article><span>02</span><div className="step-icon"><WandSparkles/></div><h3>Сэргээх</h3><p>Зураг таны browser дотор боловсруулагдана. Эх файл сервер рүү явахгүй.</p></article><article><span>03</span><div className="step-icon"><ArrowDownToLine/></div><h3>Татаж авах</h3><p>Үр дүнгээ үзээд 3,000₮ төлсний дараа HD PNG зургаа татна.</p></article></div></section>

      <section className="privacy-section" id="privacy"><div className="privacy-icon"><ShieldCheck size={30}/></div><div><div className="eyebrow">ТАНЫ ДУРСАМЖ — ТАНЫХ</div><h2>Нууцлал бол бидний <em>үндэс.</em></h2><p>Таны оруулсан зураг манай серверт хуулбарлагдахгүй. Боловсруулалт болон татах файл таны төхөөрөмж дээр байна. Сервер зөвхөн захиалга, төлбөрийн төлөв зэрэг шаардлагатай мэдээллийг хадгална.</p><div className="privacy-points"><span><Check/> Зураг хадгалахгүй</span><span><Check/> Бүртгэл шаардахгүй</span><span><Check/> Төлбөр серверээр баталгаажна</span></div></div></section>

      <section className="faq-section" id="faq"><div className="section-heading"><div className="eyebrow">ТУСЛАМЖ</div><h2>Түгээмэл <em>асуултууд.</em></h2></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item" key={q}><button onClick={()=>setFaqOpen(faqOpen===i?null:i)}><b>{q}</b><ChevronDown className={faqOpen===i?"rotated":""}/></button>{faqOpen===i&&<p>{a}</p>}</div>)}</div></section>
    </main>
    <footer><a className="brand" href="#"><span className="brand-mark"><Sparkles size={18}/></span><span>OLDPix<span className="brand-ai"> AI</span><small>ХУУЧИН ДУРСАМЖИЙГ ШИНЭЧИЛНЭ</small></span></a><span>© {new Date().getFullYear()} OLDPix AI. Бүх эрх хуулиар хамгаалагдсан.</span><a href="mailto:hello@oldpix.mn">Холбоо барих</a></footer>
  </div>;
}