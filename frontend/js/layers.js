// Lớp phủ: ngăn kéo (drawer), hộp thoại, popover, toast. Giữ focus trong lớp, Esc để đóng, trả focus về chỗ cũ.
import { html, render, trapFocus, focusables, prefersReducedMotion } from "./util.js";
import { icon } from "./icons.js";

const root = () => document.getElementById("layer-root");
const app = () => document.getElementById("app");
const stack = [];

function syncInert() {
  const modal = stack.some((l) => l.modal);
  const a = app();
  if (a) a.inert = modal;
  const tray = document.getElementById("tray-root");
  if (tray) tray.inert = modal;
}

function mount(markup) {
  const wrap = document.createElement("div");
  render(wrap, markup);
  const nodes = Array.from(wrap.children);
  nodes.forEach((n) => root().appendChild(n));
  return nodes;
}

function makeLayer({ nodes, panel, modal, onClose, restore }) {
  const untrap = modal ? trapFocus(panel) : () => {};
  const layer = {
    panel, modal, closed: false,
    close(reason = "api") {
      if (layer.closed) return;
      layer.closed = true;
      untrap();
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      syncInert();
      const done = () => nodes.forEach((n) => n.remove());
      if (prefersReducedMotion()) done();
      else {
        nodes.forEach((n) => n.classList.add("is-closing"));
        setTimeout(done, 190);
      }
      if (restore && document.contains(restore)) restore.focus({ preventScroll: true });
      if (onClose) onClose(reason);
    },
  };
  stack.push(layer);
  syncInert();
  return layer;
}

/** Ngăn kéo bên phải (hoặc trái). body: markup html``. Trả { el, body, head, close }. */
export function openDrawer({ label, kicker = "", title = "", body, side = "right", narrow = false, actions = "", onClose }) {
  const restore = document.activeElement;
  const cls = ["drawer", side === "left" ? "drawer--left" : "", narrow ? "drawer--narrow" : ""].join(" ");
  const nodes = mount(html`
    <div class="scrim" data-scrim></div>
    <section class="${cls}" role="dialog" aria-modal="true" aria-label="${label}">
      <header class="drawer__head">
        <div class="drawer__title" data-drawer-title>${kicker ? html`<span class="kicker">${kicker}</span>` : ""}${title}</div>
        <div style="display:flex;gap:6px;align-items:center" data-drawer-actions>${actions}
          <button class="icon-btn" data-close aria-label="Đóng">${icon("x")}</button>
        </div>
      </header>
      <div class="drawer__body" data-drawer-body>${body}</div>
    </section>`);
  const [scrim, panel] = nodes;
  const layer = makeLayer({ nodes, panel, modal: true, onClose, restore });
  scrim.addEventListener("click", () => layer.close("scrim"));
  panel.querySelector("[data-close]").addEventListener("click", () => layer.close("button"));
  layer.body = panel.querySelector("[data-drawer-body]");
  layer.head = panel.querySelector("[data-drawer-title]");
  layer.actions = panel.querySelector("[data-drawer-actions]");
  requestAnimationFrame(() => {
    const first = panel.querySelector("[data-autofocus]") || panel.querySelector("[data-close]");
    if (first) first.focus({ preventScroll: true });
  });
  return layer;
}

/** Lớp phủ tuỳ biến (command palette, bảng phím tắt): scrim + một panel, giữ focus, Esc để đóng. */
export function openModal(markup, { onClose } = {}) {
  const restore = document.activeElement;
  const nodes = mount(html`<div class="scrim" data-scrim></div>${markup}`);
  const [scrim, panel] = nodes;
  const layer = makeLayer({ nodes, panel, modal: true, onClose, restore });
  scrim.addEventListener("click", () => layer.close("scrim"));
  return layer;
}

/** Hộp thoại xác nhận. Trả Promise<boolean>. */
export function confirmDialog({ title, body, confirm = "Đồng ý", cancel = "Huỷ", danger = false }) {
  return new Promise((resolve) => {
    const restore = document.activeElement;
    const nodes = mount(html`
      <div class="scrim" data-scrim></div>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-body">
        <h2 id="dlg-title">${title}</h2>
        <p id="dlg-body">${body}</p>
        <div class="dialog__actions">
          <button class="btn btn--ghost" data-no>${cancel}</button>
          <button class="btn ${danger ? "btn--primary" : "btn--primary"}" data-yes>${confirm}</button>
        </div>
      </div>`);
    const [scrim, panel] = nodes;
    let answered = false;
    const layer = makeLayer({ nodes, panel, modal: true, restore, onClose: () => { if (!answered) resolve(false); } });
    const answer = (v) => { answered = true; resolve(v); layer.close("answer"); };
    scrim.addEventListener("click", () => answer(false));
    panel.querySelector("[data-no]").addEventListener("click", () => answer(false));
    panel.querySelector("[data-yes]").addEventListener("click", () => answer(true));
    requestAnimationFrame(() => panel.querySelector("[data-no]").focus());
  });
}

/** Popover gắn vào một phần tử (menu, trích dẫn). Không chặn nền. */
export function openPopover(anchor, markup, { cls = "", label = "", onClose } = {}) {
  closePopovers();
  const restore = document.activeElement;
  const nodes = mount(html`<div class="popover ${cls}" role="dialog" aria-label="${label}">${markup}</div>`);
  const [panel] = nodes;
  const layer = makeLayer({ nodes, panel, modal: false, onClose, restore });
  layer.popover = true;
  position(panel, anchor);
  const away = (e) => { if (!panel.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) layer.close("away"); };
  setTimeout(() => document.addEventListener("pointerdown", away), 0);
  const origClose = layer.close;
  layer.close = (r) => { document.removeEventListener("pointerdown", away); origClose(r); };
  requestAnimationFrame(() => { const f = focusables(panel)[0]; if (f) f.focus({ preventScroll: true }); });
  return layer;
}

function position(panel, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = r.left;
  if (left + w > vw - 12) left = r.right - w;
  left = Math.max(12, Math.min(left, vw - w - 12));
  let top = r.bottom + 8;
  if (top + h > vh - 12) top = Math.max(12, r.top - h - 8);
  panel.style.left = left + "px";
  panel.style.top = top + "px";
}

export function closePopovers() {
  stack.filter((l) => l.popover).forEach((l) => l.close("replace"));
}

export function closeTop() {
  const top = stack[stack.length - 1];
  if (top) { top.close("escape"); return true; }
  return false;
}

export const hasLayers = () => stack.length > 0;

/** Toast ngắn, có thể kèm một hành động (vd "Hoàn tác", "Mở"). */
export function toast(message, { actionLabel, onAction, timeout = 4200, kind = "info" } = {}) {
  const host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast";
  render(el, html`${icon(kind === "ok" ? "check" : kind === "warn" ? "alert" : "info")}<span>${message}</span>${actionLabel ? html`<button type="button">${actionLabel}</button>` : ""}`);
  host.appendChild(el);
  const remove = () => {
    if (!el.isConnected) return;
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 200);
  };
  if (actionLabel && onAction) el.querySelector("button").addEventListener("click", () => { onAction(); remove(); });
  setTimeout(remove, timeout);
  while (host.children.length > 3) host.firstElementChild.remove();
}
