// UC-10 — Trace một lượt gọi agent: định danh, phiên bản nhu cầu / catalog, model, công cụ, token, độ trễ, trạng thái cuối.
// Số liệu lấy từ codebase/tracing.py (đo thật), không ước lượng.
import { state } from "../store.js";
import { api } from "../api.js";
import { html, render } from "../util.js";
import { icon } from "../icons.js";
import * as fmt from "../fmt.js";
import { openDrawer } from "../layers.js";
import { statePill } from "../parts.js";

export async function openTrace(msgId) {
  const m = state.agent.thread.find((x) => x.id === msgId);
  if (!m) return;
  const layer = openDrawer({ label: "Trace lượt gọi agent", kicker: "Trace · UC-10", narrow: true, body: html`<div class="skel" style="height:240px"></div>` });
  if (m.preview) {
    render(layer.body, html`<div class="notice notice--preview">${icon("info")}<div class="notice__title">Kịch bản minh họa không có trace</div>
      <div class="notice__body">Trace chỉ có khi câu hỏi chạy qua <span class="mono">codebase/agent.py</span> thật. Bước "nhật ký nghiên cứu" trong kịch bản là dữ liệu dựng sẵn.</div></div>`);
    return;
  }
  let t = { summary: m.trace, events: m.events || [], model: m.model, at: m.at };
  if (m.runId && !(m.events && m.events.length)) {
    try { t = await api.trace(m.runId); } catch (e) { /* server có thể đã khởi động lại — dùng phần đã lưu */ }
  }
  if (layer.closed) return;
  const s = t.summary || {};
  const p = m.payload || {};
  const ctx = p.context || state.agent.context;
  render(layer.body, html`
    <h2 class="pd__title" style="font-size:28px">${m.runId || "—"}</h2>
    <p class="pd__listing">Lượt gọi từ giao diện web. Không ghi vào <span class="mono">eval/</span> hay <span class="mono">traces/</span> — các file đó chỉ do <span class="mono">python run.py eval</span> tạo.</p>
    <div class="trace-sum">
      <div><span class="kicker">Gọi model</span><strong>${s.model_calls ?? 0}</strong></div>
      <div><span class="kicker">Công cụ</span><strong>${s.tool_calls ?? 0}</strong></div>
      <div><span class="kicker">Token vào / ra</span><strong>${fmt.int(s.tokens_in ?? 0)} / ${fmt.int(s.tokens_out ?? 0)}</strong></div>
      <div><span class="kicker">Độ trễ</span><strong>${fmt.seconds(s.latency_ms)}</strong></div>
    </div>
    <dl class="kv" style="margin-bottom:24px">
      <dt>session_id</dt><dd class="mono">${state.session.id}</dd>
      <dt>context_version</dt><dd class="mono">v${m.contextVersion ?? ctx.version ?? 0}</dd>
      <dt>catalog_version</dt><dd class="mono">${p.catalog_version || (state.health && state.health.catalog && state.health.catalog.version) || "—"}</dd>
      <dt>model_id</dt><dd class="mono">${(s.models || []).join(", ") || (m.model && (m.model.name || m.model.provider)) || "—"}${m.model && m.model.fake ? " (chế độ giả)" : ""}</dd>
      <dt>prompt_version</dt><dd class="mono">${p.prompt_version || "— (agent chưa trả)"}</dd>
      <dt>retry_count</dt><dd class="mono">${p.retry_count ?? "—"}</dd>
      <dt>validation</dt><dd>${p.validation ? html`<span class="mono">${JSON.stringify(p.validation)}</span>` : html`<span class="muted">agent chưa trả</span>`}</dd>
      <dt>final_status</dt><dd>${m.error ? html`<span class="mono" style="color:var(--err)">${m.error.type}</span>` : p.final_status ? html`<span class="mono">${p.final_status}</span> ${statePill(p.state)}` : html`<span class="muted">không có dữ liệu có cấu trúc</span>`}</dd>
      <dt>lỗi</dt><dd>${(s.errors && s.errors.length) ? s.errors.join("; ") : m.error ? m.error.message : html`<span class="muted">không</span>`}</dd>
    </dl>
    <header class="sec__head"><span class="sec__no">§</span><h3 class="sec__title">Sự kiện</h3><span class="sec__aside kicker">${(t.events || []).length} sự kiện</span></header>
    ${(t.events || []).length ? html`<table class="trace-events">
      <thead><tr><th>t</th><th>Loại</th><th>Tên</th><th>Vào / ra</th><th>ms</th></tr></thead>
      <tbody>${t.events.map((e) => html`<tr>
        <td>${e.t != null ? e.t.toFixed(2) : ""}</td>
        <td><span class="trace-kind trace-kind--${e.error ? "error" : e.kind}">${e.kind}</span></td>
        <td>${e.name || ""}${e.model ? html`<br><span class="muted">${e.model}</span>` : ""}</td>
        <td class="io">${e.kind === "model" ? html`${e.tokens_in || 0} → ${e.tokens_out || 0} token<br>` : ""}${e.error ? html`<span style="color:var(--err)">${e.error}</span>` : (e.output || e.text || e.input || "")}</td>
        <td>${e.latency_s != null ? Math.round(e.latency_s * 1000) : ""}</td></tr>`)}</tbody>
    </table>` : html`<p class="muted">Server không còn giữ sự kiện của lượt này (chỉ giữ 60 lượt gần nhất trong bộ nhớ).</p>`}
    ${m.output ? html`<header class="sec__head" style="margin-top:28px"><span class="sec__no">§</span><h3 class="sec__title">Output nguyên văn</h3></header><pre class="mono" style="white-space:pre-wrap;font-size:13px;background:var(--surface);border:1px solid var(--rule);padding:12px;border-radius:4px">${m.output}</pre>` : ""}
  `);
}
