// UC-06 — So sánh (DIFF) 2–3 sản phẩm cùng ngành. Không kết luận trên UNKNOWN, cảnh báo vượt ngân sách (BR-CMP-01…08).
import { state, emit, save } from "../store.js";
import { api } from "../api.js";
import { html, render, announce } from "../util.js";
import { icon } from "../icons.js";
import { plate } from "../plates.js";
import * as fmt from "../fmt.js";
import { stamp, attrLabel, catLabel, emptyState, errorNotice, stars } from "../parts.js";
import { toast, confirmDialog } from "../layers.js";

export const MAX_COMPARE = 3;

export async function toggleCompare(id) {
  const i = state.compare.indexOf(id);
  if (i >= 0) {
    state.compare.splice(i, 1);
    save();
    emit("compare");
    announce(`Đã bỏ ${id} khỏi danh sách so sánh, còn ${state.compare.length}`);
    return;
  }
  let p = api.cached(id);
  if (!p) { try { p = await api.product(id); } catch (e) { /* để server kiểm tra lại khi so sánh */ } }
  const firstCat = state.compare.length ? (api.cached(state.compare[0]) || {}).category : null;
  if (p && firstCat && p.category !== firstCat) {
    // AF-03: khác ngành → so sánh riêng, không trộn.
    const ok = await confirmDialog({
      title: "Khác ngành hàng",
      body: `Danh sách đang so sánh ${catLabel(firstCat).toLowerCase()}. ${p.brand} ${p.model} là ${catLabel(p.category).toLowerCase()} — không so sánh chung được. Bắt đầu danh sách mới với sản phẩm này?`,
      confirm: "Bắt đầu danh sách mới",
      cancel: "Giữ danh sách cũ",
    });
    if (!ok) return;
    state.compare = [id];
  } else if (state.compare.length >= MAX_COMPARE) {
    // AF-02: thêm sản phẩm thứ 4 → thay một sản phẩm.
    const oldest = state.compare[0];
    const o = api.cached(oldest);
    state.compare = [...state.compare.slice(1), id];
    toast(`Tối đa ${MAX_COMPARE} sản phẩm — đã thay ${o ? o.brand + " " + o.model : oldest}.`, {
      actionLabel: "Hoàn tác",
      onAction: () => { state.compare = [oldest, ...state.compare.filter((x) => x !== id)]; save(); emit("compare"); },
    });
  } else {
    state.compare.push(id);
    if (state.compare.length === 1) toast("Đã thêm vào so sánh. Chọn thêm 1–2 sản phẩm cùng ngành.", { kind: "ok" });
  }
  save();
  emit("compare");
  announce(`Danh sách so sánh có ${state.compare.length} sản phẩm`);
}

/* ───── Khay so sánh (nổi ở cuối màn danh mục) ───── */
export function trayHtml() {
  if (!state.compare.length || state.view === "compare") return "";
  const items = state.compare.map((id) => api.cached(id) || { id, brand: "", model: id, category: "" });
  const slots = Math.max(0, 2 - items.length);
  return html`<div class="tray ${items.length >= 3 ? "tray--full" : ""}" role="region" aria-label="Danh sách so sánh">
    <span class="tray__label">diff <b>${items.length}/${MAX_COMPARE}</b></span>
    <div class="tray__items">
      ${items.map((p) => html`<div class="tray__item" title="${p.brand} ${p.model}">${plate(p, { variant: "thumb" })}<span class="tray__name">${p.brand} ${p.model}</span>
        <button data-action="toggle-compare" data-id="${p.id}" aria-label="Bỏ ${p.brand} ${p.model} khỏi so sánh">${icon("x", { size: 14 })}</button></div>`)}
      ${Array.from({ length: slots }, () => html`<span class="tray__slot" aria-hidden="true"></span>`)}
    </div>
    <a class="btn btn--accent btn--sm" href="#/so-sanh" ${items.length < 2 ? html`aria-disabled="true" data-action="need-more"` : ""}>
      ${items.length < 2 ? html`Chọn thêm<span class="tray__more"> để so sánh</span>` : html`So sánh<span class="tray__more"> ${items.length} sản phẩm</span>`} ${icon("arrow-right", { size: 15 })}
    </a>
  </div>`;
}

/* ───── Màn so sánh ───── */
let seq = 0;
let lastData = null;

