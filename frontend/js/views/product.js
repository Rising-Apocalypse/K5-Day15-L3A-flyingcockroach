// UC-03 — Datasheet sản phẩm: thông số đã kiểm định, details/features gốc của Amazon, điểm, review, JSON gốc.
// Thông số chưa xác minh / mâu thuẫn được nói rõ, không bịa (AC-DTL-01…04).
import { state } from "../store.js";
import { api } from "../api.js";
import { html, raw, render, esc } from "../util.js";
import { icon } from "../icons.js";
import { plate } from "../plates.js";
import * as fmt from "../fmt.js";
import { openDrawer, toast } from "../layers.js";
import { stamp, attrLabel, fxInfo, errorNotice, SHORT } from "../parts.js";

let current = null; // { id, layer }

export const currentProduct = () => current;

export async function openProduct(id, { onClose, focusEvidence } = {}) {
  if (current && current.id === id && !current.layer.closed) {
    if (focusEvidence) flashEvidence(focusEvidence);
    return current.layer;
  }
  if (current && !current.layer.closed) current.layer.close("replace");
  const layer = openDrawer({
    label: `Datasheet ${id}`,
    kicker: `datasheet · ${id}`,
    body: skeleton(),
    onClose: (reason) => { if (current && current.layer === layer) current = null; if (onClose) onClose(reason); },
  });
  current = { id, layer };
  try {
    const p = await api.product(id);
    if (layer.closed) return layer;
    render(layer.body, detail(p));
    renderHeadActions(layer, p);
    if (focusEvidence) requestAnimationFrame(() => flashEvidence(focusEvidence));
  } catch (e) {
    if (layer.closed) return layer;
    // EF-01: ID không tồn tại / chưa duyệt → không công bố. Lỗi khác → báo lỗi, không bịa nội dung.
    render(layer.body, errorNotice(e, {
      extra: e.type === "NOT_FOUND" ? "Sản phẩm có thể đã bị gỡ khỏi catalog công bố (status ≠ APPROVED)." : "",
      retry: e.type === "NOT_FOUND" ? "" : html`<button class="btn btn--sm btn--accent" data-action="open-product" data-id="${id}">Thử lại</button>`,
    }));
  }
  return layer;
}

export function refreshProductActions() {
  if (!current || current.layer.closed) return;
  const p = api.cached(current.id);
  if (p && p.evidence) {
    renderHeadActions(current.layer, p);
    const btn = current.layer.body.querySelector('[data-role="pd-compare"]');
    if (btn) btn.outerHTML = compareButton(p).s;
  }
}

function renderHeadActions(layer, p) {
  const inCmp = state.compare.includes(p.id);
  const holder = layer.actions;
  const old = holder.querySelector("[data-head-extra]");
  if (old) old.remove();
  const span = document.createElement("span");
  span.dataset.headExtra = "1";
  render(span, html`<button class="btn btn--sm" data-action="toggle-compare" data-id="${p.id}" aria-pressed="${inCmp ? "true" : "false"}">${icon(inCmp ? "check" : "plus", { size: 14 })}${inCmp ? "đã chọn so sánh" : "so sánh"}</button>`);
  holder.insertBefore(span, holder.firstChild);
}

function compareButton(p) {
  const inCmp = state.compare.includes(p.id);
  return html`<button class="btn ${inCmp ? "" : "btn--primary"}" data-role="pd-compare" data-action="toggle-compare" data-id="${p.id}" aria-pressed="${inCmp ? "true" : "false"}">${icon(inCmp ? "check" : "columns", { size: 15 })}${inCmp ? "Đã thêm vào so sánh" : "Thêm vào so sánh"}</button>`;
}

function skeleton() {
  return html`<div class="pd" aria-busy="true"><div class="pd__hero"><div class="plate skel"></div>
    <div style="display:grid;gap:12px"><div class="skel" style="height:12px;width:45%"></div><div class="skel" style="height:32px;width:80%"></div><div class="skel" style="height:12px;width:95%"></div><div class="skel" style="height:56px"></div></div></div></div>`;
}

