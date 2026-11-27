// Agent console — UC-04 (mô tả & làm rõ nhu cầu), UC-05 (nghiên cứu & đề xuất), UC-07 (điều chỉnh), UC-08 (không có).
// Gọi answer() thật qua /api/agent. Kịch bản minh họa chỉ chạy khi người dùng bấm chọn, và luôn gắn nhãn "minh họa".
import { state, emit, save, emptyContext, lastAgentMessage } from "../store.js";
import { api } from "../api.js";
import { html, render, $, esc, raw, uid, announce, sleep, prefersReducedMotion } from "../util.js";
import { icon } from "../icons.js";
import { plate } from "../plates.js";
import * as fmt from "../fmt.js";
import { statePill, ctxChip, catLabel, segm } from "../parts.js";
import { SCENARIOS, FOLLOWUPS, scenario } from "../scenarios.js";
import { catalogParams } from "./catalog.js";
import { toast, openPopover, closePopovers } from "../layers.js";

const EXAMPLES = [
  { icon: "headphones", text: "Tai nghe Bluetooth dưới 1 triệu để học online" },
  { icon: "mouse", text: "Chuột không dây click êm cho dân văn phòng" },
  { icon: "keyboard", text: "Bàn phím cơ Bluetooth nhỏ gọn, dưới 1,2 triệu" },
];

const logOpen = new Map();
let ledgerOpen = null;
let howOpen = false;
let lastLedgerVersion = -1;
let tick = null;
const seenMsgs = new Set();
let firstThreadRender = true;

/* ───── Khung ───── */
export function mountAgent(el) {
  render(el, html`
    <header class="agent__head" data-agent-head></header>
    <div data-agent-ledger></div>
    <div class="thread" data-thread role="log" aria-live="polite" aria-relevant="additions" aria-label="Hội thoại với agent" tabindex="0"></div>
    <form class="composer" data-submit="ask" autocomplete="off">
      <div class="composer__scope" data-scope></div>
      <div class="composer__box">
        <label class="visually-hidden" for="ask-input">Mô tả nhu cầu cho trợ lý</label>
        <textarea id="ask-input" rows="1" maxlength="2000" placeholder="Mô tả nhu cầu của bạn…" aria-describedby="ask-hint"></textarea>
        <button class="send" type="submit" aria-label="Gửi cho trợ lý" disabled>${icon("arrow-up")}</button>
      </div>
      <p class="visually-hidden" id="ask-hint">Enter để gửi, Shift + Enter để xuống dòng.</p>
    </form>`);
  const ta = $("#ask-input", el);
  ta.addEventListener("input", () => { autosize(ta); syncSend(); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitComposer(); }
  });
  el.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.matches && d.matches("details.log")) logOpen.set(d.dataset.msg, d.open);
    if (d.matches && d.matches("details.ledger")) ledgerOpen = d.open;
    if (d.matches && d.matches("details.how")) howOpen = d.open;
  }, true);
  updateAgent();
}

function autosize(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(160, ta.scrollHeight) + "px";
}

function syncSend() {
  const ta = $("#ask-input");
  const btn = $(".composer .send");
  if (ta && btn) btn.disabled = !ta.value.trim() || state.busy;
}

export function submitComposer() {
  const ta = $("#ask-input");
  if (!ta) return;
  const text = ta.value.trim();
  if (!text || state.busy) return;
  ta.value = "";
  autosize(ta);
  send(text);
}

export function focusComposer(prefill) {
  openAgent();
  const ta = $("#ask-input");
  if (!ta) return;
  if (prefill != null) { ta.value = prefill; autosize(ta); }
  syncSend();
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
}

export function openAgent() {
  if (state.agentOpen) return;
  state.agentOpen = true;
  emit("agent-open");
}

export function closeAgent() {
  if (!state.agentOpen) return;
  state.agentOpen = false;
  emit("agent-open");
}

/* ───── Cập nhật từng vùng ───── */
export function updateAgent() {
  updateHead();
  updateLedger();
  updateThread();
  updateScope();
  syncSend();
}

export function updateHead() {
  const el = $("[data-agent-head]");
  if (!el) return;
  render(el, html`
    <div class="agent__id">
      <span class="agent__mark" aria-hidden="true">${icon("sparkles", { size: 18 })}</span>
      <div>
        <h2 class="agent__title">Trợ lý nghiên cứu</h2>
        <p class="agent__status">${headStatus()}</p>
      </div>
    </div>
    <div class="agent__head-tools">
      <button class="icon-btn icon-btn--sm" id="agent-menu-btn" data-action="agent-menu" aria-label="Tuỳ chọn trợ lý" aria-haspopup="dialog">${icon("more")}</button>
      <button class="icon-btn icon-btn--sm agent__close" data-action="close-agent" aria-label="Đóng trợ lý">${icon("x")}</button>
    </div>`);
}

