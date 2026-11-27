// Khởi động app: định tuyến (#/…), uỷ quyền sự kiện (data-action / data-change / data-submit), phím tắt, đồng bộ các vùng.
import { state, on, emit, save, resetSession, latestReport } from "./store.js";
import { api } from "./api.js";
import { html, render, $, debounce, announce } from "./util.js";
import { icon } from "./icons.js";
import * as fmt from "./fmt.js";
import { openDrawer, openPopover, openModal, closePopovers, closeTop, confirmDialog, toast, hasLayers } from "./layers.js";
import {
  mountCatalog, updateCatalog, loadCatalog, filtersHtml, setCategory, applyFilters, setPrice, presetPrice, sortByColumn, setViewMode,
} from "./views/catalog.js";
import { openProduct, currentProduct, refreshProductActions, evidenceCard, copyJson } from "./views/product.js";
import { mountCompare, renderCompare, toggleCompare, trayHtml } from "./views/compare.js";
import { mountReport } from "./views/report.js";
import {
  mountAgent, updateAgent, updateScope, updateHead, updateThread, focusComposer, openAgent, closeAgent, playScenario, reply,
  chooseChange, retryLast, removeCriterion, rerun, askAboutProduct, askCompare, resetScope, clearThread, agentMenu, send,
} from "./views/agent.js";
import { openTrace } from "./views/trace.js";
import { openPalette } from "./palette.js";

const stage = () => document.getElementById("main");
const mqTablet = matchMedia("(max-width: 1100px)");
const mqMobile = matchMedia("(max-width: 767px)");
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const CATS = ["headphones", "mouse", "keyboard"];
let filtersLayer = null;
let lastViewHash = "#/";
let productFromApp = false;
let prevHash = location.hash;
let gPending = 0;

/* ───────── Định tuyến ───────── */
const VIEW_ROUTES = { "": "catalog", "danh-muc": "catalog", "bao-cao": "report", "so-sanh": "compare", "tro-ly": "agent" };
const VIEW_NAMES = { catalog: "Danh mục", report: "Báo cáo", compare: "So sánh" };

