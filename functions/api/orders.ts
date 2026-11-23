interface Env {
  DB: D1Database;
  WIRE_API_KEY: string;
  WIRE_QPAY_OPERATOR_ID: string;
  APP_ORIGIN: string;
}
type Context = { request: Request; env: Env };

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  if (!env.WIRE_API_KEY || !env.WIRE_QPAY_OPERATOR_ID) return json({ error: "QPay төлбөрийн суваг хараахан тохируулагдаагүй байна." }, 503);
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).origin !== new URL(env.APP_ORIGIN).origin) return json({ error: "Хүсэлтийг зөвшөөрсөнгүй." }, 403);
  const body = await request.json().catch(() => null) as { product?: string } | null;
  if (body?.product !== "restored-photo-hd") return json({ error: "Бүтээгдэхүүний хүсэлт буруу байна." }, 400);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO orders (id, amount, currency, status, created_at) VALUES (?, 3000, 'MNT', 'creating', ?)")
    .bind(id, createdAt).run();

  try {
    const piResponse = await fetch("https://api.wire.mn/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WIRE_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `oldpix-${id}-intent`,
      },
      body: JSON.stringify({
        amount: 3000,
        currency: "MNT",
        automatic_operator: false,
        allowed_operators: [env.WIRE_QPAY_OPERATOR_ID],
        description: "OLDPix AI — HD зураг татах",
        metadata: { order_id: id, product: "restored-photo-hd" },
      }),
    });
    const pi = await piResponse.json() as { id?: string; status?: string; error?: { message?: string } };
    if (!piResponse.ok || !pi.id) throw new Error(pi.error?.message || "Wire төлбөрийн хүсэлт үүссэнгүй.");

    await env.DB.prepare("UPDATE orders SET payment_intent_id = ?, status = 'pending' WHERE id = ?")
      .bind(pi.id, id).run();

    const checkoutResponse = await fetch("https://api.wire.mn/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WIRE_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `oldpix-${id}-checkout`,
      },
      body: JSON.stringify({
        payment_intent: pi.id,
        success_url: `${env.APP_ORIGIN}/?payment=return&order=${id}`,
        cancel_url: `${env.APP_ORIGIN}/?payment=cancel&order=${id}`,
      }),
    });
    const checkout = await checkoutResponse.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!checkoutResponse.ok || !checkout.url || !checkout.id || !checkout.url.startsWith("https://pay.wire.mn/")) {
      throw new Error(checkout.error?.message || "Wire checkout холбоос үүссэнгүй.");
    }
    await env.DB.prepare("UPDATE orders SET checkout_session_id = ? WHERE id = ?").bind(checkout.id, id).run();
    return json({ orderId: id, checkoutUrl: checkout.url, amount: 3000, currency: "MNT" }, 201);
  } catch (error) {
    await env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").bind(id).run();
    return json({ error: error instanceof Error ? error.message : "Төлбөр үүсгэхэд алдаа гарлаа." }, 502);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}