/** Một dòng dưới tên trợ lý: đang chạy › model giả (bấm để mở kịch bản minh họa) › mất kết nối › tên model. */
function headStatus() {
  if (state.busy) return html`<span class="status-dot status-dot--busy"></span>Đang nghiên cứu…`;
  const m = state.health && state.health.model;
  if (m && m.fake) {
    return html`<button class="model-badge" id="agent-model-btn" data-action="agent-menu" aria-haspopup="dialog"
      title="MODEL_PROVIDER chưa đặt trong .env, codebase/ai.py đang trả output giả. Bấm để xem kịch bản minh họa.">${icon("alert", { size: 13 })}Chưa nối model${icon("chevron-down", { size: 13 })}</button>`;
  }
  if (state.healthError) return html`<span class="status-dot status-dot--err"></span>Mất kết nối máy chủ`;
  if (m) return html`<span class="status-dot status-dot--ok"></span><span class="agent__model" title="Model đang dùng">${m.name || m.provider}</span>`;
  return html`<span class="status-dot"></span>Đang kết nối…`;
}

function hasContext(c) {
  return c && (c.version > 0 || c.category || (c.hard || []).length || (c.soft || []).length || c.purpose);
}

export function updateLedger() {
  const el = $("[data-agent-ledger]");
  if (!el) return;
  const c = state.agent.context;
  const has = hasContext(c);
  const bumped = has && c.version > lastLedgerVersion && lastLedgerVersion >= 0;
  lastLedgerVersion = c.version || 0;
  // Chưa có nhu cầu thì không chiếm chỗ — sổ nhu cầu chỉ hiện khi trợ lý đã ghi được gì đó.
  if (!has) { render(el, ""); return; }
  const open = ledgerOpen == null ? window.innerHeight >= 1000 : ledgerOpen;
  const none = (t = "—") => html`<span class="none">${t}</span>`;
  const hard = (c.hard || []).length;
  const soft = (c.soft || []).length;
  render(el, html`<details class="ledger ${bumped ? "is-bumped" : ""}" ${open ? "open" : ""}>
    <summary><span class="ledger__label">Nhu cầu</span><span class="ledger__ver" title="Phiên bản nhu cầu (context_version)">v${c.version}</span><span class="ledger__sum">${c.category_label || "chưa rõ loại"} · ${hard} bắt buộc · ${soft} ưu tiên</span>${icon("chevron-down", { size: 15 })}</summary>
    <div class="ledger__body">
      <dl>
        <dt>Loại</dt><dd>${c.category_label ? html`<span class="chip chip--purpose">${c.category_label}</span>` : none("chưa rõ")}</dd>
        <dt>Bắt buộc</dt><dd>${hard ? c.hard.map((x, i) => ctxChip("hard", x, i, { removable: true })) : none()}</dd>
        <dt>Ưu tiên</dt><dd>${soft ? c.soft.map((x, i) => ctxChip("soft", x, i, { removable: true })) : none()}</dd>
        <dt>Mục đích</dt><dd>${c.purpose ? html`<span class="chip chip--purpose">${c.purpose}</span>` : none("chưa nêu")}</dd>
        ${(c.exclude || []).length ? html`<dt>Loại trừ</dt><dd>${c.exclude.map((x, i) => ctxChip("exclude", x, i, { removable: true }))}</dd>` : ""}
      </dl>
      <div class="ledger__foot">
        <span>${state.agent.dirty ? "Bạn đã sửa nhu cầu — kết quả cũ không còn áp dụng." : "Bắt buộc: không tự nới · Ưu tiên: chỉ để xếp hạng"}</span>
        ${state.agent.dirty ? html`<button class="btn btn--accent btn--sm" data-action="rerun" ${state.busy ? "disabled" : ""}>${icon("refresh", { size: 14 })} Chạy lại</button>` : ""}
      </div>
    </div>
  </details>`);
}

