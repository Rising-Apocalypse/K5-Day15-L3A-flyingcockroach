// UC-02 — Duyệt, tìm kiếm, lọc & sắp xếp. Không gọi AI: vẫn dùng được khi trợ lý lỗi (AC-CAT-01, BR-ST-07).
import { state, emit, save, DEFAULT_FILTERS, activeFilterCount } from "../store.js";
import { api } from "../api.js";
import { html, render, announce } from "../util.js";
import { icon } from "../icons.js";
import { plate } from "../plates.js";
import * as fmt from "../fmt.js";
import { priceBlock, stars, specToken, segm, CARD_KEYS, SHORT, ledFor, attrLabel, catLabel, fxInfo, emptyState, errorNotice } from "../parts.js";

let seq = 0;
let lastGridKey = "";

const PRESETS = [
  { label: "<500k", min: null, max: 500000 },
  { label: "500k–1tr", min: 500000, max: 1000000 },
  { label: "1–2tr", min: 1000000, max: 2000000 },
  { label: ">2tr", min: 2000000, max: null },
];
const SORTS = [
  ["relevance", "sort: Q (Bayes)"],
  ["price_asc", "sort: giá ↑"],
  ["price_desc", "sort: giá ↓"],
  ["rating", "sort: sao ↓"],
  ["reviews", "sort: lượt đánh giá ↓"],
];
const pad2 = (n) => (n == null ? "—" : String(n).padStart(2, "0"));
const pct = (x) => (x == null || !isFinite(x) ? "—" : Math.round(x * 100) + "%");

export function catalogParams() {
  const f = state.filters;
  const p = { category: state.category, q: f.q, sort: f.sort };
  if (f.minVnd != null) p.min_vnd = f.minVnd;
  if (f.maxVnd != null) p.max_vnd = f.maxVnd;
  if (f.brands.length) p.brand = f.brands;
  if (f.minRating) p.min_rating = f.minRating;
  for (const [k, v] of Object.entries(f.attrs)) if (v && v.length) p[k] = v;
  return p;
}

export async function loadCatalog() {
  const my = ++seq;
  state.catalog = { ...state.catalog, status: "loading", error: null };
  emit("catalog");
  try {
    const data = await api.catalog(catalogParams());
    if (my !== seq) return;
    api.remember(data.items);
    state.catalog = { status: "ready", data, error: null };
    announce(`${data.total} sản phẩm ${catLabel(state.category).toLowerCase()} khớp bộ lọc`);
  } catch (e) {
    if (my !== seq) return;
    state.catalog = { status: "error", data: state.catalog.data, error: e };
  }
  emit("catalog");
}

/* ───── Khung màn danh mục ───── */
export function mountCatalog(stage) {
  render(stage, html`<div id="cat-head"></div><div id="cat-toolbar"></div><div id="cat-results" aria-busy="false"></div><div id="cat-foot"></div>`);
  updateCatalog(true);
}

export function updateCatalog(full = false) {
  const head = document.getElementById("cat-head");
  if (!head) return;
  if (full || head.dataset.cat !== state.category || !head.dataset.ready) {
    render(head, masthead());
    head.dataset.cat = state.category;
    head.dataset.ready = state.catalog.data ? "1" : "";
  } else {
    updateHead(head);
  }
  render(document.getElementById("cat-toolbar"), toolbar());
  const results = document.getElementById("cat-results");
  results.setAttribute("aria-busy", state.catalog.status === "loading" ? "true" : "false");
  render(results, resultsHtml());
  render(document.getElementById("cat-foot"), footHtml());
}

function catMeta() {
  return (state.catalog.data && state.catalog.data.catalog) || (state.health && state.health.catalog) || null;
}

