export type OrderStatus = "pending" | "paid" | "expired" | "failed";
export type Order = { id: string; status: OrderStatus; amount: number; currency: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Хүсэлтийг боловсруулахад алдаа гарлаа.");
  return payload as T;
}

export async function createOrder() {
  return request<{ orderId: string; checkoutUrl: string; amount: number; currency: string }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({ product: "restored-photo-hd" }),
  });
}

export async function getOrder(id: string) {
  return request<Order>(`/api/orders/${encodeURIComponent(id)}`);
}