// Command palette (⌘K / Ctrl+K): tìm sản phẩm theo tên / hãng / ASIN, điều hướng, chạy lệnh, chạy kịch bản demo,
// hoặc gửi thẳng câu đang gõ cho agent. Bàn phím: ↑ ↓ chọn · ↵ chạy · esc đóng.
import { html, raw, render, esc } from "./util.js";
import { icon, categoryIcon } from "./icons.js";
import * as fmt from "./fmt.js";
import { api } from "./api.js";
import { openModal } from "./layers.js";
import { SCENARIOS } from "./scenarios.js";

let allProducts = null;
let layer = null;

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

/** Điểm khớp đơn giản: chuỗi con liền (cao) > khớp đầu từ > khớp rải rác (subsequence). */
function score(hay, q) {
  if (!q) return 1;
  const h = norm(hay);
  const n = norm(q).trim();
  if (!n) return 1;
  const i = h.indexOf(n);
  if (i >= 0) return 100 - Math.min(i, 60) + (i === 0 || h[i - 1] === " " ? 20 : 0);
  let j = 0;
  for (const ch of h) if (ch === n[j]) j++;
  return j === n.length ? 10 : 0;
}

function mark(label, q) {
  const n = norm(q).trim();
  if (!n) return esc(label);
  const i = norm(label).indexOf(n);
  if (i < 0) return esc(label);
  return esc(label.slice(0, i)) + "<mark>" + esc(label.slice(i, i + n.length)) + "</mark>" + esc(label.slice(i + n.length));
}

async function ensureProducts() {
  if (allProducts) return allProducts;
  try {
    const r = await api.catalog({});
    api.remember(r.items);
    allProducts = r.items;
  } catch (e) {
    allProducts = [];
  }
  return allProducts;
}

function buildItems(q, ctx) {
  const items = [];
  const add = (group, it) => items.push({ group, ...it });
  const t = q.trim();
  if (t) {
    add("agent", { icon: "terminal", label: `Hỏi agent: “${t}”`, hint: "↵", run: () => ctx.ask(t), score: 1000 });
    add("agent", { icon: "filter", label: `Lọc danh mục theo “${t}”`, hint: "/", run: () => ctx.filter(t), score: 999 });
  }
  for (const p of allProducts || []) {
    const hay = `${p.brand} ${p.model} ${p.id} ${p.title}`;
    const sc = score(hay, t);
    if (!t || sc > 0) {
      add("sản phẩm", {
        icon: categoryIcon(p.category), label: `${p.brand} ${p.model}`, sub: `${p.id} · ${p.title}`,
        hint: p.price_vnd != null ? fmt.vndShort(p.price_vnd).replace(" ", "") : "null",
        run: () => ctx.openProduct(p.id), score: sc, q: t,
      });
    }
  }
  const nav = [
    { icon: "grid", label: "Đi tới: Danh mục", hint: "g d", run: () => ctx.go("#/") },
    { icon: "report", label: "Đi tới: Báo cáo", hint: "g r", run: () => ctx.go("#/bao-cao") },
    { icon: "columns", label: "Đi tới: So sánh (diff)", hint: "g s", run: () => ctx.go("#/so-sanh") },
    { icon: "headphones", label: "Ngành: Tai nghe", hint: "1", run: () => ctx.category("headphones") },
    { icon: "mouse", label: "Ngành: Chuột", hint: "2", run: () => ctx.category("mouse") },
    { icon: "keyboard", label: "Ngành: Bàn phím", hint: "3", run: () => ctx.category("keyboard") },
  ];
  const cmds = [
    { icon: "terminal", label: "Mở agent", hint: "", run: () => ctx.ask("") },
    { icon: ctx.dark ? "sun" : "moon", label: ctx.dark ? "Giao diện sáng (datasheet in)" : "Giao diện tối", hint: "", run: ctx.theme },
    { icon: "list", label: ctx.table ? "Xem dạng lưới" : "Xem dạng bảng", hint: "", run: ctx.toggleView },
    { icon: "keyboardkey", label: "Phím tắt", hint: "?", run: ctx.shortcuts },
    { icon: "rotate", label: "Bắt đầu phiên mới", hint: "", run: ctx.newSession },
  ];
  nav.forEach((it) => { const sc = score(it.label, t); if (!t || sc > 0) add("đi tới", { ...it, score: sc, q: t }); });
  cmds.forEach((it) => { const sc = score(it.label, t); if (!t || sc > 0) add("lệnh", { ...it, score: sc, q: t }); });
  SCENARIOS.forEach((s) => {
    const label = `Demo: ${s.label}`;
    const sc = score(label + " " + s.st + " " + s.user, t);
    if (!t || sc > 0) add("demo (không phải AI)", { icon: "activity", label, sub: s.user, hint: s.st, run: () => ctx.scenario(s.key), score: sc, q: t });
  });
  // giữ nhóm theo thứ tự xuất hiện; trong nhóm sản phẩm xếp theo điểm khớp, tối đa 8
  const groups = [];
  for (const it of items) {
    let g = groups.find((x) => x.name === it.group);
    if (!g) groups.push((g = { name: it.group, items: [] }));
    g.items.push(it);
  }
  for (const g of groups) {
    if (g.name === "sản phẩm") g.items = g.items.sort((a, b) => b.score - a.score).slice(0, t ? 8 : 6);
  }
  return groups;
}