export async function mountCompare(stage) {
  const ids = state.compare.slice();
  if (ids.length < 2) {
    lastData = null;
    render(stage, html`${head(null)}${emptyState({
      title: ids.length ? "Cần thêm ít nhất một sản phẩm nữa" : "Chưa có gì để diff",
      body: "Chọn 2–3 sản phẩm cùng ngành bằng nút “so sánh” trên thẻ (hoặc trong bảng). Bảng chỉ đặt cạnh nhau những gì đã xác minh — ô chưa rõ ghi rõ là chưa rõ.",
      actions: html`<a class="btn btn--primary" href="#/">${icon("grid", { size: 15 })} Về danh mục</a>`,
    })}`);
    return;
  }
  const my = ++seq;
  if (!lastData) render(stage, html`${head(ids.length)}<div class="skel" style="height:420px"></div>`);
  try {
    const data = await api.compare(ids);
    if (my !== seq || state.view !== "compare") return;
    lastData = data;
    renderCompare(stage);
  } catch (e) {
    if (my !== seq) return;
    render(stage, html`${head(ids.length)}${errorNotice(e, { retry: html`<button class="btn btn--sm btn--accent" data-action="reload-compare">Thử lại</button>` })}`);
  }
}

export function renderCompare(stage) {
  if (!lastData) return;
  const y = window.scrollY;
  render(stage, html`${head(lastData.items.length, lastData)}${table(lastData)}${aiBox(lastData)}`);
  window.scrollTo({ top: y });
}

function head(n, data) {
  const cat = data && data.items[0] ? catLabel(data.items[0].category) : "";
  return html`<header class="page-head">
    <div class="page-head__row"><span class="kicker"><span class="slash">//</span> 03 diff${n ? ` · ${n}/${MAX_COMPARE}` : ""}${cat ? ` · ${cat}` : ""}</span>
      ${n ? html`<button class="btn btn--quiet btn--sm" data-action="clear-compare">${icon("trash", { size: 14 })} clear</button>` : ""}</div>
    <h1 class="page-head__title">Đặt cạnh nhau. Chỉ nhìn chỗ khác.</h1>
    <p class="page-head__deck">So sánh không phải đề xuất. Ô gạch chéo = chưa xác minh, không dùng để kết luận; nhãn BEST chỉ gắn khi mọi ô trong hàng đều đã biết.</p>
  </header>`;
}

function budgetMax() {
  const b = state.agent.context && state.agent.context.budget;
  if (b && b.max_vnd) return b.max_vnd;
  return state.filters.maxVnd != null ? state.filters.maxVnd : null;
}

function bestIndex(values, dir) {
  // AC-CMP-03: chỉ đánh dấu khi MỌI sản phẩm đều có giá trị — không highlight sai trên UNKNOWN.
  if (values.some((v) => v == null)) return -1;
  const target = dir === "min" ? Math.min(...values) : Math.max(...values);
  return values.filter((v) => v === target).length > 1 ? -1 : values.indexOf(target);
}

const norm = (a) => (!a || a.status !== "VERIFIED" ? `#${(a && a.status) || "UNKNOWN"}` : String(a.value).trim().toLowerCase());

