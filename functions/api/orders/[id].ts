interface Env { DB: D1Database; }
type Context = { params: { id: string }; env: Env };
export const onRequestGet = async ({ params, env }: Context): Promise<Response> => {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return json({ error: "Захиалгын дугаар буруу байна." }, 400);
  const row = await env.DB.prepare("SELECT id, amount, currency, status FROM orders WHERE id = ?").bind(params.id).first<{ id: string; amount: number; currency: string; status: string }>();
  if (!row) return json({ error: "Захиалга олдсонгүй." }, 404);
  return json({ orderId: row.id, amount: row.amount, currency: row.currency, status: row.status });
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}