export async function openPalette(ctx, initial = "") {
  if (layer && !layer.closed) { layer.panel.querySelector("input").focus(); return; }
  let groups = [];
  let flat = [];
  let sel = 0;
  layer = openModal(html`<div class="palette" role="dialog" aria-modal="true" aria-label="Bảng lệnh">
      <div class="palette__bar"><span class="prompt" aria-hidden="true">›</span>
        <input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-label="Tìm sản phẩm hoặc lệnh" placeholder="tìm sản phẩm, ASIN, lệnh… hoặc gõ câu hỏi cho agent" value="${initial}" autocomplete="off" spellcheck="false">
        <kbd>esc</kbd></div>
      <div class="palette__list" id="palette-list" role="listbox" aria-label="Kết quả"></div>
      <div class="palette__foot"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>↵</kbd> chạy</span><span><kbd>esc</kbd> đóng</span><span style="margin-left:auto">catalog + lệnh + demo</span></div>
    </div>`, { onClose: () => { layer = null; } });
  const input = layer.panel.querySelector("input");
  const list = layer.panel.querySelector(".palette__list");

  const draw = () => {
    flat = groups.flatMap((g) => g.items);
    if (sel >= flat.length) sel = Math.max(0, flat.length - 1);
    let k = -1;
    render(list, flat.length ? groups.map((g) => html`<div role="presentation"><p class="palette__group kicker">${g.name}</p>
      ${g.items.map((it) => { k++; return html`<div class="palette__item" role="option" id="pal-${k}" data-k="${k}" aria-selected="${k === sel ? "true" : "false"}">
        ${icon(it.icon || "arrow-right")}<span style="min-width:0"><span class="lbl">${raw(mark(it.label, it.q || ""))}</span>${it.sub ? html`<span class="sub">${it.sub}</span>` : ""}</span><span class="hint">${it.hint || ""}</span></div>`; })}</div>`)
      : html`<p class="palette__empty">0 kết quả · ↵ để hỏi agent</p>`);
    input.setAttribute("aria-activedescendant", flat.length ? `pal-${sel}` : "");
    const cur = list.querySelector('[aria-selected="true"]');
    if (cur) cur.scrollIntoView({ block: "nearest" });
  };
  const refresh = () => { groups = buildItems(input.value, ctx); sel = 0; draw(); };
  const run = (i) => {
    const it = flat[i];
    if (!it) { if (input.value.trim()) { layer.close("run"); ctx.ask(input.value.trim()); } return; }
    layer.close("run");
    setTimeout(() => it.run(), 0);
  };

  input.addEventListener("input", refresh);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(flat.length - 1, sel + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === "Enter") { e.preventDefault(); run(sel); }
  });
  list.addEventListener("mousemove", (e) => {
    const el = e.target.closest("[data-k]");
    if (el && Number(el.dataset.k) !== sel) { sel = Number(el.dataset.k); draw(); }
  });
  list.addEventListener("click", (e) => {
    const el = e.target.closest("[data-k]");
    if (el) run(Number(el.dataset.k));
  });
  refresh();
  requestAnimationFrame(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
  await ensureProducts();
  if (layer && !layer.closed) refresh();
}

export function invalidatePalette() {
  allProducts = null;
}
