// Mảnh giao diện dùng chung: giá, sao, tem kiểm định (LED), hàng thông số, trạng thái, token nhu cầu, thanh đo phân đoạn.
import { html } from "./util.js";
import { icon } from "./icons.js";
import * as fmt from "./fmt.js";
import { state } from "./store.js";

export const ATTR_LABELS_FALLBACK = {
  connectivity: "Kết nối", wear_type: "Kiểu đeo", microphone: "Micro", anc: "Chống ồn chủ động (ANC)",
  battery: "Pin", weight: "Trọng lượng", dpi: "Độ phân giải (DPI)", buttons: "Số nút", shape: "Kiểu dáng",
  layout: "Bố cục", switch: "Switch", hot_swap: "Hot-swap", backlight: "Đèn nền",
};
/** Nhãn ngắn kiểu datasheet cho hàng thông số / token. */
export const SHORT = {
  connectivity: "kết nối", wear_type: "kiểu", microphone: "mic", anc: "anc", battery: "pin", weight: "nặng",
  dpi: "dpi", buttons: "nút", shape: "dáng", layout: "bố cục", switch: "switch", hot_swap: "hot-swap",
  backlight: "đèn", price: "giá",
};

function catMeta() {
  return (state.catalog.data && state.catalog.data.catalog) || (state.health && state.health.catalog) || {};
}

export function attrLabel(key) {
  const meta = catMeta();
  return (meta.attribute_labels && meta.attribute_labels[key]) || ATTR_LABELS_FALLBACK[key] || key;
}

export function catLabel(key) {
  if (key === "all") return "Tất cả";
  const c = (catMeta().categories || {})[key];
  return (c && c.label) || ({ headphones: "Tai nghe", mouse: "Chuột", keyboard: "Bàn phím" }[key] || key);
}

export const fxInfo = () => catMeta().fx || {};

export const CARD_KEYS = {
  headphones: ["connectivity", "wear_type", "microphone"],
  mouse: ["connectivity", "dpi", "battery"],
  keyboard: ["connectivity", "layout", "switch"],
};

export function priceBlock(p) {
  if (p.price_vnd == null) {
    return html`<div class="price price--none"><span class="price__vnd">price: null</span><span class="price__usd">chưa có giá tham khảo</span></div>`;
  }
  return html`<div class="price"><span class="price__vnd">≈ ${fmt.vnd(p.price_vnd)}</span><span class="price__usd">${fmt.usd(p.price_usd)}<span class="price__note"> · tham khảo</span></span></div>`;
}

export function stars(r, count) {
  if (r == null) return html`<span class="stars">—</span>`;
  return html`<span class="stars" title="Điểm trung bình ${fmt.rating(r)}/5${count != null ? ` trên ${fmt.int(count)} lượt` : ""}">${icon("star")}${fmt.rating(r)}</span>`;
}

const STAMP = {
  VERIFIED: ["stamp--verified", "Đã xác minh"],
  UNKNOWN: ["stamp--unknown", "Chưa xác minh"],
  CONFLICT: ["stamp--conflict", "Mâu thuẫn"],
};
export function stamp(status) {
  const [cls, label] = STAMP[status] || STAMP.UNKNOWN;
  return html`<span class="stamp ${cls}">${label}</span>`;
}

export const ledFor = (status) => ({ VERIFIED: "ok", CONFLICT: "warn" }[status] || "unknown");

/** Hàng thông số trên thẻ: LED + nhãn ngắn + giá trị. Chưa xác minh / mâu thuẫn nói rõ, không bịa (AC-DTL-01). */
export function specToken(p, key) {
  const a = (p.attributes || {})[key] || { status: "UNKNOWN" };
  const st = a.status || "UNKNOWN";
  const label = attrLabel(key);
  const v = st === "VERIFIED" ? a.value : st === "CONFLICT" ? "nguồn mâu thuẫn" : "chưa xác minh";
  return html`<div class="spec spec--${st === "VERIFIED" ? "ok" : st.toLowerCase()}" title="${label}: ${st === "VERIFIED" ? a.value : st === "CONFLICT" ? "các nguồn ghi khác nhau" : "chưa xác minh"}">
    <span class="led led--${ledFor(st)}" aria-hidden="true"></span><span class="k">${SHORT[key] || key}</span><span class="v">${v}</span></div>`;
}

export const STATES = {
  "ST-01": { label: "Tiếp nhận nhu cầu", tone: "busy", code: "RECV" },
  "ST-02": { label: "Chờ làm rõ", tone: "wait", code: "ASK" },
  "ST-03": { label: "Đang tư vấn", tone: "busy", code: "RUN" },
  "ST-04": { label: "Có kết quả", tone: "ok", code: "OK" },
  "ST-05": { label: "Kết quả hạn chế", tone: "wait", code: "PARTIAL" },
  "ST-06": { label: "Không có kết quả phù hợp", tone: "idle", code: "NO_MATCH" },
  "ST-07": { label: "Chờ bạn xác nhận", tone: "wait", code: "CONFIRM" },
  "ST-08": { label: "Không thể xử lý", tone: "err", code: "ERROR" },
  "ST-09": { label: "Ngoài phạm vi", tone: "idle", code: "SCOPE" },
};