export function updateScope() {
  const el = $("[data-scope]");
  if (!el) return;
  const s = state.agent.scope || { type: "filtered" };
  let chip;
  if (s.type === "product" && s.id) {
    const p = api.cached(s.id);
    chip = html`<span class="scope-chip" title="Đang hỏi về sản phẩm ${s.id}">${icon("search", { size: 13 })}<span>${p ? `${p.brand} ${p.model}` : s.id}</span><button data-action="scope-reset" aria-label="Bỏ phạm vi sản phẩm, quay lại danh mục đang lọc">${icon("x", { size: 12 })}</button></span>`;
  } else if (s.type === "compare") {
    chip = html`<span class="scope-chip">${icon("columns", { size: 13 })}<span>So sánh ${state.compare.length} sản phẩm</span><button data-action="scope-reset" aria-label="Bỏ phạm vi so sánh">${icon("x", { size: 12 })}</button></span>`;
  } else {
    const d = state.catalog.data;
    chip = html`<span class="scope-chip scope-chip--plain" title="Trợ lý trả lời trong phạm vi danh mục đang lọc">${icon("filter", { size: 13 })}<span>${catLabel(state.category)}${d ? ` · ${d.total} sản phẩm` : ""}</span></span>`;
  }
  render(el, html`<span class="visually-hidden">Phạm vi câu hỏi:</span>${chip}`);
}

/* ───── Hội thoại ───── */
export function updateThread({ scroll = "auto" } = {}) {
  const el = $("[data-thread]");
  if (!el) return;
  const t = state.agent.thread;
  const hadMessages = el.dataset.count && el.dataset.count !== "0";
  const nearBottom = hadMessages && el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  const latestAgentId = (lastAgentMessage() || {}).id;
  render(el, html`${t.length ? t.map((m) => message(m, latestAgentId)) : intro()}${state.busy ? working() : ""}`);
  el.dataset.count = String(t.length);
  const ta = $("#ask-input");
  if (ta) ta.placeholder = t.length ? "Hỏi thêm hoặc chỉnh nhu cầu…" : "Mô tả nhu cầu của bạn…";
  // Hiệu ứng xuất hiện chỉ cho tin nhắn mới — tin cũ đứng yên khi vẽ lại.
  el.querySelectorAll(".msg[data-id]").forEach((n) => {
    if (!seenMsgs.has(n.dataset.id)) { if (!firstThreadRender) n.classList.add("msg--new"); seenMsgs.add(n.dataset.id); }
  });
  firstThreadRender = false;
  if (!t.length && !state.busy) {
    el.scrollTop = 0;
  } else if (scroll === "bottom" || (scroll === "auto" && nearBottom)) {
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() || scroll === "auto" ? "auto" : "smooth" });
  }
}

/* Màn trống: một câu hỏi, ba câu mẫu, ba cam kết. Chi tiết cách làm việc gập lại; kịch bản minh họa nằm trong menu
   (mở từ nhãn "Chưa nối model" hoặc nút ⋯), không chen vào đây. */
function intro() {
  return html`<div class="intro">
    <div>
      <h3 class="intro__title">Bạn đang cần mua gì?</h3>
      <p class="intro__lede">Mô tả nhu cầu, trợ lý chọn tối đa 3 sản phẩm kèm lý do và nguồn.</p>
    </div>
    <div class="intro__examples" role="group" aria-label="Câu hỏi mẫu">${EXAMPLES.map((e) => html`<button class="example" data-action="reply" data-text="${e.text}">
        <span class="example__icon" aria-hidden="true">${icon(e.icon, { size: 17 })}</span><span class="example__text">${e.text}</span>${icon("arrow-up", { size: 15, cls: "example__go" })}</button>`)}</div>
    <ul class="promises" aria-label="Cam kết của trợ lý">
      <li>${icon("shield", { size: 15 })}Có nguồn</li>
      <li>${icon("lock", { size: 15 })}Không tự nới điều kiện</li>
      <li>${icon("ban", { size: 15 })}Không đặt hàng</li>
    </ul>
    <details class="how" ${howOpen ? "open" : ""}>
      <summary>Trợ lý làm việc thế nào?${icon("chevron-down", { size: 14, cls: "chev" })}</summary>
      <ol>
        <li><span>Tách điều kiện bắt buộc và tiêu chí ưu tiên từ câu của bạn.</span></li>
        <li><span>Lọc danh mục, loại sản phẩm không đạt điều kiện bắt buộc.</span></li>
        <li><span>Đọc thông số và review làm bằng chứng. Thiếu nguồn thì ghi <span class="mono">UNKNOWN</span>, không đoán.</span></li>
        <li><span>Chấm độ phù hợp và tự kiểm tra rồi mới trả lời. Muốn nới điều kiện thì hỏi bạn trước.</span></li>
      </ol>
    </details>
  </div>`;
}

