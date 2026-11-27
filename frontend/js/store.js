// Trạng thái app + lưu phiên ẩn danh vào localStorage (UC-01: tải lại trang vẫn giữ ngữ cảnh — AC-SES-02).
import { uid } from "./util.js";

const KEY = "smartbuy.session.v2";
const THREAD_MAX = 60;

export const DEFAULT_FILTERS = () => ({
  q: "", minVnd: null, maxVnd: null, brands: [], minRating: null, attrs: {}, sort: "relevance",
});

export const emptyContext = () => ({
  version: 0, category: null, category_label: null, purpose: null, budget: null, hard: [], soft: [], exclude: [],
});

function freshSession() {
  return {
    session: { id: uid("S-"), startedAt: Date.now() },
    category: "headphones",
    filters: DEFAULT_FILTERS(),
    compare: [],
    agent: { context: emptyContext(), thread: [], scope: { type: "filtered" } },
  };
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.session || !s.session.id) return null;
    const base = freshSession();
    return {
      session: s.session,
      category: s.category || base.category,
      filters: Object.assign(DEFAULT_FILTERS(), s.filters || {}),
      compare: Array.isArray(s.compare) ? s.compare.slice(0, 3) : [],
      agent: {
        context: Object.assign(emptyContext(), (s.agent && s.agent.context) || {}),
        thread: Array.isArray(s.agent && s.agent.thread) ? s.agent.thread : [],
        scope: (s.agent && s.agent.scope) || { type: "filtered" },
      },
    };
  } catch (e) {
    return null;
  }
}

const persisted = loadPersisted();

export const state = Object.assign(freshSession(), persisted || {}, {
  restored: !!persisted,
  view: "catalog",
  catalogView: (() => { try { return localStorage.getItem("smartbuy.view") === "table" ? "table" : "grid"; } catch (e) { return "grid"; } })(),
  diffOnly: false,
  health: null,
  healthError: null,
  catalog: { status: "idle", data: null, error: null },
  busy: false,
  busySince: 0,
  agentOpen: false,
  priceError: null,
});

const listeners = new Map();

export function on(topic, fn) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(fn);
  return () => listeners.get(topic).delete(fn);
}

export function emit(...topics) {
  for (const t of topics) {
    const set = listeners.get(t);
    if (set) set.forEach((fn) => { try { fn(t); } catch (e) { console.error(e); } });
  }
}

export function save() {
  try {
    const thread = state.agent.thread.slice(-THREAD_MAX).map((m) => {
      const { events, ...rest } = m; // trace chi tiết không cần lưu lâu
      return rest;
    });
    localStorage.setItem(KEY, JSON.stringify({
      session: state.session,
      category: state.category,
      filters: state.filters,
      compare: state.compare,
      agent: { context: state.agent.context, thread, scope: state.agent.scope },
    }));
  } catch (e) {
    /* hết dung lượng / chế độ riêng tư — bỏ qua, phiên vẫn chạy trong bộ nhớ */
  }
}

/** AF-02 / AC-SES-03: phiên mới xoá nhu cầu, đề xuất, hội thoại, danh sách so sánh — không kế thừa phiên cũ. */
export function resetSession() {
  const fresh = freshSession();
  state.session = fresh.session;
  state.category = fresh.category;
  state.filters = fresh.filters;
  state.compare = fresh.compare;
  state.agent = fresh.agent;
  state.busy = false;
  state.priceError = null;
  state.restored = false;
  save();
}

export function activeFilterCount() {
  const f = state.filters;
  let n = 0;
  if (f.q) n++;
  if (f.minVnd != null || f.maxVnd != null) n++;
  n += f.brands.length;
  if (f.minRating) n++;
  for (const v of Object.values(f.attrs)) n += v.length;
  return n;
}

export function lastAgentMessage(pred = () => true) {
  const t = state.agent.thread;
  for (let i = t.length - 1; i >= 0; i--) if (t[i].role === "agent" && pred(t[i])) return t[i];
  return null;
}

export function latestReport() {
  return lastAgentMessage((m) => m.payload && Array.isArray(m.payload.recommendations) && m.payload.recommendations.length > 0);
}