function table(data) {
  const items = data.items;
  const max = budgetMax();
  const bp = bestIndex(items.map((p) => p.price_vnd), "min");
  const bq = bestIndex(items.map((p) => p.q_score), "max");
  const problems = data.problems || [];
  const diffOnly = !!state.diffOnly;
  const cell = (content, { unknown = false, best = false } = {}) =>
    html`<td class="${unknown ? "is-unknown" : ""} ${best ? "is-best" : ""}"><div class="cell">${content}${best ? html`<span class="best-tag">best</span>` : ""}</div></td>`;
  const attrRows = data.rows.map((r) => {
    const vals = items.map((p) => (p.attributes || {})[r.key] || { status: "UNKNOWN" });
    const same = new Set(vals.map(norm)).size === 1;
    return { r, vals, same };
  });
  const hidden = attrRows.filter((x) => x.same).length;
  const shown = diffOnly ? attrRows.filter((x) => !x.same) : attrRows;
  return html`
    ${problems.length ? html`<div class="notice notice--warn" style="margin-bottom:14px">${icon("alert")}<div class="notice__title">Lưu ý</div><div class="notice__body">${problems.join(" · ")}</div></div>` : ""}
    <div class="cmp-tools">
      <label class="switch"><input type="checkbox" data-change="diff-only" ${diffOnly ? "checked" : ""}> chỉ hiện khác biệt${hidden ? html` <span class="muted">(${hidden} hàng giống nhau${diffOnly ? " đang ẩn" : ""})</span>` : ""}</label>
      <span class="kicker">${items.length} cột · ${shown.length + 4} hàng</span>
    </div>
    <div class="cmp-wrap" role="region" aria-label="Bảng so sánh" tabindex="0">
      <table class="cmp">
        <caption class="visually-hidden">So sánh ${items.map((p) => p.brand + " " + p.model).join(", ")}</caption>
        <thead><tr><th scope="col"><span class="kicker">field</span></th>
          ${items.map((p) => html`<th scope="col"><div class="cmp__prod">${plate(p)}<span class="kicker">${p.brand} · ${p.id}</span>
            <span class="cmp__name"><a href="#/sp/${p.id}">${p.model}</a></span>
            <button class="btn btn--quiet btn--sm cmp__rm" data-action="toggle-compare" data-id="${p.id}" aria-label="Bỏ ${p.brand} ${p.model} khỏi so sánh">${icon("x", { size: 13 })} bỏ</button></div></th>`)}
        </tr></thead>
        <tbody>
          <tr class="grp"><th colspan="${items.length + 1}" scope="colgroup"><span class="kicker">giá & điểm</span></th></tr>
          <tr><th scope="row">price</th>${items.map((p, i) => cell(
            p.price_vnd == null ? html`null` : html`<strong class="mono">≈ ${fmt.vnd(p.price_vnd)}</strong><span class="muted mono" style="font-size:11.5px">${fmt.usd(p.price_usd)}</span>
              ${max != null && p.price_vnd > max ? html`<span class="over-budget">${icon("alert")}vượt ngân sách ${fmt.vnd(p.price_vnd - max)}</span>` : ""}`,
            { unknown: p.price_vnd == null, best: i === bp }))}</tr>
          <tr><th scope="row">average_rating</th>${items.map((p) => cell(html`${stars(p.rating, p.rating_number)}<span class="muted mono" style="font-size:11.5px">${fmt.int(p.rating_number)} lượt</span>`))}</tr>
          <tr><th scope="row">Q (Bayes)</th>${items.map((p, i) => cell(html`<span class="mono">${fmt.score(p.q_score)}/100</span>`, { best: i === bq }))}</tr>
          <tr><th scope="row">review trong dataset</th>${items.map((p) => cell(p.reviews_collected ? html`<span class="mono">${p.reviews_collected}</span>` : html`0`, { unknown: !p.reviews_collected }))}</tr>
          <tr class="grp"><th colspan="${items.length + 1}" scope="colgroup"><span class="kicker">spec</span></th></tr>
          ${shown.map(({ r, vals, same }) => html`<tr class="${same ? "is-same" : ""}"><th scope="row">${r.label || attrLabel(r.key)}${same ? html` <span class="muted" style="font-size:10.5px">= giống</span>` : ""}</th>${vals.map((a) => {
            if (a.status === "CONFLICT") return cell(html`${(a.values || []).map((v) => html`<span>${v.value} <span class="muted mono" style="font-size:11px">${v.source}</span></span>`)}${stamp("CONFLICT")}`);
            if (a.status !== "VERIFIED" || a.value == null) return cell(html`chưa xác minh`, { unknown: true });
            return cell(html`${a.value}`);
          })}</tr>`)}
          ${diffOnly && !shown.length ? html`<tr><td colspan="${items.length + 1}" class="muted mono" style="font-size:12px">Mọi hàng spec đều giống nhau.</td></tr>` : ""}
          <tr class="grp"><th colspan="${items.length + 1}" scope="colgroup"><span class="kicker">review</span></th></tr>
          <tr><th scope="row">khía cạnh nổi bật</th>${items.map((p) => {
            const top = (p.insights || [])[0];
            return top ? cell(html`<span><b>${top.aspect}:</b> ${top.summary}</span><span class="muted mono" style="font-size:11px">+${top.pos} ~${top.mixed} −${top.neg}</span>`)
              : cell(html`chưa đủ review để khái quát`, { unknown: true });
          })}</tr>
        </tbody>
      </table>
    </div>
    <div class="cmp-legend"><span><i class="lg-unknown"></i>chưa xác minh — không dùng để kết luận</span><span><i class="lg-best"></i>best — chỉ khi mọi ô đều đã biết</span>${max != null ? html`<span>${icon("alert", { size: 13 })} ngân sách đang dùng: ≤ ${fmt.vnd(max)}</span>` : ""}</div>`;
}

function aiBox(data) {
  const names = data.items.map((p) => `${p.brand} ${p.model}`).join(", ");
  return html`<div class="cmp-ai">
    <div><h3>Cần agent đọc giúp các đánh đổi?</h3><p>Agent đối chiếu ${data.items.length} sản phẩm này với nhu cầu hiện tại, chỉ dùng thông tin có nguồn. Bảng trên vẫn dùng được khi agent lỗi (EF-01 UC-06).</p></div>
    <button class="btn btn--pen" data-action="ask-compare" data-names="${names}">${icon("terminal", { size: 15 })} Giao cho agent</button>
  </div>`;
}