export function scenarioButtons() {
  return html`<div class="scenarios">${SCENARIOS.map((s) => html`<button class="scenario" data-action="play-scenario" data-key="${s.key}"><b>${s.label}</b><span>${s.st}</span></button>`)}</div>`;
}

function working() {
  return html`<div class="msg msg--agent msg--new" aria-hidden="true">
    <div class="working">
      <div class="working__row"><span>Đang nghiên cứu…</span><span data-elapsed>${fmt.elapsed(Date.now() - state.busySince)}</span></div>
      <div class="working__bar">${Array.from({ length: 24 }, (_, k) => html`<i style="--k:${k}"></i>`)}</div>
      <p class="working__note">Các bước thật sẽ hiện khi có kết quả, không giả tiến độ.</p>
    </div>
  </div>`;
}

function message(m, latestAgentId) {
  if (m.role === "user") {
    return html`<div class="msg msg--user" data-id="${m.id}">
      <p class="msg__body" title="${fmt.clock(m.at)}">${m.text}</p>
      ${m.preview ? html`<span class="msg__tag" title="Câu hỏi dựng sẵn của kịch bản minh họa">Minh họa</span>` : ""}
    </div>`;
  }
  if (m.role === "system") {
    return html`<div class="msg msg--system" data-id="${m.id}">${icon(m.icon || "edit")}<p class="line">${m.text}</p></div>`;
  }
  return agentMessage(m, m.id === latestAgentId);
}

function agentMessage(m, isLatest) {
  const p = m.payload || null;
  const code = m.error ? "ST-08" : p && p.state;
  const recs = (p && p.recommendations) || [];
  const stale = recs.length && (m.contextVersion || 0) < (state.agent.context.version || 0);
  const fakeText = !p && m.model && m.model.fake && !m.error;
  const prose = (p && p.message) || m.output || "";
  return html`<article class="msg msg--agent ${stale ? "msg--stale" : ""}" data-id="${m.id}">
    <div class="msg__meta">
      ${code ? statePill(code, { withCode: false }) : ""}<span>${fmt.clock(m.at)}</span>
      ${m.preview ? html`<span class="msg__tag" title="Payload dựng sẵn, không phải AI, không có trace">Minh họa</span>` : ""}
      ${stale ? html`<span class="stale-tag" title="Kết quả theo nhu cầu v${m.contextVersion}, nhu cầu hiện là v${state.agent.context.version}">Nhu cầu đã đổi</span>` : ""}
    </div>
    ${m.error ? errorBlock(m.error) : ""}
    ${p && p.error ? errorBlock(p.error, true) : ""}
    ${prose ? html`<div class="msg__prose"><p>${prose}</p></div>` : ""}
    ${fakeText ? html`<div class="notice notice--preview">${icon("info")}<div class="notice__title">Output giả, chưa nối model</div><div class="notice__body">Nối model theo <span class="mono">docs/connect-model.md</span>. Để vẽ Top 3, agent trả thêm khoá <span class="mono">smartbuy</span> (xem <span class="mono">frontend/README.md</span>).</div></div>` : ""}
    ${p && p.plan && p.plan.length ? planLog(p.plan, m, isLatest && !recs.length) : (m.events && m.events.length ? traceLog(m) : "")}
    ${p && p.clarify ? clarify(p.clarify, m, isLatest) : ""}
    ${p && p.no_match ? noMatch(p.no_match) : ""}
    ${p && p.pending_change ? slip(p.pending_change, m, isLatest) : ""}
    ${recs.length ? recList(recs) : ""}
    ${p && p.limits && p.limits.length && !recs.length ? html`<ul class="rules">${p.limits.map((l) => html`<li>${icon("alert")}<span>${l}</span></li>`)}</ul>` : ""}
    ${p && p.next_actions && p.next_actions.length && isLatest ? nextActions(p.next_actions, m) : ""}
    ${foot(m)}
  </article>`;
}