function masthead() {
  const meta = catMeta();
  const cats = (meta && meta.categories) || { headphones: { label: "Tai nghe" }, mouse: { label: "Chuột" }, keyboard: { label: "Bàn phím" } };
  const ds = (meta && meta.dataset) || {};
  return html`<header class="cat-head">
    <div class="cat-head__meta">
      <span class="kicker"><span class="slash">//</span> 01 catalog · <b>${ds.dataset || "dataset"}</b>${meta ? html` · ${meta.version} · ${meta.published} items` : ""}</span>
      ${meta && meta.synthetic ? html`<button class="data-flag" data-action="explain-data">${icon("alert")} demo data</button>` : ""}
    </div>
    <div class="keycaps" role="group" aria-label="Ngành hàng — phím tắt 1, 2, 3">
      ${Object.entries(cats).map(([k, c], i) => html`<button class="keycap" aria-pressed="${k === state.category ? "true" : "false"}" data-action="set-category" data-cat="${k}" aria-keyshortcuts="${i + 1}">
        <span class="keycap__legend" aria-hidden="true">${i + 1}</span><span class="led" aria-hidden="true"></span>
        <span class="keycap__name">${c.label}</span><span class="keycap__count" data-count="${k}">${c.count != null ? pad2(c.count) : ""}</span></button>`)}
    </div>
    <p class="cat-head__deck">Thông số trích từ <span class="mono">details</span> / <span class="mono">features</span> của Amazon, có mã nguồn và trạng thái kiểm định. Muốn nhanh hơn: <button type="button" data-action="focus-agent">giao nhu cầu cho agent</button> — nó trả tối đa 3 lựa chọn kèm lý do và trích dẫn.</p>
    <div class="kpis" data-kpis>${kpis()}</div>
  </header>`;
}

function updateHead(head) {
  const meta = catMeta();
  if (meta && meta.categories) {
    for (const [k, c] of Object.entries(meta.categories)) {
      const el = head.querySelector(`[data-count="${k}"]`);
      if (el) el.textContent = pad2(c.count);
    }
  }
  const k = head.querySelector("[data-kpis]");
  if (k) render(k, kpis());
}

function kpis() {
  const d = state.catalog.data;
  if (!d) return [1, 2, 3, 4].map(() => html`<div class="kpi"><span class="kicker">…</span><span class="skel" style="height:28px;width:60%"></span></div>`);
  const items = d.items;
  const n = items.length;
  const withRev = items.filter((p) => p.reviews_collected > 0).length;
  let ver = 0, tot = 0;
  items.forEach((p) => Object.values(p.attributes || {}).forEach((a) => { tot++; if (a.status === "VERIFIED") ver++; }));
  const prices = items.map((p) => p.price_vnd).filter((v) => v != null).sort((a, b) => a - b);
  const mid = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2) : null;
  const tile = (label, value, sub, title = "") => html`<div class="kpi" title="${title}"><span class="kicker">${label}</span><span class="kpi__v led-num">${value}</span><span class="kpi__s">${sub}</span></div>`;
  return [
    tile("items", pad2(n), `/ ${d.category_total} trong ngành`),
    tile("có review", pad2(withRev), n ? `${pct(withRev / n)} số item` : "—"),
    tile("spec verified", tot ? pct(ver / tot) : "—", `${ver}/${tot} trường`, "Tỉ lệ thông số có trạng thái VERIFIED (có nguồn)"),
    tile("giá trung vị", mid != null ? fmt.vndShort(mid).replace(" ", "") : "—", prices.length < n ? `${n - prices.length} price: null` : "≈ từ USD"),
  ];
}