function parse(hash = location.hash) {
  const h = hash.replace(/^#\/?/, "");
  const [seg, arg] = h.split("/");
  if (seg === "sp" && arg) return { product: decodeURIComponent(arg) };
  return { view: VIEW_ROUTES[seg] ?? "catalog" };
}

function onHash() {
  const was = parse(prevHash);
  const now = parse();
  productFromApp = !!(now.product && !was.product);
  prevHash = location.hash;
  route();
}

function route() {
  const r = parse();
  if (r.product) {
    if (state.agentOpen && mqMobile.matches) closeAgent();
    openProduct(r.product, { onClose: (reason) => { if (reason !== "route" && reason !== "replace") leaveProduct(); } });
    if (!stage().childElementCount) setView("catalog", { quiet: true });
    return;
  }
  const cur = currentProduct();
  if (cur) cur.layer.close("route");
  if (r.view === "agent") {
    if (!stage().childElementCount) setView(state.view || "catalog", { quiet: true });
    focusComposer();
    if (!mqTablet.matches) history.replaceState(null, "", lastViewHash);
    return;
  }
  if (state.agentOpen && mqMobile.matches) closeAgent();
  lastViewHash = location.hash || "#/";
  setView(r.view);
}

function leaveProduct() {
  if (productFromApp && history.length > 1) { productFromApp = false; history.back(); }
  else location.replace(lastViewHash || "#/");
}

function setView(view, { quiet = false } = {}) {
  const changed = state.view !== view || !stage().childElementCount;
  state.view = view;
  document.getElementById("workspace").dataset.view = view;
  if (changed) {
    delete stage().dataset.report;
    if (view === "report") mountReport(stage());
    else if (view === "compare") mountCompare(stage());
    else mountCatalog(stage());
    if (!quiet) {
      window.scrollTo({ top: 0 });
      stage().focus({ preventScroll: true });
      announce(VIEW_NAMES[view] || "");
    }
  }
  renderChrome();
}

/* ───────── Vùng cố định ───────── */
function renderChrome() {
  const rep = latestReport();
  const cur = (v) => (state.view === v && !(state.agentOpen && mqMobile.matches) ? html`aria-current="page"` : "");
  render($("#views"), html`
    <a href="#/" ${cur("catalog")}><span class="n">01</span>Danh mục</a>
    <a href="#/bao-cao" ${cur("report")}><span class="n">02</span>Báo cáo${rep ? html`<span class="badge badge--dot" title="Có báo cáo"></span><span class="visually-hidden">(có báo cáo)</span>` : ""}</a>
    <a href="#/so-sanh" ${cur("compare")}><span class="n">03</span>So sánh${state.compare.length ? html`<span class="badge">${state.compare.length}</span><span class="visually-hidden">sản phẩm</span>` : ""}</a>`);
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  render($("#tools"), html`
    <button class="btn btn--quiet btn--sm session-btn" data-action="session-menu" aria-haspopup="dialog" aria-label="Phiên ẩn danh ${state.session.id}">${icon("clock", { size: 14 })}<span class="lbl">${state.session.id}</span></button>
    <button class="icon-btn" data-action="shortcuts" aria-label="Phím tắt" title="Phím tắt (?)">${icon("keyboardkey")}</button>
    <button class="icon-btn" data-action="toggle-theme" aria-label="${dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}">${icon(dark ? "sun" : "moon")}</button>
    <button class="btn btn--sm btn--pen agent-toggle" data-action="toggle-agent" aria-expanded="${state.agentOpen ? "true" : "false"}" aria-controls="agent">${icon("terminal", { size: 14 })} Agent</button>`);
  const agentOn = state.agentOpen && mqMobile.matches;
  const tcur = (v) => (!agentOn && state.view === v ? html`aria-current="page"` : "");
  render($("#tabbar"), html`
    <a href="#/" ${tcur("catalog")}>${icon("grid")}Catalog</a>
    <a href="#/tro-ly" ${agentOn ? html`aria-current="page"` : ""} data-action="tab-agent">${icon("terminal")}Agent</a>
    <a href="#/bao-cao" ${tcur("report")}>${icon("report")}Report${rep ? html`<span class="badge badge--dot"></span>` : ""}</a>
    <a href="#/so-sanh" ${tcur("compare")}>${icon("columns")}Diff${state.compare.length ? html`<span class="badge">${state.compare.length}</span>` : ""}</a>`);
  const tray = state.view === "catalog" && !(state.agentOpen && mqMobile.matches) ? trayHtml() : "";
  render($("#tray-root"), tray);
  document.body.classList.toggle("has-tray", !!(tray && tray.s));
}

function renderFilters() {
  const docked = $("#filters");
  if (docked) render(docked, filtersHtml("f"));
  if (filtersLayer && !filtersLayer.closed) {
    const holder = filtersLayer.body.querySelector("[data-filters]");
    if (holder) render(holder, filtersHtml("fd"));
  }
}

function openFiltersDrawer() {
  filtersLayer = openDrawer({
    label: "Bộ lọc", kicker: "// filters", side: "left",
    body: html`<div class="filters" data-filters>${filtersHtml("fd")}</div>`,
    onClose: () => { filtersLayer = null; },
  });
}

function syncAgentOpen() {
  const app = $("#app");
  app.classList.toggle("agent-open", state.agentOpen);
  let scrim = $(".agent-scrim");
  if (state.agentOpen && mqTablet.matches && !mqMobile.matches) {
    if (!scrim) {
      scrim = document.createElement("div");
      scrim.className = "agent-scrim";
      scrim.addEventListener("click", () => closeAgent());
      app.appendChild(scrim);
    }
  } else if (scrim) scrim.remove();
  if (state.agentOpen && mqTablet.matches) requestAnimationFrame(() => { const t = $("#ask-input"); if (t) t.focus({ preventScroll: true }); });
  renderChrome();
}

/* ───────── Giao diện sáng / tối ───────── */
function toggleTheme() {
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  const next = dark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("smartbuy.theme", next); } catch (e) { /* bỏ qua */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? "#0A0B0D" : "#F3F4F6");
  renderChrome();
  announce(next === "dark" ? "Đã chuyển sang giao diện tối" : "Đã chuyển sang giao diện sáng");
}

/* ───────── Phiên ───────── */
async function newSession() {
  closePopovers();
  const ok = await confirmDialog({
    title: "Bắt đầu phiên mới?",
    body: "Context, hội thoại, báo cáo và danh sách so sánh của phiên này sẽ bị xoá. Phiên mới không kế thừa sở thích cũ (BR-CTX-09).",
    confirm: "Bắt đầu phiên mới",
    cancel: "Ở lại",
  });
  if (!ok) return;
  resetSession();
  const q = $("#q");
  if (q) q.value = "";
  location.hash = "#/";
  emit("agent", "compare", "filters", "report-data");
  updateAgent();
  loadCatalog();
  toast("Đã bắt đầu phiên mới.", { kind: "ok" });
}