function errorBlock(err, fromPayload = false) {
  const title = {
    NOT_CONNECTED: "Chưa nối model",
    AGENT_ERROR: "Agent gặp lỗi khi chạy",
    LOAD_ERROR: "Không nạp được codebase/",
    CONTRACT: "answer() trả sai hợp đồng",
    NETWORK: "Mất kết nối máy chủ",
    TIMEOUT: "Quá thời gian chờ",
    TOOL_ERROR: "Lỗi công cụ" + (err.tool ? ` ${err.tool}` : ""),
  }[err.type] || "Không thể xử lý";
  return html`<div class="notice notice--err" role="alert">${icon("alert")}
    <div class="notice__title">${title} <span class="notice__code">${err.type || "ERROR"}</span></div>
    <div class="notice__body">${err.message || ""}${err.retry_count ? ` (retry ${err.retry_count})` : ""}.${fromPayload ? "" : html` <b>Lỗi hệ thống — không có nghĩa là không có sản phẩm phù hợp.</b>`} Danh mục và bộ lọc vẫn dùng được.</div>
    ${fromPayload ? "" : html`<div class="notice__actions"><button class="btn btn--sm btn--accent" data-action="retry-last">${icon("refresh", { size: 14 })} Thử lại</button><button class="btn btn--sm btn--ghost" data-action="browse-catalog">Tự duyệt danh mục</button></div>`}
  </div>`;
}

/** Tô màu tham số kiểu lời gọi hàm: chuỗi (xanh), số (cam), còn lại xám. */
function argsHtml(args) {
  if (!args) return "";
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(-?\b\d+(?:[.,]\d+)?\b)/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(args))) {
    out += esc(args.slice(last, m.index));
    out += m[1] ? `<span class="str">${esc(m[1])}</span>` : `<span class="nm">${esc(m[2])}</span>`;
    last = re.lastIndex;
  }
  return raw(out + esc(args.slice(last)));
}

const MARK = { done: "✓", warn: "!", error: "✗", skip: "–" };
const sec2 = (ms) => (ms / 1000).toFixed(2);

function planLog(plan, m, defaultOpen) {
  const total = plan.reduce((a, s) => a + (s.ms || 0), 0);
  const open = logOpen.has(m.id) ? logOpen.get(m.id) : defaultOpen;
  const flag = plan.some((s) => s.status === "error") ? "error" : plan.some((s) => s.status === "warn") ? "warn" : "";
  let t = 0;
  return html`<details class="log" data-msg="${m.id}" ${open ? "open" : ""}>
    <summary>${icon("activity")}<span>Quá trình · ${plan.length} bước · ${fmt.seconds(total)}</span>${flag ? html`<span class="log__flag log__flag--${flag}">${flag === "error" ? "có lỗi" : "có cảnh báo"}</span>` : ""}${icon("chevron-down", { cls: "chev" })}</summary>
    <ol>${plan.map((s, i) => {
      t += s.ms || 0;
      const st = s.status || "done";
      return html`<li class="is-${st}" style="--i:${i}">
        <span class="t">${sec2(t)}</span><span class="mk" aria-hidden="true">${MARK[st] || "✓"}</span>
        <span class="ln">${s.tool ? html`<span class="fn">${s.tool}</span>(<span class="ar">${argsHtml(s.args)}</span>) ` : ""}<span class="lbl">${s.label}</span>${s.detail ? html`<span class="detail">${s.detail}</span>` : ""}
          <span class="visually-hidden">${{ done: "xong", warn: "cảnh báo", error: "lỗi", skip: "bỏ qua" }[st]}</span></span>
      </li>`;
    })}</ol>
  </details>`;
}

function traceLog(m) {
  const ev = m.events || [];
  const open = logOpen.has(m.id) ? logOpen.get(m.id) : false;
  return html`<details class="log" data-msg="${m.id}" ${open ? "open" : ""}>
    <summary>${icon("activity")}<span>Trace · ${ev.length} sự kiện · ${fmt.seconds(m.trace && m.trace.latency_ms)}</span>${icon("chevron-down", { cls: "chev" })}</summary>
    <ol>${ev.map((e, i) => {
      const st = e.error ? "error" : "done";
      const fn = e.kind === "model" ? (e.name || "call_model") : e.kind === "tool" ? e.name : "note";
      const args = e.kind === "model" ? `model="${e.model || ""}", in=${e.tokens_in || 0}, out=${e.tokens_out || 0}` : "";
      const detail = e.error || (e.kind === "model" ? e.output : e.output || e.text) || "";
      return html`<li class="is-${st}" style="--i:${i}">
        <span class="t">${e.t != null ? e.t.toFixed(2) : ""}</span><span class="mk" aria-hidden="true">${MARK[st]}</span>
        <span class="ln"><span class="fn">${fn}</span>(<span class="ar">${argsHtml(args)}</span>)${detail ? html`<span class="detail">${String(detail).slice(0, 200)}</span>` : ""}</span>
      </li>`;
    })}</ol>
  </details>`;
}