function activeChips() {
  const f = state.filters;
  const chips = [];
  const chip = (k, v, action, data = "") =>
    html`<span class="chip chip--filter"><span class="k">${k}</span><span>${v}</span><button class="chip__x" data-action="${action}" ${data ? html`${data}` : ""} aria-label="Bỏ lọc ${k} ${v}">${icon("x")}</button></span>`;
  if (f.q) chips.push(chip("q", `“${f.q}”`, "clear-q"));
  if (f.minVnd != null || f.maxVnd != null) chips.push(chip("giá", priceLabel(f.minVnd, f.maxVnd), "clear-price"));
  f.brands.forEach((b) => chips.push(html`<span class="chip chip--filter"><span class="k">hãng</span><span>${b}</span><button class="chip__x" data-action="toggle-brand" data-brand="${b}" aria-label="Bỏ lọc thương hiệu ${b}">${icon("x")}</button></span>`));
  if (f.minRating) chips.push(chip("sao", `≥ ${fmt.rating(f.minRating)}`, "clear-rating"));
  const gates = (state.catalog.data && state.catalog.data.gates) || {};
  for (const [k, vals] of Object.entries(f.attrs)) {
    (vals || []).forEach((v) => {
      const label = (gates[k] && gates[k][v]) || v;
      chips.push(html`<span class="chip chip--filter"><span class="k">${SHORT[k] || k}</span><span>${label}</span><button class="chip__x" data-action="toggle-attr" data-key="${k}" data-val="${v}" aria-label="Bỏ lọc ${attrLabel(k)} ${label}">${icon("x")}</button></span>`);
    });
  }
  return chips;
}

export function priceLabel(min, max) {
  if (min != null && max != null) return `${fmt.vndShort(min)}–${fmt.vndShort(max)}`;
  if (max != null) return `≤ ${fmt.vndShort(max)}`;
  if (min != null) return `≥ ${fmt.vndShort(min)}`;
  return "";
}

function toolbar() {
  const d = state.catalog.data;
  const n = activeFilterCount();
  const chips = activeChips();
  const mode = state.catalogView === "table" ? "table" : "grid";
  const count = d
    ? html`<p class="toolbar__count"><b>${d.total}</b>${d.total === d.category_total ? " items" : html` / ${d.category_total} khớp`}</p>`
    : html`<p class="toolbar__count"><span class="skel" style="display:inline-block;width:90px;height:16px"></span></p>`;
  return html`<div class="toolbar">
    ${count}
    <div class="toolbar__chips">${chips}${chips.length > 1 ? html`<button class="btn btn--quiet btn--sm" data-action="clear-filters">clear all</button>` : ""}</div>
    <div class="toolbar__right">
      <button class="btn btn--sm filters-open" data-action="open-filters" aria-label="Mở bộ lọc${n ? `, đang dùng ${n}` : ""}">${icon("sliders", { size: 15 })} Lọc ${n ? html`<span class="badge">${n}</span>` : ""}</button>
      <div class="seg" role="group" aria-label="Kiểu hiển thị">
        <button type="button" aria-pressed="${mode === "grid" ? "true" : "false"}" data-action="set-view-mode" data-mode="grid" title="Lưới">${icon("grid")}<span class="visually-hidden">Lưới</span></button>
        <button type="button" aria-pressed="${mode === "table" ? "true" : "false"}" data-action="set-view-mode" data-mode="table" title="Bảng">${icon("list")}<span class="visually-hidden">Bảng</span></button>
      </div>
      <label class="visually-hidden" for="sort">Sắp xếp</label>
      <select class="select" id="sort" data-change="sort">
        ${SORTS.map(([v, l]) => html`<option value="${v}" ${state.filters.sort === v ? "selected" : ""}>${l}</option>`)}
      </select>
    </div>
  </div>`;
}