function sessionMenu(anchor) {
  openPopover(anchor, html`<div class="menu" role="menu">
    <p class="kicker" style="padding:6px 10px 0">session · anonymous</p>
    <p style="padding:2px 10px 4px;font:600 15px var(--font-mono)">${state.session.id}</p>
    <p class="muted">Bắt đầu ${fmt.clock(state.session.startedAt)} · không cần đăng nhập · chỉ lưu trên trình duyệt này.</p>
    <hr>
    <button role="menuitem" data-action="new-session">${icon("rotate", { size: 15 })} Bắt đầu phiên mới</button>
  </div>`, { label: "Phiên ẩn danh" });
}

function explainData(anchor) {
  const meta = (state.catalog.data && state.catalog.data.catalog) || (state.health && state.health.catalog) || {};
  const ds = meta.dataset || {};
  openPopover(anchor, html`<div class="popover__head"><span class="kicker" style="color:var(--warn)">demo data</span><button class="icon-btn icon-btn--sm" data-action="close-layer" aria-label="Đóng">${icon("x", { size: 15 })}</button></div>
    <p style="font-size:13.5px;color:var(--text-2);margin-bottom:10px">${meta.note || "Catalog minh họa."}</p>
    <dl class="kv"><dt>schema</dt><dd class="mono">${meta.schema || "—"}</dd><dt>dataset</dt><dd class="mono">${ds.dataset || "—"}</dd>
    <dt>subset</dt><dd class="mono">${ds.subset || "—"}</dd><dt>file</dt><dd class="mono">${meta.source || "—"}</dd><dt>version</dt><dd class="mono">${meta.version || "—"}</dd>
    <dt>fx</dt><dd>${meta.fx && meta.fx.usd_vnd ? `${fmt.int(meta.fx.usd_vnd)}₫/USD ${meta.fx.source || ""}` : "—"}</dd></dl>
    <p class="muted mono" style="font-size:11.5px;margin-top:10px">Dữ liệu thật: python codebase/build_catalog.py --meta … --reviews …</p>`, { label: "Giải thích dữ liệu demo" });
}

function openShortcuts() {
  const mod = isMac ? "⌘" : "Ctrl";
  const row = (label, keys) => html`<div><span>${label}</span><span>${keys.map((k) => html`<kbd>${k}</kbd>`)}</span></div>`;
  const layer = openModal(html`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sc-title">
    <h2 id="sc-title">Phím tắt</h2>
    <div class="shortcuts">
      ${row("Bảng lệnh: tìm sản phẩm, lệnh, hỏi agent", [mod, "K"])}
      ${row("Lọc danh mục", ["/"])}
      ${row("Đổi ngành: tai nghe · chuột · bàn phím", ["1", "2", "3"])}
      ${row("Đi tới Danh mục / Báo cáo / So sánh", ["g", "d·r·s"])}
      ${row("Gửi cho agent · xuống dòng", ["↵", "⇧↵"])}
      ${row("Đóng lớp phủ", ["esc"])}
      ${row("Mở bảng này", ["?"])}
    </div>
    <div class="dialog__actions"><button class="btn btn--primary" data-close-dialog>Đóng</button></div>
  </div>`);
  const btn = layer.panel.querySelector("[data-close-dialog]");
  btn.addEventListener("click", () => layer.close("button"));
  requestAnimationFrame(() => btn.focus());
}

function paletteCtx() {
  return {
    dark: document.documentElement.getAttribute("data-theme") !== "light",
    table: state.catalogView === "table",
    ask: (t) => {
      const cur = currentProduct();
      if (cur) cur.layer.close("route");
      if (t && !state.busy) { openAgent(); send(t); } else focusComposer(t || undefined);
    },
    filter: (t) => { const q = $("#q"); if (q) q.value = t; state.filters.q = t; if (state.view !== "catalog") location.hash = "#/"; applyFilters(); },
    openProduct: (id) => { location.hash = `#/sp/${id}`; },
    go: (h) => { location.hash = h; },
    category: (c) => { if (state.view !== "catalog") location.hash = "#/"; setCategory(c); },
    theme: toggleTheme,
    toggleView: () => { if (state.view !== "catalog") location.hash = "#/"; setViewMode(state.catalogView === "table" ? "grid" : "table"); },
    shortcuts: openShortcuts,
    newSession,
    scenario: (k) => playScenario(k),
  };
}

