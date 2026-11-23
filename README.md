# OLDPix AI

**Хуучин дурсамжийг шинэчилнэ.**

Монгол хэлтэй, бүртгэлгүй хуучин зураг сэргээх веб апп. Зураг хэрэглэгчийн browser дотор боловсруулагдана. Серверт зөвхөн захиалга болон төлбөрийн metadata хадгална.

## Одоогийн хэрэгжүүлэлт

- Responsive Монгол хэлтэй веб интерфэйс.
- JPG, PNG, WEBP зураг сонгох, 18 MB болон 36 MP дээд хязгаар.
- Browser дотор зураг боловсруулах; эх файл сервер рүү upload хийхгүй.
- ONNX Runtime Web холбох боломжтой adapter (WebGPU → WASM).
- ONNX загвар тохируулаагүй үед локал contrast/sharpen сайжруулалтын fallback. **Энэ fallback нь neural AI биш**; бодит AI restoration загварын файл болон түүний лицензийг баталгаажуулж тохируулах шаардлагатай.
- Нэг HD PNG таталт **₮3,000 MNT**.
- Wire.mn PaymentIntent + Hosted Checkout.
- payment_intent.succeeded webhook: timestamp, HMAC-SHA256, constant-time signature compare, event dedupe, Wire API-аас PaymentIntent дахин шалгах, 3000 MNT/currency/order metadata тулгалт.
- Cloudflare Pages Functions + D1. Зураг, pixel data, output file серверт хадгалахгүй.
- Төлбөрийн цонх шинэ tab-д нээгдэнэ; эх tab дээр Blob санах ойд үлдэж төлбөр баталгаажсаны дараа татагдана.

## Стек

- React + TypeScript + Vite
- ONNX Runtime Web
- Cloudflare Pages Functions
- Cloudflare D1
- Wire.mn Hosted Checkout

## Локал хөгжүүлэлт

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Pages Functions болон D1 binding-тай локал preview:

```bash
npm run pages:dev
```

## Cloudflare тохиргоо

1. Cloudflare Dashboard дээр oldpix-orders нэртэй D1 database үүсгэнэ.
2. Database ID-г wrangler.toml доторх REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID утгаар солино.
3. Schema migration ажиллуулна:

```bash
npx wrangler d1 migrations apply oldpix-orders --remote
```

4. Cloudflare Pages project-ийг GitHub boroogemini/oldpix репозиторт холбоно.
5. Build command: npm run build; output directory: dist.
6. Pages Functions D1 binding нэр заавал DB, database нь oldpix-orders байна.
7. Production environment variables/secrets:

```bash
npx wrangler pages secret put WIRE_API_KEY
npx wrangler pages secret put WIRE_WEBHOOK_SECRET
```

APP_ORIGIN нь wrangler.toml дахь production домэйнтэй яг таарах ёстой. Preview environment-д тусдаа test configuration ашиглана. WIRE_API_KEY, WIRE_WEBHOOK_SECRET-ийг frontend env, GitHub эсвэл VITE_ хувьсагчид хэзээ ч хийж болохгүй.

## Wire.mn тохиргоо

- Wire merchant бүртгэл, KYC болон төлбөрийн операторын идэвхжүүлэлт хийгдсэн байна.
- Wire dashboard-аас тухайн project-ийн live API key болон webhook signing secret авна.
- Webhook URL: https://YOUR_DOMAIN/api/webhooks/wire.
- payment_intent.succeeded event-ийг идэвхжүүлнэ.
- Wire dashboard-ийн signed test ping-ээр webhook signature шалгалтыг баталгаажуулна.
- Hosted checkout ашиглаж байгаа тул PaymentIntent confirm endpoint-ийг давхар дуудахгүй.

## Browser AI model

Default model нь Hugging Face дахь thisismert/real-esrgan-onnx репозитороос Real-ESRGAN general x4v3 ONNX файлыг browser дээр татаж ажиллуулна. VITE_RESTORATION_MODEL_URL тохируулж өөрийн баталгаажсан ONNX загвараар сольж болно. Энэ нь 4× super-resolution болон denoise/upscale зориулалттай; хар-цагаан зураг өнгөт болгох, нүүрийг тусгайлан сэргээх, том зураас/урагдлыг нөхөх тусгай model биш. Одоогийн adapter нь дараах model contract хүлээнэ:

- Input: float32 RGB tensor, shape [1, 3, 512, 512], pixel range [0, 1].
- Output: float32 RGB tensor, shape [1, 3, 4H, 4W] (4× upscale).
- Model нь browser ONNX Runtime Web дээр ажиллах ёстой.
- Model hosting нь browser CORS болон cross-origin шаардлагыг хангах ёстой.

Model-ийн weights энэ repo-д хадгалагдахгүй; browser HTTPS-ээр татна. Одоогийн default Real-ESRGAN ONNX export нь upstream model card-д BSD-3-Clause гэж тэмдэглэгдсэн. Төслийн арилжааны хэрэглээнд ашиглахын өмнө upstream лиценз, attribution болон redistribution нөхцөлийг шалгана. Загвар татагдахгүй эсвэл ажиллахгүй бол fallback нь локал image enhancement бөгөөд UI-д тусад нь тэмдэглэгдэнэ. Зураг сервер рүү upload хийхгүй.

## Нууцлал ба хязгаарлалт

- Зургийн файл API endpoint руу явдаггүй.
- D1-д зөвхөн order ID, PaymentIntent/checkout ID, amount, currency, status, timestamps хадгална.
- Payment checkout шинэ tab-д нээгддэг; төлбөр дуустал эх tab-аа хааж болохгүй. Browser refresh/crash хийвэл memory-д байсан боловсруулсан зураг алдагдаж болно.
- Энэ загвар нь төхөөрөмжийн хүчин чадал, browser memory, model download bandwidth-аас хамаарна.
- Cloudflare Free quota болон Wire.mn гүйлгээний шимтгэл/операторын нөхцөл үйлчилнэ.
- Live merchant credentials, webhook test, domain, model weights болон бодит browser/device QA хийгдээгүй бол production төлбөрийг идэвхжүүлж болохгүй.

## Security checklist

- [ ] D1 database ID-г бодитоор тохируулах
- [ ] Wire live API key болон webhook secret-ийг Cloudflare Secrets-д оруулах
- [ ] Wire dashboard дээр webhook endpoint тохируулах, signed ping амжилттай болгох
- [ ] Production domain/APP_ORIGIN тааруулах
- [ ] Баталгаажсан, лицензтэй ONNX model сонгох эсвэл fallback ашиглаж байгаагаа ил тод хадгалах
- [ ] Chrome, Safari, Firefox, Android/iOS бодит төхөөрөмж дээр зураг болон төлбөрийн урсгалыг турших
- [ ] Privacy policy, terms, merchant contact, refund/support мэдээллийг нийтлэх

## License

Энэ repository-ийн кодын лицензийг эзэмшигч тусад нь сонгож нийтэлнэ. Гуравдагч талын AI model болон weights нь өөрийн тусдаа лицензтэй байна.