function resultsHtml() {
  const { status, data, error } = state.catalog;
  if (status === "error") {
    // EF-03 / AC-CAT-03: lỗi truy xuất là lỗi — không được hiện như "không có hàng".
    return errorNotice(error, {
      extra: "Đây là lỗi truy xuất, không có nghĩa là hết hàng hay không có sản phẩm phù hợp.",
      retry: html`<button class="btn btn--sm btn--accent" data-action="reload-catalog">${icon("refresh", { size: 15 })} Thử lại</button>`,
    });
  }
  if (!data) return skeletonGrid();
  if (!data.items.length) return emptyResults(data);
  const key = state.category + "|" + state.catalogView + "|" + data.items.map((p) => p.id).join(",");
  const enter = key !== lastGridKey;
  lastGridKey = key;
  const dim = status === "loading" ? html`style="opacity:.55;transition:opacity .2s"` : "";
  if (state.catalogView === "table") return html`<div class="ptable-wrap" ${dim}>${tableView(data.items)}</div>`;
  return html`<div class="grid ${enter ? "grid--enter" : ""}" ${dim}>${data.items.map((p, i) => card(p, i))}</div>`;
}

function skeletonGrid() {
  const one = html`<div class="card"><div class="plate skel"></div>
    <div class="card__body"><div class="skel" style="height:12px;width:40%"></div><div class="skel" style="height:20px;width:75%"></div><div class="skel" style="height:12px;width:90%"></div></div>
    <div class="card__foot"><div class="skel" style="height:18px;width:45%"></div></div></div>`;
  return html`<div class="grid" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map(() => one)}</div>`;
}

function emptyResults(data) {
  const n = activeFilterCount();
  const hiddenNoPrice = (state.filters.minVnd != null || state.filters.maxVnd != null) && data.facets && data.facets.no_price;
  return emptyState({
    title: n ? `0 kết quả cho ${n} điều kiện đang lọc` : "Ngành này chưa có sản phẩm được công bố",
    body: html`${n ? "Bỏ bớt một điều kiện, hoặc để agent tìm phương án gần nhất — nó sẽ nói rõ điều gì phải nới và chờ bạn duyệt." : "Catalog chỉ hiện sản phẩm APPROVED."}${hiddenNoPrice ? html` <span class="muted">${data.facets.no_price} sản phẩm có price: null đang bị ẩn vì bạn lọc theo ngân sách.</span>` : ""}`,
    actions: html`${n ? html`<button class="btn btn--primary" data-action="clear-filters">Bỏ tất cả bộ lọc</button>` : ""}
      <button class="btn btn--pen" data-action="ask-filtered">${icon("terminal", { size: 15 })} Giao cho agent</button>`,
  });
}

export function card(p, i = 0) {
  const inCmp = state.compare.includes(p.id);
  const keys = CARD_KEYS[p.category] || [];
  const name = `${p.brand} ${p.model}`;
  return html`<article class="card" style="--i:${Math.min(i, 12)}">
    ${plate(p)}
    <div class="card__actions">
      <button class="toggle-compare" data-action="toggle-compare" data-id="${p.id}" aria-pressed="${inCmp ? "true" : "false"}" aria-label="${inCmp ? "Bỏ khỏi so sánh" : "Thêm vào so sánh"}: ${name}">
        ${icon(inCmp ? "check" : "plus")}<span class="lbl">${inCmp ? "đã chọn" : "so sánh"}</span>
      </button>
    </div>
    <div class="card__body">
      <span class="card__store">${p.brand} · ${p.id}</span>
      <h3 class="card__title"><a href="#/sp/${p.id}">${p.model}</a></h3>
      <p class="card__listing">${p.title}</p>
      <div class="specs">${keys.map((k) => specToken(p, k))}</div>
    </div>
    <div class="card__foot">
      ${priceBlock(p)}
      <div class="card__rating">${stars(p.rating, p.rating_number)}<small>${fmt.int(p.rating_number)} lượt</small></div>
    </div>
    <button class="card__ask" data-action="ask-product" data-id="${p.id}" aria-label="Hỏi agent về ${name}">${icon("terminal")}ask agent<span class="ask-more"> về mẫu này</span></button>
  </article>`;
}