/* ───────── Trích dẫn nguồn ───────── */
async function openCite(el) {
  const { pid, ev } = el.dataset;
  const cur = currentProduct();
  if (cur && cur.id === pid && !cur.layer.closed) {
    const { flashEvidence } = await import("./views/product.js");
    flashEvidence(ev);
    return;
  }
  const pop = openPopover(el, html`<div class="skel" style="height:90px"></div>`, { label: `Nguồn ${ev}` });
  try {
    const card = await evidenceCard(pid, ev);
    if (!pop.closed) render(pop.panel, card);
  } catch (e) {
    if (!pop.closed) render(pop.panel, html`<p class="muted">Không tải được nguồn: ${e.message}</p>`);
  }
}

/* ───────── Hành động (data-action) ───────── */
const actions = {
  "set-category": (el) => { setCategory(el.dataset.cat); },
  "focus-agent": () => { const cur = currentProduct(); if (cur) cur.layer.close("route"); focusComposer(); },
  "explain-data": (el) => explainData(el),
  "toggle-compare": (el) => toggleCompare(el.dataset.id),
  "ask-product": (el) => {
    const cur = currentProduct();
    if (cur && !cur.layer.closed) cur.layer.close("button");
    setTimeout(() => askAboutProduct(el.dataset.id), cur ? 220 : 0);
  },
  "ask-filtered": () => {
    resetScope();
    const d = state.catalog.data;
    focusComposer(`Mình cần ${state.category === "mouse" ? "chuột" : state.category === "keyboard" ? "bàn phím" : "tai nghe"}${state.filters.maxVnd ? " dưới " + fmt.vndShort(state.filters.maxVnd) : ""} — hiện ${d ? d.total : 0} mẫu khớp bộ lọc, gợi ý phương án gần nhất giúp mình.`);
  },
  "clear-q": () => { state.filters.q = ""; const q = $("#q"); if (q) q.value = ""; applyFilters(); },
  "clear-price": () => { state.filters.minVnd = null; state.filters.maxVnd = null; state.priceError = null; applyFilters(); },
  "toggle-brand": (el) => { const b = el.dataset.brand; state.filters.brands = state.filters.brands.filter((x) => x !== b); applyFilters(); },
  "clear-rating": () => { state.filters.minRating = null; applyFilters(); },
  "toggle-attr": (el) => { const { key, val } = el.dataset; state.filters.attrs[key] = (state.filters.attrs[key] || []).filter((x) => x !== val); applyFilters(); },
  "clear-filters": () => { const sort = state.filters.sort; state.filters = { q: "", minVnd: null, maxVnd: null, brands: [], minRating: null, attrs: {}, sort }; state.priceError = null; const q = $("#q"); if (q) q.value = ""; applyFilters(); },
  "price-preset": (el) => presetPrice(Number(el.dataset.i)),
  "set-rating": (el) => { state.filters.minRating = el.dataset.v ? Number(el.dataset.v) : null; applyFilters(); },
  "set-view-mode": (el) => setViewMode(el.dataset.mode),
  "sort-col": (el) => sortByColumn(el.dataset.sort),
  "open-filters": () => openFiltersDrawer(),
  "close-layer": () => closeTop(),
  "reload-catalog": () => loadCatalog(),
  "open-product": (el) => { closePopovers(); location.hash = `#/sp/${el.dataset.id}`; },
  "cite": (el) => openCite(el),
  "open-evidence": (el, e) => {
    e.preventDefault();
    const { pid, ev } = el.dataset;
    closePopovers();
    productFromApp = true;
    prevHash = `#/sp/${pid}`;
    history.pushState(null, "", `#/sp/${pid}`);
    openProduct(pid, { focusEvidence: ev, onClose: (reason) => { if (reason !== "route" && reason !== "replace") leaveProduct(); } });
  },
  "gallery-pick": (el) => {
    const gal = el.closest(".gallery");
    const img = gal && gal.querySelector(":scope > .plate img");
    if (img) img.src = el.dataset.src;
    if (gal) gal.querySelectorAll(".gallery__thumbs button").forEach((b) => b.setAttribute("aria-pressed", b === el ? "true" : "false"));
  },
  "copy-json": (el) => copyJson(el.dataset.id),
  "need-more": (el, e) => { e.preventDefault(); toast("Chọn thêm ít nhất 1 sản phẩm cùng ngành để so sánh."); },
  "clear-compare": () => { state.compare = []; save(); emit("compare"); },
  "reload-compare": () => mountCompare(stage()),
  "ask-compare": (el) => askCompare(el.dataset.names),
  "reload-report": () => mountReport(stage()),
  "compare-recs": (el) => {
    const ids = (el.dataset.ids || "").split(",").filter(Boolean).slice(0, 3);
    if (ids.length < 2) { toast("Cần ít nhất 2 lựa chọn để so sánh."); return; }
    state.compare = ids; save(); emit("compare");
    if (state.agentOpen && mqTablet.matches) closeAgent();
    location.hash = "#/so-sanh";
  },
  "open-report": (el) => {
    const focusId = el.dataset.focus;
    if (state.agentOpen && mqTablet.matches) closeAgent();
    if (state.view === "report" && location.hash === "#/bao-cao") mountReport(stage(), { focusId });
    else { location.hash = "#/bao-cao"; if (focusId) setTimeout(() => mountReport(stage(), { focusId }), 30); }
  },
  "rerun": () => rerun(),
  "reply": (el) => reply(el.dataset.text, el.dataset.next),
  "play-scenario": (el) => playScenario(el.dataset.key),
  "choose-change": (el) => chooseChange(el.dataset.msg, el.dataset.key),
  "retry-last": () => retryLast(),
  "browse-catalog": () => { if (state.agentOpen && mqTablet.matches) closeAgent(); location.hash = "#/"; },
  "browse-bt": () => {
    if (state.agentOpen && mqTablet.matches) closeAgent();
    if (state.category !== "headphones") setCategory("headphones");
    state.filters.attrs = { ...state.filters.attrs, connectivity: ["bluetooth"] };
    applyFilters();
    location.hash = "#/";
  },
  "ctx-remove": (el) => removeCriterion(el.dataset.kind, Number(el.dataset.idx)),
  "scope-reset": () => resetScope(),
  "open-trace": (el) => { closePopovers(); openTrace(el.dataset.msg); },
  "agent-menu": (el) => agentMenu(el),
  "close-agent": () => { closeAgent(); if (parse().view === "agent") location.replace(lastViewHash); },
  "toggle-agent": () => (state.agentOpen ? closeAgent() : openAgent()),
  "tab-agent": (el, e) => { e.preventDefault(); if (state.agentOpen) closeAgent(); else openAgent(); },
  "clear-thread": () => { closePopovers(); clearThread(); updateAgent(); },
  "new-session": () => newSession(),
  "session-menu": (el) => sessionMenu(el),
  "toggle-theme": () => toggleTheme(),
  "shortcuts": () => openShortcuts(),
  "open-palette": () => openPalette(paletteCtx()),
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled || (el.getAttribute("aria-disabled") === "true" && el.dataset.action !== "need-more")) return;
  // Hàng bảng bấm được, nhưng liên kết / nút bên trong tự xử lý.
  if (el.tagName === "TR" && e.target.closest("a, button, input, label")) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  const passHref = el.tagName === "A" && !["need-more", "open-evidence", "tab-agent"].includes(el.dataset.action);
  if (!passHref && (el.tagName === "BUTTON" || el.tagName === "A")) e.preventDefault();
  fn(el, e);
});

