// Gọi API của codebase/web.py. Phân biệt rõ: lỗi mạng / lỗi công cụ / dữ liệu rỗng (BR-ST-03, EF-03).

export class ApiError extends Error {
  constructor(message, type = "ERROR", status = 0) {
    super(message);
    this.type = type;
    this.status = status;
  }
}

async function request(path, { method = "GET", body, timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new ApiError("Hết thời gian chờ máy chủ phản hồi.", "TIMEOUT");
    throw new ApiError("Không kết nối được máy chủ SmartBuy. Kiểm tra lệnh python codebase/web.py còn chạy không.", "NETWORK");
  }
  clearTimeout(timer);
  let data = null;
  try { data = await res.json(); } catch (e) { /* không phải JSON */ }
  if (!res.ok) {
    const err = (data && data.error) || {};
    throw new ApiError(err.message || `Máy chủ trả lỗi HTTP ${res.status}.`, err.type || `HTTP_${res.status}`, res.status);
  }
  return data;
}

const productCache = new Map();   // chi tiết đầy đủ (có bằng chứng)
const summaryCache = new Map();   // bản tóm tắt từ danh sách — đủ để vẽ khay so sánh, thẻ nhỏ

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    u.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = u.toString();
  return s ? "?" + s : "";
}

export const api = {
  health: () => request("/api/health", { timeout: 8000 }),
  catalog: (params) => request("/api/catalog" + qs(params)),
  async product(id) {
    if (productCache.has(id)) return productCache.get(id);
    const p = await request("/api/products/" + encodeURIComponent(id));
    productCache.set(id, p);
    return p;
  },
  async products(ids) {
    const need = ids.filter((id) => !productCache.has(id));
    let missing = [];
    if (need.length) {
      const r = await request("/api/products" + qs({ ids: need }));
      r.items.forEach((p) => productCache.set(p.id, p));
      missing = r.missing || [];
    }
    return { items: ids.map((id) => productCache.get(id)).filter(Boolean), missing };
  },
  cached: (id) => productCache.get(id) || summaryCache.get(id) || null,
  remember(items) { (items || []).forEach((p) => p && p.id && summaryCache.set(p.id, p)); },
  async compare(ids) {
    const r = await request("/api/compare" + qs({ ids }));
    (r.items || []).forEach((p) => productCache.set(p.id, p));
    return r;
  },
  agent: (text, context) => request("/api/agent", { method: "POST", body: { text, context }, timeout: 180000 }),
  trace: (runId) => request("/api/trace/" + encodeURIComponent(runId)),
};