function clarify(c, m, isLatest) {
  return html`<div class="ask">
    <p class="ask__q">${c.question}</p>
    <div class="ask__opts">${(c.options || []).map((o) => {
      const label = typeof o === "string" ? o : o.label;
      const text = typeof o === "string" ? o : (o.text || o.label);
      return html`<button class="chip chip--option" data-action="reply" data-text="${text}" data-next="${m.preview && o.next ? o.next : ""}" ${isLatest && !state.busy ? "" : "disabled"}>${label}</button>`;
    })}</div>
    ${c.hint ? html`<p class="ask__hint">${c.hint}</p>` : ""}
  </div>`;
}

function noMatch(nm) {
  return html`<div class="notice">${icon("search")}
    <div class="notice__title">Vì sao chưa có lựa chọn phù hợp</div>
    <div class="notice__body"><ul style="margin:4px 0 0 16px;display:grid;gap:4px">${(nm.findings || []).map((f) => html`<li>${f}</li>`)}</ul></div>
  </div>`;
}

/** Phiếu đề xuất điều chỉnh (pending_change). BR-ST-05: không áp dụng gì cho tới khi người dùng chọn. */
function slip(pc, m, isLatest) {
  const r = m.resolved;
  return html`<div class="slip ${r ? "is-resolved" : ""}" aria-label="${pc.title || "Đề xuất điều chỉnh"}">
    <div class="slip__head" title="${pc.id || ""}"><span class="slip__label">${icon("edit", { size: 13 })} Cần bạn duyệt</span></div>
    ${r ? html`<p class="slip__resolved">${icon("check", { size: 14 })} đã chọn: ${r.label}</p>`
      : html`<div class="slip__opts">${(pc.options || []).map((o) => html`<button class="opt ${o.kind === "keep" ? "opt--keep" : ""}" data-action="choose-change" data-msg="${m.id}" data-key="${o.key}" ${isLatest && !state.busy ? "" : "disabled"}>
            <span class="opt__title">${o.title}</span>
            ${o.diff ? html`<span class="opt__diff">${o.diff.field}: <del>${o.diff.from}</del> ${icon("arrow-right")} <ins>${o.diff.to}</ins></span>` : ""}
            ${o.note ? html`<span class="opt__note">${o.note}</span>` : ""}
            ${icon("chevron-right")}
          </button>`)}</div>
        <p class="ask__hint">Chưa có gì thay đổi cho tới khi bạn chọn.</p>`}
  </div>`;
}

function recList(recs) {
  return html`<div class="rec-list">${recs.map((r) => {
      const p = api.cached(r.id);
      const why = r.reasons && r.reasons[0] ? (typeof r.reasons[0] === "string" ? r.reasons[0] : r.reasons[0].text) : "";
      const S = r.score && r.score.S;
      return html`<button class="rec" data-action="open-report" data-focus="${r.id}" aria-label="Lựa chọn ${r.rank}: ${p ? p.brand + " " + p.model : r.id}, ${fmt.score(S)} điểm. Mở báo cáo">
        <span class="rec__rank" aria-hidden="true">${String(r.rank).padStart(2, "0")}</span>
        ${p ? plate(p, { variant: "thumb" }) : html`<span class="plate plate--thumb skel"></span>`}
        <span style="min-width:0"><span class="rec__name">${p ? `${p.brand} ${p.model}` : r.id}</span><span class="rec__why">${why}</span></span>
        <span class="rec__score">${fmt.score(S)}${segm(S, { n: 10, accent: r.rank === 1 })}</span>
      </button>`;
    })}</div>
    <div class="msg__actions">
      <button class="btn btn--accent btn--sm" data-action="open-report">${icon("report", { size: 14 })} Mở báo cáo</button>
      <button class="btn btn--sm" data-action="compare-recs" data-ids="${recs.map((r) => r.id).join(",")}">${icon("columns", { size: 14 })} So sánh</button>
    </div>`;
}

function nextActions(list, m) {
  return html`<div class="msg__actions" aria-label="Gợi ý bước tiếp">${list.map((a) => {
    if (a.action) {
      return html`<button class="chip chip--option" data-action="${a.action}" data-id="${a.id || ""}" data-ids="${a.action === "compare-recs" ? ((m.payload.recommendations || []).map((r) => r.id).join(",")) : ""}" ${state.busy ? "disabled" : ""}>${a.label}</button>`;
    }
    return html`<button class="chip chip--option" data-action="reply" data-text="${a.text || a.label}" data-next="${m.preview && a.next ? a.next : ""}" ${state.busy ? "disabled" : ""}>${a.label}</button>`;
  })}</div>`;
}