document.addEventListener("change", (e) => {
  const el = e.target;
  const form = el.closest('form[data-submit="price"]');
  if (form) { setPrice(form.elements.min.value, form.elements.max.value); return; }
  const kind = el.dataset.change;
  if (kind === "sort") { state.filters.sort = el.value; applyFilters(); }
  else if (kind === "brand") {
    const set = new Set(state.filters.brands);
    if (el.checked) set.add(el.value); else set.delete(el.value);
    state.filters.brands = [...set];
    applyFilters();
  } else if (kind === "attr") {
    const key = el.dataset.key;
    const set = new Set(state.filters.attrs[key] || []);
    if (el.checked) set.add(el.value); else set.delete(el.value);
    state.filters.attrs = { ...state.filters.attrs, [key]: [...set] };
    applyFilters();
  } else if (kind === "diff-only") {
    state.diffOnly = el.checked;
    renderCompare(stage());
    announce(el.checked ? "Chỉ hiện các hàng khác nhau" : "Hiện tất cả các hàng");
  }
});

document.addEventListener("submit", (e) => {
  const form = e.target;
  const kind = form.dataset.submit;
  if (!kind) return;
  e.preventDefault();
  if (kind === "price") setPrice(form.elements.min.value, form.elements.max.value);
  else if (kind === "ask") import("./views/agent.js").then((m) => m.submitComposer());
});

