// UC-05 — Báo cáo tư vấn (test report): tối đa 3 đề xuất, mỗi đề xuất có điều kiện bắt buộc, lý do có nguồn, đánh đổi,
// điều còn thiếu, giới hạn, điểm S = 0,70F + 0,20Q + 0,10E. Kết quả của nhu cầu cũ bị đánh dấu "đã cũ" (BR-ST-06).
import { state, latestReport } from "../store.js";
import { api } from "../api.js";
import { html, render } from "../util.js";
import { icon } from "../icons.js";
import { plate } from "../plates.js";
import * as fmt from "../fmt.js";
import { meter, contextChips, statePill, emptyState, errorNotice } from "../parts.js";

let seq = 0;

export async function mountReport(stage, { focusId } = {}) {
  const msg = latestReport();
  if (!msg) {
    delete stage.dataset.report;
    render(stage, html`<header class="page-head"><span class="kicker"><span class="slash">//</span> 02 report</span>
      <h1 class="page-head__title">Chưa có báo cáo.</h1>
      <p class="page-head__deck">Giao nhu cầu cho agent: loại sản phẩm, ngân sách, dùng vào việc gì. Báo cáo có tối đa 3 lựa chọn, điểm S, lý do, đánh đổi và nguồn cho từng nhận định.</p></header>
      ${emptyState({ title: "Bắt đầu từ một câu", body: html`Ví dụ: <span class="mono">› tai nghe bluetooth dưới 1 triệu để học online, ưu tiên đeo thoải mái</span>`, actions: html`<button class="btn btn--accent" data-action="focus-agent">${icon("terminal", { size: 15 })} Mở agent</button>` })}`);
    return;
  }
  const p = msg.payload;
  const ids = p.recommendations.map((r) => r.id);
  const my = ++seq;
  // Vẽ lại cùng một báo cáo (vd bấm "so sánh"): không nháy khung xương, không chạy lại hiệu ứng.
  const key = msg.id + "|" + (state.agent.context.version || 0);
  const same = stage.dataset.report === key;
  stage.dataset.report = key;
  const allCached = ids.every((id) => { const c = api.cached(id); return c && c.evidence; });
  if (!allCached) render(stage, html`${header(msg)}<div class="skel" style="height:360px;margin-top:24px"></div>`);
  try {
    const { items, missing } = await api.products(ids);
    if (my !== seq || state.view !== "report") return;
    const byId = Object.fromEntries(items.map((x) => [x.id, x]));
    const y = window.scrollY;
    render(stage, html`<article class="report ${same ? "no-anim" : ""}">
      ${header(msg)}
      ${method(p)}
      ${p.limits && p.limits.length ? html`<div class="notice notice--warn" style="margin-top:12px">${icon("alert")}<div class="notice__title">Giới hạn của kết quả</div><div class="notice__body">${p.limits.join(" ")}</div></div>` : ""}
      ${missing.length ? html`<div class="notice notice--err" style="margin-top:12px">${icon("alert")}<div class="notice__title">Đã chặn ${missing.length} ID không có trong catalog công bố</div><div class="notice__body"><span class="mono">${missing.join(", ")}</span> — không hiển thị sản phẩm không tồn tại (EX-10).</div></div>` : ""}
      <div class="entries">${p.recommendations.filter((r) => byId[r.id]).map((r, i) => entry(r, byId[r.id], i))}</div>
      ${excluded(p)}
      <footer class="report-foot">
        <p>// SmartBuy chỉ tư vấn — quyết định mua là của bạn.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn--sm" data-action="compare-recs" data-ids="${ids.join(",")}">${icon("columns", { size: 14 })} diff các lựa chọn</button>
          ${msg.runId ? html`<button class="btn btn--quiet btn--sm" data-action="open-trace" data-msg="${msg.id}">${icon("activity", { size: 14 })} trace</button>` : ""}
        </div>
      </footer>
    </article>`);
    if (focusId) {
      const el = stage.querySelector(`[data-entry="${CSS.escape(focusId)}"]`);
      if (el) el.scrollIntoView({ block: "start" });
    } else if (same) {
      window.scrollTo({ top: y });
    }
  } catch (e) {
    if (my !== seq) return;
    render(stage, html`${header(msg)}${errorNotice(e, { retry: html`<button class="btn btn--sm btn--accent" data-action="reload-report">Thử lại</button>` })}`);
  }
}