export function flashEvidence(evId) {
  if (!current || current.layer.closed) return;
  const el = current.layer.body.querySelector(`[data-evid="${CSS.escape(evId)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.classList.add("is-flash");
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  setTimeout(() => el.classList.remove("is-flash"), 900);
}

const cite = (p, evId) => html`<button class="cite" data-action="cite" data-pid="${p.id}" data-ev="${evId}" aria-label="Xem nguồn ${evId}">${evId}</button>`;
const sec = (no, id, title, aside = "") => html`<header class="sec__head"><span class="sec__no">${no}</span><h3 class="sec__title" id="${id}">${title}</h3>${aside ? html`<span class="sec__aside kicker">${aside}</span>` : ""}</header>`;

function detail(p) {
  const fx = fxInfo();
  const name = `${p.brand} ${p.model}`;
  const imgs = p.images || [];
  const details = (p.evidence || []).filter((e) => e.kind === "detail");
  const feats = (p.evidence || []).filter((e) => e.kind === "feature");
  const verified = Object.values(p.attributes || {}).filter((a) => a.status === "VERIFIED").length;
  return html`<article class="pd" aria-labelledby="pd-title">
    <div class="pd__hero">
      <div class="gallery">
        ${plate(p, { variant: "hero" })}
        ${imgs.length > 1 ? html`<div class="gallery__thumbs" role="group" aria-label="Ảnh sản phẩm">${imgs.slice(0, 6).map((im, i) => html`<button type="button" data-action="gallery-pick" data-src="${im.src}" aria-pressed="${i === 0 ? "true" : "false"}" aria-label="Ảnh ${i + 1}${im.variant ? " · " + im.variant : ""}">${plate(p, { variant: "thumb", src: im.thumb || im.src })}</button>`)}</div>` : ""}
      </div>
      <div>
        <div class="pd__meta"><span class="kicker">${p.category_label} · <b>${p.id}</b></span><span class="stamp stamp--verified">approved</span></div>
        <h2 class="pd__title" id="pd-title">${name}</h2>
        <p class="pd__listing">${p.title}</p>
        <div class="pd__price">
          ${p.price_vnd != null
            ? html`<span class="price__vnd">≈ ${fmt.vnd(p.price_vnd)}</span><span class="price__usd">${fmt.usd(p.price_usd)} · price</span>`
            : html`<span class="price__vnd" style="font-size:16px;color:var(--text-3)">price: null</span>`}
          <p class="pd__fx">${icon("info")}<span>${p.price_vnd != null
            ? `Giá USD lúc thu thập dữ liệu, quy đổi ${fx.usd_vnd ? fmt.int(fx.usd_vnd) + "₫/USD" : ""} ${fx.source || ""}. Không phải giá bán hiện tại — SmartBuy không theo dõi giá, tồn kho hay vận chuyển.`
            : "Dữ liệu không có giá → không xác nhận được sản phẩm có nằm trong ngân sách (EX-03)."}</span></p>
        </div>
        <div class="pd__rating">
          <strong>${fmt.rating(p.rating)}</strong>${icon("star")}
          <span>${fmt.int(p.rating_number)} rating_number · ${p.reviews_collected || 0} review trong dataset</span>
        </div>
        <div class="pd__actions">
          ${compareButton(p)}
          <button class="btn btn--pen" data-action="ask-product" data-id="${p.id}">${icon("terminal", { size: 15 })}Hỏi agent về mẫu này</button>
        </div>
      </div>
    </div>

    <section aria-labelledby="pd-specs">
      ${sec("01", "pd-specs", "Spec · đã kiểm định", `${verified}/${Object.keys(p.attributes || {}).length} verified`)}
      ${specTable(p)}
    </section>

    ${details.length ? html`<section aria-labelledby="pd-details">
      ${sec("02", "pd-details", "Raw details", "metadata.details")}
      <table class="raw-table"><caption class="visually-hidden">Trường details gốc của Amazon</caption><tbody>
        ${details.map((e) => html`<tr data-evid="${e.id}"><td class="id">${e.id}</td><th scope="row">${e.field}</th><td>${e.text}</td></tr>`)}
      </tbody></table>
    </section>` : ""}

    ${feats.length ? html`<section aria-labelledby="pd-features">
      ${sec("03", "pd-features", "Features", "metadata.features")}
      <ul class="features">${feats.map((e) => html`<li data-evid="${e.id}"><span>${e.id}</span><span>${e.text}</span></li>`)}</ul>
    </section>` : ""}

    <section aria-labelledby="pd-rating">
      ${sec("04", "pd-rating", "Rating")}
      ${ratings(p)}
    </section>

    <section aria-labelledby="pd-insights">
      ${sec("05", "pd-insights", "Reviews", `${(p.evidence || []).filter((e) => e.kind === "review").length} hiển thị · đã bỏ user_id`)}
      ${insights(p)}
    </section>

    <section aria-labelledby="pd-json">
      ${sec("06", "pd-json", "Bản ghi gốc")}
      ${p.raw ? html`<details class="json">
        <summary>${icon("chevron-right", { size: 14 })}<span>${p.raw.parent_asin}.json — schema Amazon Reviews 2023 (metadata + 2 review)</span></summary>
        <button class="btn btn--sm json__copy" data-action="copy-json" data-id="${p.id}">${icon("copy", { size: 13 })}copy</button>
        <pre tabindex="0">${highlightJson(p.raw)}</pre>
      </details>` : html`<p class="muted">Không có bản ghi gốc.</p>`}
    </section>
  </article>`;
}

function specTable(p) {
  const keys = p.compare_keys && p.compare_keys.length ? p.compare_keys : Object.keys(p.attributes || {});
  return html`<table class="spec-table">
    <caption class="visually-hidden">Thông số của ${p.brand} ${p.model} và trạng thái kiểm định</caption>
    <tbody>${keys.map((k) => {
      const a = (p.attributes || {})[k] || { status: "UNKNOWN" };
      let val;
      if (a.status === "CONFLICT") {
        val = html`<div class="conflict-vals">${(a.values || []).map((x) => html`<span>${x.value} ${x.source && x.source !== "categories" ? cite(p, x.source) : html`<span class="muted mono" style="font-size:11px">${x.source || ""}</span>`}</span>`)}</div>
          <span class="note">Các nguồn ghi khác nhau — SmartBuy không tự chọn một giá trị.</span>`;
      } else if (a.status === "UNKNOWN" || a.value == null) {
        val = html`<span class="unknown-val">chưa xác minh</span>${a.source ? html` ${cite(p, a.source)}` : ""}${a.note ? html`<span class="note">${a.note}</span>` : ""}`;
      } else {
        val = html`${a.value} ${a.source && a.source !== "categories" ? cite(p, a.source) : a.source === "categories" ? html`<span class="muted mono" style="font-size:11px">categories</span>` : ""}`;
      }
      return html`<tr><th scope="row">${attrLabel(k)}</th><td>${val}</td><td class="st">${stamp(a.status || "UNKNOWN")}</td></tr>`;
    })}</tbody>
  </table>`;
}

function ratings(p) {
  const hist = p.rating_hist || {};
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(hist));
  return html`<div class="ratings">
    <div>
      <p class="ratings__big led-num">${fmt.rating(p.rating)}<small>/ 5</small></p>
      <p class="ratings__src"><span class="mono">average_rating</span> trên ${fmt.int(p.rating_number)} lượt (metadata Amazon).</p>
    </div>
    <div>
      ${total ? html`<div class="hist" role="img" aria-label="Phân bố sao của ${total} review trong dataset: ${[5, 4, 3, 2, 1].map((s) => `${s} sao ${hist[s] || 0}`).join(", ")}">
          ${[5, 4, 3, 2, 1].map((s, i) => {
            const n = hist[s] || 0;
            return html`<div class="hist__row" title="${s} sao: ${n} review"><span>${s}★</span><span class="hist__track">${n ? html`<span class="hist__bar" style="width:${(n / max) * 100}%;animation-delay:${i * 50}ms"></span>` : ""}</span><span>${n}</span></div>`;
          })}
        </div>
        <p class="hist__cap">Phân bố sao của ${total} review có trong dataset cho parent_asin này — không đại diện toàn bộ ${fmt.int(p.rating_number)} lượt.</p>`
        : html`<div class="notice">${icon("info")}<div class="notice__title">0 review trong dataset</div><div class="notice__body">Chỉ có điểm trung bình từ metadata — không có nghĩa là sản phẩm không có review (AC-DTL-02).</div></div>`}
    </div>
  </div>`;
}

function tierNote(n) {
  // Bậc review theo spec UC-03 (ngưỡng kế thừa là đề xuất).
  if (!n) return { kind: "info", title: "Chưa có review", body: "Chỉ có metadata. Không suy diễn trải nghiệm người dùng." };
  if (n <= 4) return { kind: "warn", title: `n = ${n} review`, body: "Hiển thị từng nhận xét cá nhân, không khái quát." };
  if (n <= 9) return { kind: "info", title: `n = ${n} review · phân tích sơ bộ`, body: "Chủ đề có nguồn; số lượng ít nên chỉ là tín hiệu ban đầu." };
  if (n <= 19) return { kind: "info", title: `n = ${n} review · theo khía cạnh`, body: "Mỗi nhận định trỏ về review cụ thể." };
  return { kind: "info", title: `n = ${n} review`, body: "Tập rộng hơn nhưng vẫn không mặc định đại diện cho mọi người dùng." };
}

function insights(p) {
  const n = p.reviews_collected || 0;
  const t = tierNote(n);
  const reviews = (p.evidence || []).filter((e) => e.kind === "review");
  const note = html`<div class="notice notice--${t.kind} tier">${icon(t.kind === "warn" ? "alert" : "info")}<div class="notice__title">${t.title}</div><div class="notice__body">${t.body}${p.insights_method ? html` <span class="mono" style="font-size:11.5px">· method: ${p.insights_method}</span>` : ""}</div></div>`;
  const list = reviews.length ? html`<div class="evidence" style="margin-top:14px">${reviews.map((e) => evItem(p, e))}</div>` : "";
  if (!n || n <= 4 || !(p.insights || []).length) return html`${note}${list}`;
  return html`${note}
    <div class="legend" aria-hidden="true" style="margin-bottom:12px"><span><i style="background:var(--viz-neg)"></i>chê</span><span><i style="background:var(--viz-mid)"></i>trung lập</span><span><i style="background:var(--viz-pos)"></i>khen</span></div>
    <div class="insights">${p.insights.map((it) => {
      const total = (it.pos || 0) + (it.mixed || 0) + (it.neg || 0) || 1;
      return html`<div class="insight">
        <div><p class="insight__aspect">${it.aspect}</p><p class="insight__counts">+${it.pos} · ~${it.mixed} · −${it.neg}</p></div>
        <div class="insight__main">
          <div class="sentiment" role="img" aria-label="${it.aspect}: ${it.pos} khen, ${it.mixed} trung lập, ${it.neg} chê">
            ${it.neg ? html`<i class="neg" style="width:${(it.neg / total) * 100}%"></i>` : ""}${it.mixed ? html`<i class="mid" style="width:${(it.mixed / total) * 100}%"></i>` : ""}${it.pos ? html`<i class="pos" style="width:${(it.pos / total) * 100}%"></i>` : ""}
          </div>
          <p class="insight__sum">${it.summary} ${(it.evidence || []).map((e) => cite(p, e))}</p>
        </div>
      </div>`;
    })}</div>
    ${list}`;
}

function evItem(p, e) {
  if (e.kind === "review") {
    return html`<div class="ev" data-evid="${e.id}">
      <span class="ev__id">${e.id}</span>
      <div class="ev__meta"><span>${"★".repeat(Math.round(e.rating || 0))}${"☆".repeat(5 - Math.round(e.rating || 0))} ${e.rating}</span><span>${fmt.month(e.date)}</span>${e.verified ? html`<span class="vp">verified_purchase</span>` : html`<span>chưa xác nhận mua</span>`}${e.helpful ? html`<span>helpful ${e.helpful}</span>` : ""}${e.variant ? html`<span title="Review của biến thể ${e.asin} — không gán thông số biến thể cho parent (AF-05)">variant ${e.asin}</span>` : ""}</div>
      ${e.title ? html`<p class="ev__title">${e.title}</p>` : ""}
      <p class="ev__text">${e.text}</p>
    </div>`;
  }
  const where = e.kind === "detail" ? `details · ${e.field}` : e.kind === "feature" ? "features" : "title";
  return html`<div class="ev ev--meta" data-evid="${e.id}"><span class="ev__id">${e.id}</span><div class="ev__meta"><span>${where}</span></div><p class="ev__text">${e.text}</p></div>`;
}

/** JSON có tô màu: khoá (cyan), chuỗi (xanh), số (cam), true/false/null (vàng). Mọi đoạn đều được thoát HTML. */
export function highlightJson(obj) {
  const s = JSON.stringify(obj, null, 2);
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    out += esc(s.slice(last, m.index));
    if (m[1]) out += m[2] ? `<span class="jk">${esc(m[1])}</span>${esc(m[2])}` : `<span class="js">${esc(m[1])}</span>`;
    else if (m[3]) out += `<span class="jb">${m[3]}</span>`;
    else out += `<span class="jn">${m[0]}</span>`;
    last = re.lastIndex;
  }
  return raw(out + esc(s.slice(last)));
}

export async function copyJson(id) {
  const p = api.cached(id);
  if (!p || !p.raw) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(p.raw, null, 2));
    toast("Đã copy bản ghi JSON.", { kind: "ok" });
  } catch (e) {
    toast("Trình duyệt chặn copy — chọn và copy thủ công trong khung JSON.", { kind: "warn" });
  }
}

/** Popover xem nhanh một nguồn trích dẫn (dùng ở báo cáo / hội thoại). */
export async function evidenceCard(pid, evId) {
  const p = await api.product(pid);
  const e = (p.evidence || []).find((x) => x.id === evId);
  if (!e) return html`<p class="muted">Không tìm thấy nguồn ${evId} của ${pid}. Trích dẫn trỏ tới nguồn không tồn tại phải bị loại (EF-03 UC-05).</p>`;
  return html`<div class="popover__head"><span class="kicker">${p.brand} ${p.model} · ${p.id}</span><span class="kicker">${SHORT[e.field] || ""}</span></div>
    ${evItem(p, e)}
    <p style="margin-top:10px"><a href="#/sp/${p.id}" data-action="open-evidence" data-pid="${p.id}" data-ev="${e.id}" class="kicker" style="color:var(--accent)">mở datasheet →</a></p>`;
}
