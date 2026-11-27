// Bộ icon nét (stroke 1.75, đầu tròn) — một họ duy nhất cho toàn app. Không dùng emoji làm icon.
import { raw, esc } from "./util.js";

const P = {
  user: '<circle cx="12" cy="12" r="9.3"/><circle cx="12" cy="9" r="2.8"/><path d="M6.4 18.9a5.8 5.8 0 0 1 11.2 0"/>',
  wallet: '<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6"/><path d="M20 12h-4a2 2 0 0 0 0 4h4M16 14h.01"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "arrow-right": '<path d="M5 12h14M13 5l7 7-7 7"/>',
  "arrow-up": '<path d="M12 19V5M5 12l7-7 7 7"/>',
  "arrow-up-right": '<path d="M7 17 17 7M8 7h9v9"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4.5M12 8h.01"/>',
  help: '<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.2a3 3 0 0 1 5.6 1.3c0 2-3 2.5-3 4M12 17.5h.01"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1L20.5 8.5"/><path d="M20.5 3.5v5h-5"/>',
  rotate: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
  star: '<path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M15 4v16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 13.4A8.5 8.5 0 1 1 10.6 3.5a6.6 6.6 0 0 0 9.9 9.9Z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  message: '<path d="M20.5 14.5a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/>',
  report: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h4.5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
  activity: '<path d="M21.5 12h-4l-3 8.5-5-17-3 8.5h-4"/>',
  shield: '<path d="M12 21.5s7.5-3.6 7.5-9.5V5.5L12 2.5l-7.5 3v6.5c0 5.9 7.5 9.5 7.5 9.5Z"/><path d="m9 12 2 2 4-4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="2.8"/><path d="M4 5v14c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5"/><path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"/>',
  panel: '<rect x="3" y="3.5" width="18" height="17" rx="2"/><path d="M14.5 3.5v17"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  external: '<path d="M15 3.5h5.5V9M10 14 20.5 3.5M18 13.5v5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  quote: '<path d="M10 7H6.5A2.5 2.5 0 0 0 4 9.5V12h4.5v5H4v-5M20 7h-3.5A2.5 2.5 0 0 0 14 9.5V12h4.5v5H14v-5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  filter: '<path d="M3.5 5h17l-6.5 8v6l-4 1.5V13Z"/>',
  ban: '<circle cx="12" cy="12" r="9.5"/><path d="m5.3 5.3 13.4 13.4"/>',
  sparkline: '<path d="M3 17l5-5 4 3 8-8"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13.5v15H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  list: '<path d="M9 6h11.5M9 12h11.5M9 18h11.5M4 6h.01M4 12h.01M4 18h.01"/>',
  "arrow-down": '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
  terminal: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="m7 9 3 3-3 3M12.5 15h4.5"/>',
  command: '<path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H17.5A2.5 2.5 0 1 0 15 6.5V17.5A2.5 2.5 0 1 0 17.5 15H6.5A2.5 2.5 0 1 0 9 17.5Z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  keyboardkey: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h10"/>',
  headphones: '<path d="M3.5 18v-5a8.5 8.5 0 0 1 17 0v5"/><path d="M20.5 18a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3ZM3.5 18a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-3Z"/>',
  mouse: '<rect x="5.5" y="2.5" width="13" height="19" rx="6.5"/><path d="M12 6.5v4"/>',
  keyboard: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6.5 9h.01M10 9h.01M14 9h.01M17.5 9h.01M6.5 12.5h.01M10 12.5h.01M14 12.5h.01M17.5 12.5h.01M8 16h8"/>',
};

/**
 * icon("check") → <svg …> trang trí (aria-hidden).
 * icon("x", { label: "Xoá" }) → có tên cho trình đọc màn hình (khi icon đứng một mình mang nghĩa).
 */
export function icon(name, opts = {}) {
  const { size = 18, label, cls = "" } = opts;
  const body = P[name] || P.info;
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return raw(`<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" ${a11y}>${body}</svg>`);
}

export const categoryIcon = (cat) => ({ headphones: "headphones", mouse: "mouse", keyboard: "keyboard" }[cat] || "grid");