function header(msg) {
  const p = msg.payload;
  const ctx = p.context || {};
  const cur = state.agent.context.version || 0;
  const stale = (msg.contextVersion || 0) < cur;
  const n = p.recommendations.length;
  return html`<header class="page-head" style="margin-bottom:0">
    <div class="page-head__row"><span class="kicker"><span class="slash">//</span> 02 report · ctx v${msg.contextVersion || ctx.version || 1}</span>${statePill(p.state)}</div>
    <h1 class="report__title"><q>${msg.request || "Nhu cầu của bạn"}</q></h1>
    <div class="report__ctx">${contextChips(ctx)}</div>
    <p class="report__meta">
      <span><b>${n}</b> pick${n < 3 ? " — không thêm sản phẩm sai điều kiện cho đủ 3" : ""}</span>
      <span>catalog ${p.catalog_version || (state.health && state.health.catalog && state.health.catalog.version) || "—"}</span>
      ${msg.runId ? html`<span>run ${msg.runId}</span>` : ""}
      <span>${fmt.clock(msg.at)}</span>
    </p>
    ${msg.preview ? html`<div class="notice notice--preview stale-banner">${icon("info")}<div class="notice__title">Báo cáo minh họa</div><div class="notice__body">Payload dựng sẵn để xem giao diện — không phải output của AI. Số liệu sản phẩm lấy từ catalog demo.</div></div>` : ""}
    ${stale ? html`<div class="notice notice--warn stale-banner" role="status">${icon("alert")}<div class="notice__title">Nhu cầu đã đổi (v${cur}) — báo cáo này dành cho v${msg.contextVersion}</div>
      <div class="notice__body">Kết quả cũ không được coi là kết quả của nhu cầu mới (BR-ST-06).</div>
      <div class="notice__actions"><button class="btn btn--sm btn--accent" data-action="rerun">${icon("refresh", { size: 14 })} Chạy lại với v${cur}</button></div></div>` : ""}
  </header>`;
}

function method(p) {
  return html`<div class="method">${icon("info")}
    <div>rank = <code>S = 0.70·F + 0.20·Q + 0.10·E</code> — trọng số đề xuất, chưa hiệu chỉnh.
      <details><summary>F, Q, E là gì ${icon("chevron-down", { size: 13 })}</summary>
        <ul>
          <li><b>F · fit</b> (0 / 50 / 100): model chấm theo rubric, dựa trên nguồn, so với tiêu chí ưu tiên và mục đích.</li>
          <li><b>Q · quality</b>: <span class="mono">average_rating</span> hiệu chỉnh Bayes theo <span class="mono">rating_number</span> (m = 20) — backend tính, không do AI.</li>
          <li><b>E · evidence</b>: tỉ lệ tiêu chí có nguồn để kiểm.</li>
          <li>Không có tiêu chí ưu tiên / mục đích → xếp theo Q và ghi rõ.</li>
        </ul>
      </details>
    </div></div>`;
}

function cites(pid, list) {
  return (list || []).map((ev) => html`<button class="cite" data-action="cite" data-pid="${pid}" data-ev="${ev}" aria-label="Xem nguồn ${ev}">${ev}</button>`);
}

function textItem(pid, x) {
  if (typeof x === "string") return html`<li>${x}</li>`;
  return html`<li>${x.text} ${cites(pid, x.evidence)}</li>`;
}

