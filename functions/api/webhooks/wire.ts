interface Env { DB: D1Database; WIRE_API_KEY: string; WIRE_WEBHOOK_SECRET: string; }
type Context = { request: Request; env: Env };

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  if (!env.WIRE_WEBHOOK_SECRET || !env.WIRE_API_KEY) return new Response("Webhook is not configured", { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("WirePayment-Signature") || "";
  const parsed = parseSignature(signature);
  if (!parsed || Math.abs(Date.now() / 1000 - parsed.timestamp) > 300) return new Response("Invalid signature timestamp", { status: 400 });
  const expected = await hmacHex(env.WIRE_WEBHOOK_SECRET, `${parsed.timestamp}.${raw}`);
  if (!constantTimeEqual(expected, parsed.v1)) return new Response("Invalid signature", { status: 400 });

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!event.id || !event.type) return new Response("Invalid event", { status: 400 });

  const already = await env.DB.prepare("SELECT event_id FROM webhook_events WHERE event_id = ?").bind(event.id).first();
  if (already) return new Response("ok", { status: 200 });
  if (event.type !== "payment_intent.succeeded") {
    await env.DB.prepare("INSERT OR IGNORE INTO webhook_events (event_id, event_type, received_at) VALUES (?, ?, ?)")
      .bind(event.id, event.type, new Date().toISOString()).run();
    return new Response("ok", { status: 200 });
  }

  const object = event.data?.object || {};
  const intentId = String(object.id || "");
  const metadata = object.metadata as Record<string, unknown> | undefined;
  const orderId = String(metadata?.order_id || "");
  if (!intentId || !orderId) return new Response("Missing payment metadata", { status: 400 });

  // Never trust webhook body alone: re-read the PaymentIntent from Wire before fulfilment.
  const verifyResponse = await fetch(`https://api.wire.mn/v1/payment_intents/${encodeURIComponent(intentId)}`, {
    headers: { Authorization: `Bearer ${env.WIRE_API_KEY}` },
  });
  if (!verifyResponse.ok) return new Response("Could not verify payment intent", { status: 502 });
  const intent = await verifyResponse.json() as { id?: string; status?: string; amount?: number; currency?: string; metadata?: Record<string, unknown> };
  if (intent.id !== intentId || intent.status !== "succeeded" || intent.amount !== 3000 || intent.currency !== "MNT" || String(intent.metadata?.order_id || "") !== orderId) {
    return new Response("Payment does not match order", { status: 400 });
  }

  const update = await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND payment_intent_id = ? AND amount = 3000 AND currency = 'MNT' AND status = 'pending'")
    .bind(new Date().toISOString(), orderId, intentId).run();
  if (!update.success) return new Response("Could not update order", { status: 500 });
  await env.DB.prepare("INSERT OR IGNORE INTO webhook_events (event_id, event_type, received_at) VALUES (?, ?, ?)")
    .bind(event.id, event.type, new Date().toISOString()).run();
  return new Response("ok", { status: 200 });
};

function parseSignature(value: string): { timestamp: number; v1: string } | null {
  const parts = Object.fromEntries(value.split(",").map(part => part.trim().split("=", 2)));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !/^[a-f0-9]{64}$/i.test(parts.v1 || "")) return null;
  return { timestamp, v1: parts.v1.toLowerCase() };
}
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}