/* ───── Chế độ bảng ───── */
function sortHead(label, kind, cls = "") {
  const s = state.filters.sort;
  const active = (kind === "price" && s.startsWith("price")) || s === kind;
  const ic = kind === "price" ? (s === "price_desc" ? "arrow-down" : "arrow-up") : "arrow-down";
  const ariaSort = !active ? "none" : kind === "price" && s === "price_asc" ? "ascending" : "descending";
  return html`<th scope="col" class="${cls} ${active ? "is-sorted" : ""}" aria-sort="${ariaSort}"><button type="button" data-action="sort-col" data-sort="${kind}">${label}${active ? icon(ic) : ""}</button></th>`;
}

function tableView(items) {
  const keys = (CARD_KEYS[state.category] || []).slice(0, 2);
  const cell = (p, k) => {
    const a = (p.attributes || {})[k] || { status: "UNKNOWN" };
    const st = a.status || "UNKNOWN";
    const v = st === "VERIFIED" ? a.value : st === "CONFLICT" ? "mâu thuẫn" : "chưa rõ";
    return html`<td><span class="sp sp--${st.toLowerCase()}"><span class="led led--${ledFor(st)}" aria-hidden="true"></span>${v}</span></td>`;
  };
  return html`<table class="ptable">
    <caption class="visually-hidden">${catLabel(state.category)} — ${items.length} sản phẩm</caption>
    <thead><tr>
      <th scope="col">asin</th><th scope="col">sản phẩm</th>
      ${keys.map((k) => html`<th scope="col">${SHORT[k] || k}</th>`)}
      ${sortHead("giá", "price", "r")}${sortHead("sao", "rating", "r")}${sortHead("lượt", "reviews", "r")}${sortHead("Q", "relevance", "r")}
      <th scope="col"><span class="visually-hidden">So sánh</span></th>
    </tr></thead>
    <tbody>${items.map((p) => {
      const inCmp = state.compare.includes(p.id);
      return html`<tr data-action="open-product" data-id="${p.id}">
        <td class="asin">${p.id}</td>
        <td><div class="prod">${plate(p, { variant: "thumb" })}<div><a href="#/sp/${p.id}">${p.brand} ${p.model}</a><small>${p.title}</small></div></div></td>
        ${keys.map((k) => cell(p, k))}
        <td class="r">${p.price_vnd != null ? fmt.vnd(p.price_vnd) : html`<span class="muted">null</span>`}</td>
        <td class="r">${fmt.rating(p.rating)}</td>
        <td class="r">${fmt.int(p.rating_number)}</td>
        <td class="r">${fmt.score(p.q_score)}</td>
        <td><button class="toggle-compare" data-action="toggle-compare" data-id="${p.id}" aria-pressed="${inCmp ? "true" : "false"}" aria-label="${inCmp ? "Bỏ khỏi so sánh" : "Thêm vào so sánh"}: ${p.brand} ${p.model}">${icon(inCmp ? "check" : "plus")}</button></td>
      </tr>`;
    })}</tbody>
  </table>`;
}

function footHtml() {
  const meta = catMeta();
  if (!meta) return "";
  return html`<div class="catalog-foot kicker">
    <span>status = APPROVED${meta.hidden_pending ? ` · ${meta.hidden_pending} PENDING đang ẩn` : ""}</span>
    <span>src: ${meta.source}</span>
    ${meta.fx && meta.fx.usd_vnd ? html`<span>fx ${fmt.int(meta.fx.usd_vnd)}₫/USD ${meta.fx.source || ""}</span>` : ""}
  </div>`;
}