function entry(r, prod, i) {
  const s = r.score || {};
  const qOnly = s.F == null;
  const top = i === 0;
  const rank = String(r.rank || i + 1).padStart(2, "0");
  return html`<section class="entry ${top ? "entry--top" : ""}" style="--i:${i}" data-entry="${r.id}" aria-labelledby="e-${r.id}">
    <div class="entry__rank" aria-label="Hạng ${r.rank || i + 1}"><span class="led-num" aria-hidden="true">${rank}</span>${top ? html`<span class="top-tag">top pick</span>` : ""}</div>
    <div>
      <div class="entry__head">
        ${plate(prod)}
        <div>
          <p class="kicker">${prod.brand} · ${prod.id}</p>
          <h2 class="entry__name" id="e-${r.id}"><a href="#/sp/${prod.id}">${prod.model}</a></h2>
          <div class="entry__price">
            ${prod.price_vnd != null ? html`<span class="price__vnd">≈ ${fmt.vnd(prod.price_vnd)}</span>` : html`<span class="muted mono">price: null</span>`}
            <span class="stars">${icon("star")}${fmt.rating(prod.rating)} · ${fmt.int(prod.rating_number)}</span>
          </div>
        </div>
      </div>
      ${r.hard_results && r.hard_results.length ? html`<div class="hardchecks" aria-label="Điều kiện bắt buộc">${r.hard_results.map((h) => {
        const ok = h.result === "MATCH";
        const unk = h.result === "UNKNOWN";
        return html`<span class="hc ${ok ? "" : unk ? "hc--unknown" : "hc--fail"}">${icon(ok ? "check" : unk ? "help" : "x")}${h.label}${h.evidence && h.evidence.length ? html` ${cites(prod.id, h.evidence)}` : ""}</span>`;
      })}</div>` : ""}
      <div class="points">
        ${r.reasons && r.reasons.length ? html`<div class="why"><h4 class="kicker kicker--ink">+ vì sao hợp</h4><ul>${r.reasons.map((x) => textItem(prod.id, x))}</ul></div>` : ""}
        ${r.tradeoffs && r.tradeoffs.length ? html`<div class="trade"><h4 class="kicker kicker--ink">− đánh đổi</h4><ul>${r.tradeoffs.map((x) => textItem(prod.id, x))}</ul></div>` : ""}
        ${r.missing && r.missing.length ? html`<div class="miss"><h4 class="kicker kicker--ink">? chưa xác minh</h4><ul>${r.missing.map((x) => textItem(prod.id, x))}</ul></div>` : ""}
        ${r.limits && r.limits.length ? html`<div class="lim"><h4 class="kicker">· giới hạn</h4><ul>${r.limits.map((x) => textItem(prod.id, x))}</ul></div>` : ""}
      </div>
      <div class="entry__actions">
        <a class="btn btn--sm" href="#/sp/${prod.id}">${icon("book", { size: 14 })} datasheet</a>
        <button class="btn btn--sm" data-action="toggle-compare" data-id="${prod.id}" aria-pressed="${state.compare.includes(prod.id) ? "true" : "false"}">${icon(state.compare.includes(prod.id) ? "check" : "plus", { size: 14 })} ${state.compare.includes(prod.id) ? "đã chọn so sánh" : "so sánh"}</button>
        <button class="btn btn--quiet btn--sm" data-action="ask-product" data-id="${prod.id}">${icon("terminal", { size: 14 })} hỏi tiếp</button>
      </div>
    </div>
    <aside class="scorecard" aria-label="Điểm xếp hạng ${prod.brand} ${prod.model}: ${fmt.score(s.S)} trên 100">
      <span class="kicker">score</span>
      <div class="scorecard__total"><span class="led-num" aria-hidden="true">${fmt.score(s.S)}</span><span>/ 100</span></div>
      <div style="display:grid;gap:11px">
        ${meter("F", "fit", "0.70", s.F, { accent: top })}
        ${meter("Q", "quality", "0.20", s.Q)}
        ${meter("E", "evidence", "0.10", s.E)}
      </div>
      <p class="scorecard__formula">${qOnly ? "không có tiêu chí ưu tiên → xếp theo Q" : `0.70×${fmt.score(s.F)} + 0.20×${fmt.score(s.Q)} + 0.10×${fmt.score(s.E)}`}</p>
    </aside>
  </section>`;
}

function excluded(p) {
  const ex = p.excluded || [];
  if (!ex.length) return "";
  return html`<details class="excluded">
    <summary>${icon("chevron-right", { size: 14 })} excluded: ${ex.length} sản phẩm bị loại — và vì sao</summary>
    <table><tbody>${ex.map((x) => html`<tr><td>${x.id}</td><td><a href="#/sp/${x.id}">${x.name || x.id}</a></td><td>${x.reason}</td></tr>`)}</tbody></table>
  </details>`;
}