document.addEventListener("keydown", (e) => {
  const a = document.activeElement;
  const typing = !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    openPalette(paletteCtx());
    return;
  }
  if (e.key === "Escape") {
    if (closeTop()) { e.preventDefault(); return; }
    if (state.agentOpen && mqTablet.matches) { closeAgent(); e.preventDefault(); return; }
    if (a && a.id === "q" && state.filters.q) actions["clear-q"]();
    return;
  }
  if (typing || hasLayers() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); const q = $("#q"); if (q) q.focus(); return; }
  if (e.key === "?") { e.preventDefault(); openShortcuts(); return; }
  if (["1", "2", "3"].includes(e.key)) {
    if (state.view !== "catalog") location.hash = "#/";
    setCategory(CATS[Number(e.key) - 1]);
    return;
  }
  if (e.key === "g") { gPending = Date.now(); return; }
  if (gPending && Date.now() - gPending < 1000) {
    gPending = 0;
    const to = { d: "#/", r: "#/bao-cao", s: "#/so-sanh" }[e.key];
    if (to) { e.preventDefault(); location.hash = to; }
  }
});

/* Ô lọc trên thanh trên cùng */
const searchNow = () => {
  const v = $("#q").value.trim();
  if (v === state.filters.q) return;
  state.filters.q = v;
  if (state.view !== "catalog") location.hash = "#/";
  applyFilters();
};
$("#q").addEventListener("input", debounce(searchNow, 260));
$("#search-form").addEventListener("submit", (e) => { e.preventDefault(); e.stopPropagation(); searchNow(); });

/* ───────── Đồng bộ khi trạng thái đổi ───────── */
on("catalog", () => {
  if (state.view === "catalog") updateCatalog();
  renderFilters();
  updateScope();
  renderChrome();
});
on("filters", () => {
  if (state.view === "catalog") updateCatalog();
  renderFilters();
});
on("compare", () => {
  renderChrome();
  if (state.view === "catalog") updateCatalog();
  if (state.view === "compare") mountCompare(stage());
  if (state.view === "report") mountReport(stage());
  refreshProductActions();
  updateScope();
  const missing = state.compare.filter((id) => !api.cached(id));
  if (missing.length) api.products(missing).then(renderChrome).catch(() => {});
});
on("agent", () => { updateAgent(); renderChrome(); });
on("report-data", () => { if (state.view === "report") mountReport(stage()); });
on("agent-open", syncAgentOpen);
on("health", () => {
  updateHead();
  updateThread();
  if (state.view === "catalog") updateCatalog();
});
mqTablet.addEventListener("change", syncAgentOpen);
mqMobile.addEventListener("change", syncAgentOpen);

async function loadHealth(retry = true) {
  try {
    state.health = await api.health();
    state.healthError = null;
  } catch (e) {
    state.healthError = e;
    if (retry) setTimeout(() => loadHealth(false), 4000);
  }
  emit("health");
}

/* ───────── Khởi động ───────── */
function boot() {
  document.querySelectorAll("kbd[data-mod]").forEach((k) => { k.textContent = isMac ? "⌘" : "Ctrl"; });
  mountAgent($("#agent"));
  const q = $("#q");
  if (q) q.value = state.filters.q || "";
  window.addEventListener("hashchange", onHash);
  route();
  renderFilters();
  loadCatalog();
  loadHealth();
  const ids = new Set(state.compare);
  state.agent.thread.forEach((m) => ((m.payload && m.payload.recommendations) || []).forEach((r) => ids.add(r.id)));
  if (ids.size) api.products([...ids]).then(() => { renderChrome(); updateThread(); }).catch(() => {});
  if (state.restored && state.agent.thread.length) {
    toast("Đã khôi phục phiên trước — context và hội thoại vẫn còn.", { actionLabel: "phiên mới", onAction: newSession, timeout: 6000 });
  }
  updateThread({ scroll: "bottom" });
}

boot();