/* ───── Bộ lọc ───── */
export function filtersHtml(prefix = "f") {
  const d = state.catalog.data;
  const f = state.filters;
  const gates = (d && d.gates) || {};
  const brands = (d && d.facets && d.facets.brands) || [];
  const attrCounts = (d && d.facets && d.facets.attributes) || {};
  const fx = fxInfo();
  const presetOn = (p) => f.minVnd === p.min && f.maxVnd === p.max;
  const cands = (d && d.filter_candidates) || Object.keys(gates);
  const cov = (d && d.coverage) || {};
  const gate = d && d.gate != null ? d.gate : 0.8;
  return html`
    <div class="filters__head">
      <h2 class="filters__title">Bộ lọc</h2>
      ${activeFilterCount() ? html`<button class="btn btn--quiet btn--sm" data-action="clear-filters">reset</button>` : ""}
    </div>

    <section class="fgroup" aria-labelledby="${prefix}-price">
      <div class="fgroup__title"><h3 class="kicker kicker--ink" id="${prefix}-price">ngân sách</h3><span class="kicker">VNĐ</span></div>
      <div class="presets" role="group" aria-label="Khoảng giá nhanh">
        ${PRESETS.map((p, i) => html`<button type="button" class="preset" aria-pressed="${presetOn(p) ? "true" : "false"}" data-action="price-preset" data-i="${i}">${p.label}</button>`)}
      </div>
      <form class="range" data-submit="price" novalidate>
        <div class="field"><label class="field__label" for="${prefix}-min">min</label>
          <input class="input" id="${prefix}-min" name="min" inputmode="numeric" placeholder="0" value="${f.minVnd != null ? fmt.int(f.minVnd) : ""}" aria-invalid="${state.priceError ? "true" : "false"}" ${state.priceError ? html`aria-describedby="${prefix}-price-err"` : ""}></div>
        <div class="field"><label class="field__label" for="${prefix}-max">max</label>
          <input class="input" id="${prefix}-max" name="max" inputmode="numeric" placeholder="∞" value="${f.maxVnd != null ? fmt.int(f.maxVnd) : ""}" aria-invalid="${state.priceError ? "true" : "false"}"></div>
        <button type="submit" class="visually-hidden">Áp dụng khoảng giá</button>
      </form>
      ${state.priceError ? html`<p class="field__error" id="${prefix}-price-err" role="alert">${icon("alert", { size: 15 })}${state.priceError}</p>` : ""}
      <p class="fgroup__hint">Gõ “800k”, “1,5tr” đều được. Quy đổi ${fx.usd_vnd ? fmt.int(fx.usd_vnd) + "₫/USD" : "—"} ${fx.source || ""}. Item <span class="mono">price: null</span> bị ẩn khi lọc ngân sách.</p>
    </section>

    <section class="fgroup" aria-labelledby="${prefix}-brand">
      <div class="fgroup__title"><h3 class="kicker kicker--ink" id="${prefix}-brand">store / brand</h3></div>
      ${brands.length ? brands.map((b) => html`<label class="check ${b.count === 0 && !f.brands.includes(b.name) ? "check--zero" : ""}">
          <input type="checkbox" data-change="brand" value="${b.name}" ${f.brands.includes(b.name) ? "checked" : ""}>
          <span>${b.name}</span><span class="check__count">${b.count}</span></label>`)
        : html`<div class="skel" style="height:90px"></div>`}
    </section>

    <section class="fgroup" aria-labelledby="${prefix}-rating">
      <div class="fgroup__title"><h3 class="kicker kicker--ink" id="${prefix}-rating">average_rating</h3></div>
      <div class="seg" role="group" aria-labelledby="${prefix}-rating">
        ${[[null, "all"], [4, "≥4.0"], [4.5, "≥4.5"]].map(([v, l]) => html`<button type="button" aria-pressed="${(f.minRating || null) === v ? "true" : "false"}" data-action="set-rating" data-v="${v == null ? "" : v}">${l}</button>`)}
      </div>
      <p class="fgroup__hint">Điểm trên trang sản phẩm Amazon (metadata), không phải từ review đã thu thập.</p>
    </section>

    ${Object.entries(gates).map(([key, opts]) => html`
      <section class="fgroup" aria-labelledby="${prefix}-${key}">
        <div class="fgroup__title"><h3 class="kicker kicker--ink" id="${prefix}-${key}">${attrLabel(key)}</h3><span class="kicker">verified only</span></div>
        ${Object.entries(opts).map(([tag, label]) => {
          const on = (f.attrs[key] || []).includes(tag);
          const c = (attrCounts[key] || {})[tag];
          return html`<label class="check ${c === 0 && !on ? "check--zero" : ""}"><input type="checkbox" data-change="attr" data-key="${key}" value="${tag}" ${on ? "checked" : ""}><span>${label}</span><span class="check__count">${c ?? ""}</span></label>`;
        })}
      </section>`)}

    <section class="fgroup" aria-labelledby="${prefix}-gate">
      <div class="fgroup__title"><h3 class="kicker kicker--ink" id="${prefix}-gate">data gate</h3><span class="kicker">≥ ${Math.round(gate * 100)}%</span></div>
      <div class="gatebox">
        ${cands.map((k) => {
          const c = cov[k] != null ? cov[k] : null;
          const on = !!gates[k];
          return html`<div class="gate ${on ? "gate--on" : "gate--off"}" title="${attrLabel(k)}: ${c == null ? "chưa đo" : Math.round(c * 100) + "% sản phẩm có giá trị đã xác minh"}">
            <span>${SHORT[k] || k}</span><span>${c == null ? "—" : Math.round(c * 100) + "%"}</span><span class="st">${on ? "ON" : "OFF"}</span>${segm(c == null ? 0 : c * 100, { n: 10 })}</div>`;
        })}
      </div>
      <p class="fgroup__hint">Bộ lọc chỉ bật khi đủ sản phẩm có thông số <b>đã xác minh</b> (AC-CAT-02). Item chưa xác minh không bao giờ khớp bộ lọc. DPI, switch, pin… hỏi agent để xem từng mẫu.</p>
    </section>`;
}