export function statePill(code, { withCode = true } = {}) {
  const s = STATES[code];
  if (!s) return html`<span class="state state--idle">idle · sẵn sàng</span>`;
  return html`<span class="state state--${s.tone}" title="${code}">${withCode ? html`<span>${code}</span><span class="muted">·</span>` : ""}${s.label}</span>`;
}

/** Thanh đo phân đoạn kiểu LED. value 0–100. */
export function segm(value, { n = 20, accent = false, cls = "" } = {}) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const on = Math.round((v / 100) * n);
  return html`<span class="segm ${accent ? "segm--accent" : ""} ${cls}" aria-hidden="true">${Array.from({ length: n }, (_, k) => html`<i class="${k < on ? "on" : ""}" style="--k:${k}"></i>`)}</span>`;
}

export function meter(code, name, weight, value, { accent = false } = {}) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  return html`<div class="meter" role="img" aria-label="${name}: ${v == null ? "không áp dụng" : fmt.score(v) + " trên 100"}">
    <span class="meter__name"><b>${code}</b>${name}${weight ? html` <span class="muted">×${weight}</span>` : ""}</span>
    <span class="meter__val">${v == null ? "n/a" : fmt.score(v)}</span>
    ${segm(v, { accent })}
  </div>`;
}

/** Token của sổ nhu cầu — hard (khoá), soft (ưu tiên), loại trừ, mục đích. removable → nút × (BR-CTX-12). */
export function ctxChip(kind, item, idx, { removable = false } = {}) {
  const label = typeof item === "string" ? item : item.label;
  const key = typeof item === "object" && item ? item.key : null;
  const cls = { hard: "chip--hard", soft: "chip--soft", exclude: "chip--exclude", purpose: "chip--purpose" }[kind] || "";
  const lead = kind === "hard" ? icon("lock", { size: 12 }) : kind === "exclude" ? icon("ban", { size: 12 }) : "";
  const what = { hard: "điều kiện bắt buộc", soft: "tiêu chí ưu tiên", exclude: "điều kiện loại trừ", purpose: "mục đích" }[kind];
  const k = kind === "hard" && key && SHORT[key] && !label.toLowerCase().includes(SHORT[key]) ? html`<span class="k">${SHORT[key]}</span>` : "";
  return html`<span class="chip ${cls}" title="${what}: ${label}">${lead}${k}<span>${label}</span>${removable ? html`<button class="chip__x" data-action="ctx-remove" data-kind="${kind}" data-idx="${idx}" aria-label="Bỏ ${what}: ${label}">${icon("x")}</button>` : ""}</span>`;
}

export function contextChips(ctx, { removable = false } = {}) {
  if (!ctx) return "";
  return [
    ctx.category_label ? html`<span class="chip chip--purpose"><span class="k">cat</span><span>${ctx.category_label}</span></span>` : "",
    (ctx.hard || []).map((h, i) => ctxChip("hard", h, i, { removable })),
    (ctx.soft || []).map((s, i) => ctxChip("soft", s, i, { removable })),
    ctx.purpose ? ctxChip("purpose", ctx.purpose, 0) : "",
    (ctx.exclude || []).map((x, i) => ctxChip("exclude", x, i, { removable })),
  ];
}

/** Trạng thái trống. glyph: tên icon đặt trong ô phía trên tiêu đề; center: canh giữa (vùng kết quả rộng). */
export function emptyState({ title, body, actions = "", glyph = "", center = false }) {
  return html`<div class="empty ${center ? "empty--center" : ""}">
    ${glyph ? html`<span class="empty__icon" aria-hidden="true">${icon(glyph, { size: 22 })}</span>` : ""}
    <p class="empty__title">${title}</p><p class="empty__body">${body}</p><div class="empty__actions">${actions}</div></div>`;
}

export function errorNotice(err, { retry = "", extra = "" } = {}) {
  const type = (err && err.type) || "ERROR";
  const title = {
    NETWORK: "Không kết nối được máy chủ",
    TIMEOUT: "Máy chủ phản hồi quá lâu",
    TOOL_ERROR: "Lỗi truy xuất dữ liệu",
    INVALID_INPUT: "Điều kiện chưa hợp lệ",
    NOT_FOUND: "Không tìm thấy",
  }[type] || "Có lỗi xảy ra";
  return html`<div class="notice notice--err" role="alert">${icon("alert")}
    <div class="notice__title">${title} <span class="mono muted" style="font-size:11px;font-weight:500">[${type}]</span></div>
    <div class="notice__body">${(err && err.message) || ""} ${extra}</div>
    ${retry ? html`<div class="notice__actions">${retry}</div>` : ""}
  </div>`;
}