/** Chân tin nhắn thật: thời gian + token, chi tiết lượt gọi nằm trong tooltip và trang trace.
 *  Tin minh họa không có chân — nhãn "Minh họa" ở dòng meta đã nói rõ là không có trace. */
function foot(m) {
  const t = m.trace;
  if (m.preview || !m.runId) return "";
  return html`<div class="msg__foot">
    ${t ? html`<span title="${m.runId} · ${t.model_calls} lượt gọi model · ${t.tool_calls} lượt gọi công cụ">${fmt.seconds(t.latency_ms)} · ${t.tokens_in}→${t.tokens_out} token</span>` : html`<span>${m.runId}</span>`}
    <button data-action="open-trace" data-msg="${m.id}">Xem trace</button>
  </div>`;
}

/* ───── Gửi & nhận ───── */
function push(msg) {
  state.agent.thread.push({ id: uid("M-"), at: Date.now(), ...msg });
  return state.agent.thread[state.agent.thread.length - 1];
}

function setBusy(v) {
  state.busy = v;
  state.busySince = v ? Date.now() : 0;
  clearInterval(tick);
  if (v) {
    tick = setInterval(() => {
      const el = $("[data-elapsed]");
      if (el) el.textContent = fmt.elapsed(Date.now() - state.busySince);
    }, 100);
  }
}

function sameContext(a, b) {
  const strip = (c) => JSON.stringify({ ...c, version: 0 });
  return strip(a || {}) === strip(b || {});
}

function applyContext(ctx) {
  if (!ctx) return;
  const cur = state.agent.context;
  const changed = !sameContext({ ...emptyContext(), ...ctx }, cur);
  const version = changed ? Math.max(ctx.version || 0, (cur.version || 0) + 1) : cur.version;
  state.agent.context = { ...emptyContext(), ...ctx, version };
  state.agent.dirty = false;
}

export function buildContext() {
  const t = state.agent.thread.filter((m) => m.role !== "system").slice(-8);
  return {
    session_id: state.session.id,
    shopping_context: state.agent.context,
    scope: state.agent.scope,
    category: state.category,
    filters: catalogParams(),
    compare_ids: state.compare.slice(),
    history: t.map((m) => ({ role: m.role, text: m.role === "user" ? m.text : ((m.payload && m.payload.message) || m.output || "") })),
  };
}

async function afterAgentMessage(msg) {
  const recs = (msg.payload && msg.payload.recommendations) || [];
  if (recs.length) {
    try { await api.products(recs.map((r) => r.id)); } catch (e) { /* báo cáo sẽ tự báo lỗi */ }
    updateThread();
    toast(`Báo cáo đã sẵn sàng · ${recs.length} lựa chọn.`, { actionLabel: "Mở", onAction: () => { location.hash = "#/bao-cao"; }, kind: "ok" });
  }
  const st = msg.error ? "ST-08" : msg.payload && msg.payload.state;
  announce(st === "ST-08" ? "Agent gặp lỗi, không có nghĩa là không có sản phẩm" : recs.length ? `Agent đề xuất ${recs.length} lựa chọn` : "Agent đã trả lời");
}

export async function send(text, { preview = false, payload = null, extra = {} } = {}) {
  text = String(text || "").trim();
  if (!text || state.busy) return;
  if (!hasContext(state.agent.context) && !state.agent.needText) state.agent.needText = text;
  push({ role: "user", text, preview });
  setBusy(true);
  save();
  emit("agent");
  updateThread({ scroll: "bottom" });

  let msg;
  if (preview) {
    await sleep(prefersReducedMotion() ? 200 : 1100);
    applyContext(payload.context);
    msg = push({ role: "agent", preview: true, payload, request: state.agent.needText || text, contextVersion: state.agent.context.version });
  } else {
    try {
      const res = await api.agent(text, { ...buildContext(), ...extra });
      const p = res.smartbuy || null;
      if (p && p.context) applyContext(p.context);
      msg = push({
        role: "agent", runId: res.run_id, output: res.output, payload: p, trace: res.trace, events: res.events,
        model: res.model, error: res.error, request: state.agent.needText || text, contextVersion: state.agent.context.version,
      });
    } catch (e) {
      msg = push({ role: "agent", error: { type: e.type, message: e.message }, request: text, contextVersion: state.agent.context.version });
    }
  }
  setBusy(false);
  save();
  emit("agent", "report-data");
  updateThread({ scroll: "bottom" });
  afterAgentMessage(msg);
}