/* ───── Hành động ───── */
export function setCategory(cat) {
  if (cat === state.category) return;
  state.category = cat;
  // BR-CTX-11: đổi ngành hàng thì không mang thuộc tính riêng của ngành cũ sang.
  state.filters = { ...DEFAULT_FILTERS(), q: "", sort: state.filters.sort };
  state.priceError = null;
  const q = document.getElementById("q");
  if (q) q.value = "";
  save();
  emit("filters");
  loadCatalog();
}

export function applyFilters() {
  save();
  emit("filters");
  loadCatalog();
}

export function setPrice(minText, maxText) {
  const min = fmt.parseVnd(minText);
  const max = fmt.parseVnd(maxText);
  if ((minText && min == null) || (maxText && max == null)) {
    state.priceError = "Chưa hiểu số tiền — thử 500000, 500k hoặc 1,5tr.";
    emit("filters");
    return;
  }
  if (min != null && max != null && min > max) {
    // EF-01: khoảng giá sai → yêu cầu sửa, không truy vấn sai.
    state.priceError = `min (${fmt.vnd(min)}) > max (${fmt.vnd(max)}). Sửa lại để lọc.`;
    emit("filters");
    return;
  }
  state.priceError = null;
  state.filters.minVnd = min;
  state.filters.maxVnd = max;
  applyFilters();
}

export function presetPrice(i) {
  const p = PRESETS[i];
  const on = state.filters.minVnd === p.min && state.filters.maxVnd === p.max;
  state.filters.minVnd = on ? null : p.min;
  state.filters.maxVnd = on ? null : p.max;
  state.priceError = null;
  applyFilters();
}

export function sortByColumn(kind) {
  const s = state.filters.sort;
  if (kind === "price") state.filters.sort = s === "price_asc" ? "price_desc" : "price_asc";
  else state.filters.sort = kind;
  applyFilters();
}

export function setViewMode(mode) {
  state.catalogView = mode === "table" ? "table" : "grid";
  try { localStorage.setItem("smartbuy.view", state.catalogView); } catch (e) { /* bỏ qua */ }
  emit("filters");
}
