// Tiện ích dùng chung: template HTML có thoát ký tự, DOM, debounce, thông báo cho trình đọc màn hình.

const RAW = Symbol("raw");

/** Đánh dấu chuỗi là HTML đã an toàn (không thoát lại). Chỉ dùng cho markup do code tự tạo. */
export const raw = (s) => ({ [RAW]: true, s: String(s ?? "") });

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

function toStr(v) {
  if (v == null || v === false || v === true) return "";
  if (Array.isArray(v)) return v.map(toStr).join("");
  if (typeof v === "object" && v[RAW]) return v.s;
  return esc(v);
}

/** html`<p>${userText}</p>` — mọi giá trị chèn vào đều được thoát, trừ kết quả của html`` / raw(). */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += toStr(vals[i]) + strings[i + 1];
  return raw(out);
}

/** Vẽ lại một vùng. Nếu focus đang nằm trong vùng, trả focus về đúng phần tử tương ứng sau khi vẽ
 *  (người dùng bàn phím không bị "rơi" focus khi tick ô lọc, bấm nút so sánh…). */
export function render(el, tpl) {
  if (!el) return;
  const active = document.activeElement;
  const key = active && active !== el && el.contains(active) ? focusKey(active) : null;
  el.innerHTML = tpl && tpl[RAW] ? tpl.s : toStr(tpl);
  if (key) {
    const again = el.querySelector(key);
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }
}

const KEY_ATTRS = ["data-action", "data-change", "data-cat", "data-id", "data-key", "data-val", "data-brand", "data-i", "data-v", "data-text", "data-msg", "value"];
function focusKey(node) {
  if (node.id) return "#" + CSS.escape(node.id);
  const parts = KEY_ATTRS.filter((a) => node.hasAttribute(a)).map((a) => `[${a}="${CSS.escape(node.getAttribute(a))}"]`);
  return parts.length ? node.tagName.toLowerCase() + parts.join("") : null;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function uid(prefix = "") {
  const r = (crypto && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(16).slice(2, 10);
  return prefix + r.toUpperCase();
}

let announceTimer;
/** Đọc một câu trạng thái cho trình đọc màn hình (không chuyển focus). */
export function announce(text) {
  const el = document.getElementById("announcer");
  if (!el) return;
  el.textContent = "";
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = text; }, 60);
}

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function focusables(root) {
  return $$(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    root,
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** Giữ Tab trong một vùng (drawer, dialog). Trả hàm gỡ. */
export function trapFocus(root) {
  function onKey(e) {
    if (e.key !== "Tab") return;
    const list = focusables(root);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  root.addEventListener("keydown", onKey);
  return () => root.removeEventListener("keydown", onKey);
}

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