export function playScenario(key) {
  const s = scenario(key);
  if (!s || state.busy) return;
  closePopovers();
  openAgent();
  // Kịch bản mới = nhu cầu mới, không trộn với nhu cầu đang có; phiên bản nhu cầu chỉ tăng.
  state.agent.context = { ...emptyContext(), version: state.agent.context.version || 0 };
  state.agent.needText = s.user;
  send(s.user, { preview: true, payload: s.response });
}

export function reply(text, next) {
  if (next && FOLLOWUPS[next]) return send(text, { preview: true, payload: FOLLOWUPS[next] });
  return send(text);
}

export function chooseChange(msgId, key) {
  const m = state.agent.thread.find((x) => x.id === msgId);
  if (!m || !m.payload || !m.payload.pending_change || m.resolved) return;
  const pc = m.payload.pending_change;
  const o = (pc.options || []).find((x) => x.key === key);
  if (!o) return;
  m.resolved = { key, label: o.title };
  if (m.preview && o.next && FOLLOWUPS[o.next]) return send(o.text || o.title, { preview: true, payload: FOLLOWUPS[o.next] });
  return send(o.text || o.title, { extra: { pending_change: { id: pc.id, choice: key } } });
}

export function retryLast() {
  const t = state.agent.thread;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i].role === "user") return send(t[i].text);
  }
}

/** BR-CTX-12: người dùng bỏ một tiêu chí → nhu cầu lên phiên bản mới, kết quả cũ thành "stale" (BR-ST-06). */
export function removeCriterion(kind, idx) {
  const c = state.agent.context;
  const list = c[kind];
  if (!Array.isArray(list) || !list[idx]) return;
  const item = list[idx];
  const label = typeof item === "string" ? item : item.label;
  state.agent.context = { ...c, [kind]: list.filter((_, i) => i !== idx), version: (c.version || 0) + 1 };
  if (kind === "hard" && item.key === "price") state.agent.context.budget = null;
  state.agent.dirty = true;
  const what = { hard: "điều kiện bắt buộc", soft: "tiêu chí ưu tiên", exclude: "điều kiện loại trừ" }[kind];
  push({ role: "system", icon: "edit", text: `Nhu cầu v${state.agent.context.version}: đã bỏ ${what} “${label}”. Kết quả trước không còn áp dụng.` });
  save();
  emit("agent", "report-data");
  updateThread({ scroll: "bottom" });
}

export function rerun() {
  const c = state.agent.context;
  const parts = [c.category_label, ...(c.hard || []).map((h) => h.label), ...(c.soft || []).map((s) => "ưu tiên " + s.label), c.purpose].filter(Boolean);
  send(`Tìm lại theo nhu cầu đã cập nhật (v${c.version}): ${parts.join(", ")}`);
}

export function askAboutProduct(id) {
  const p = api.cached(id);
  state.agent.scope = { type: "product", id };
  save();
  updateScope();
  focusComposer(`${p ? p.brand + " " + p.model : id} có hợp với nhu cầu của mình không?`);
}

export function askCompare(names) {
  state.agent.scope = { type: "compare", ids: state.compare.slice() };
  save();
  updateScope();
  focusComposer(`So sánh và phân tích đánh đổi giữa ${names} cho nhu cầu của mình.`);
}

export function resetScope() {
  state.agent.scope = { type: "filtered" };
  save();
  updateScope();
}

export function clearThread() {
  state.agent.thread = [];
  state.agent.needText = null;
  save();
  emit("agent", "report-data");
}

export function agentMenu(anchor) {
  const last = [...state.agent.thread].reverse().find((m) => m.role === "agent" && m.runId);
  openPopover(anchor, html`<div class="menu" role="menu">
      <p class="kicker" style="padding:6px 10px 2px">Kịch bản minh họa</p>
      <p class="muted">Dữ liệu dựng sẵn để xem đủ trạng thái giao diện, không phải AI.</p>
      ${scenarioButtons()}
      <hr>
      ${last ? html`<button role="menuitem" data-action="open-trace" data-msg="${last.id}">${icon("activity", { size: 15 })} Trace lượt gần nhất</button>` : ""}
      <button role="menuitem" data-action="clear-thread">${icon("trash", { size: 15 })} Xoá hội thoại, giữ nhu cầu</button>
      <button role="menuitem" data-action="new-session">${icon("rotate", { size: 15 })} Bắt đầu phiên mới</button>
    </div>`, { cls: "menu-pop", label: "Tuỳ chọn agent" });
}
