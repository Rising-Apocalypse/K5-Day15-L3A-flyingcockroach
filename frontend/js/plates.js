// "Bản in" sản phẩm: minh họa nét theo ngành hàng và kiểu dáng — thay cho ảnh giả.
// Khi catalog thật có trường image (URL ảnh Amazon), thẻ dùng ảnh thật thay cho bản in.
import { html, raw, esc } from "./util.js";

const SH = '<ellipse class="sh" cx="100" cy="138" rx="64" ry="5"/>';

function overEar(cup = { w: 30, h: 46 }) {
  const y = 132 - cup.h;
  return `${SH}
  <path d="M48 ${y + 14} C48 52 70 22 100 22 C130 22 152 52 152 ${y + 14}"/>
  <path d="M57 ${y + 12} C57 58 76 31 100 31 C124 31 143 58 143 ${y + 12}"/>
  <path d="M52 ${y - 2} v10 M148 ${y - 2} v10" stroke-width="5"/>
  <rect class="pf" x="${66 - 2}" y="${y + 5}" width="12" height="${cup.h - 10}" rx="6"/>
  <rect class="pf" x="${134 - 10}" y="${y + 5}" width="12" height="${cup.h - 10}" rx="6"/>
  <rect class="pf" x="${66 - cup.w}" y="${y}" width="${cup.w}" height="${cup.h}" rx="${Math.min(15, cup.w / 2)}"/>
  <rect class="pf" x="134" y="${y}" width="${cup.w}" height="${cup.h}" rx="${Math.min(15, cup.w / 2)}"/>
  <circle cx="${66 - cup.w / 2}" cy="${y + cup.h / 2}" r="3.2"/>
  <circle cx="${134 + cup.w / 2}" cy="${y + cup.h / 2}" r="3.2"/>`;
}

function onEar(boom = false) {
  return `${SH}
  <path d="M54 92 C54 50 74 28 100 28 C126 28 146 50 146 92"/>
  <path d="M61 90 C61 56 78 36 100 36 C122 36 139 56 139 90"/>
  <ellipse class="pf" cx="69" cy="106" rx="7" ry="17"/>
  <ellipse class="pf" cx="131" cy="106" rx="7" ry="17"/>
  <circle class="pf" cx="55" cy="106" r="19"/>
  <circle class="pf" cx="145" cy="106" r="19"/>
  <circle cx="55" cy="106" r="7"/><circle cx="145" cy="106" r="7"/>
  ${boom ? '<path d="M52 124 C50 136 62 142 84 136" stroke-width="3.2"/><rect class="pf" x="82" y="129" width="16" height="11" rx="5.5"/>' : ""}`;
}

function inEar() {
  const bud = (cx, rot) => `<g transform="rotate(${rot} ${cx} 76)">
      <rect class="pf" x="${cx - 7}" y="80" width="14" height="44" rx="7"/>
      <circle class="pf" cx="${cx}" cy="72" r="16"/>
      <ellipse class="pf" cx="${cx + (rot < 0 ? 12 : -12)}" cy="66" rx="7" ry="6"/>
      <circle cx="${cx}" cy="72" r="5"/>
    </g>`;
  return `${SH}
    <rect class="pf" x="80" y="98" width="40" height="34" rx="12"/>
    <path d="M80 110 h40"/><circle cx="100" cy="122" r="1.8"/>
    ${bud(56, -10)}${bud(144, 10)}`;
}

function mouseStd(scale = 1) {
  const t = scale === 1 ? "" : `transform="translate(100 78) scale(${scale}) translate(-100 -78)"`;
  return `${SH}<g ${t}>
    <path class="pf" d="M100 20 C126 20 136 40 136 66 L136 98 C136 122 120 134 100 134 C80 134 64 122 64 98 L64 66 C64 40 74 20 100 20 Z"/>
    <path d="M100 20 V62"/><path d="M64.5 62 C82 66.5 118 66.5 135.5 62"/>
    <rect class="pf" x="96" y="30" width="8" height="18" rx="4"/></g>`;
}

function mouseErgo() {
  return `${SH}
    <path class="pf" d="M106 20 C130 22 142 44 140 70 L137 100 C135 122 121 134 101 134 C86 134 72 127 67 112 C58 110 52 102 55 94 C58 86 64 82 64 72 C64 44 80 20 106 20 Z"/>
    <path d="M106 20 C104 36 103 50 103 62"/><path d="M65 64 C84 68 120 68 139.5 64"/>
    <path d="M58 98 C64 99 69 101 70 108" opacity=".7"/>
    <rect class="pf" x="99" y="30" width="8" height="18" rx="4"/>`;
}

function mouseVertical() {
  return `${SH}
    <path class="pf" d="M64 128 C56 114 56 90 64 70 C74 44 96 26 120 28 C138 30 145 46 141 66 L133 116 C131 128 121 133 105 133 L74 133 C69 133 66 131 64 128 Z"/>
    <path d="M120 28 C108 40 102 52 100 67"/><path d="M141 66 C127 71 113 71 100 67"/>
    <rect class="pf" x="68" y="88" width="13" height="7" rx="3.5"/><rect class="pf" x="68" y="100" width="13" height="7" rx="3.5"/>`;
}

function mouseGaming() {
  return `${SH}
    <path class="pf" d="M100 18 L123 23 C134 29 139 45 139 64 L141 98 C141 121 124 136 100 136 C76 136 59 121 59 98 L61 64 C61 45 66 29 77 23 Z"/>
    <path d="M100 18 V64"/><path d="M61 64 C82 69 118 69 139 64"/>
    <rect class="pf" x="96" y="29" width="8" height="18" rx="4"/>
    <rect class="pf" x="55" y="74" width="7" height="13" rx="2.5"/><rect class="pf" x="55" y="91" width="7" height="13" rx="2.5"/>
    <path d="M78 112 C90 120 110 120 122 112" stroke-width="3" opacity=".55"/>`;
}

/** Lưới phím: trả các <rect> trong khung (x, y, w, h). */
function keys(x, y, w, h, cols, rows, opt = {}) {
  const gap = opt.gap ?? 2.4;
  const kw = (w - gap * (cols - 1)) / cols;
  const kh = (h - gap * (rows - 1)) / rows;
  const rx = opt.rx ?? 1.6;
  let out = "";
  for (let r = 0; r < rows; r++) {
    const ky = y + r * (kh + gap);
    const last = r === rows - 1 && opt.space;
    for (let c = 0; c < cols; c++) {
      if (last && c > opt.space[0] && c <= opt.space[1]) continue;
      let span = 1;
      if (last && c === opt.space[0]) span = opt.space[1] - opt.space[0] + 1;
      const kx = x + c * (kw + gap);
      const ww = kw * span + gap * (span - 1);
      out += `<rect x="${kx.toFixed(1)}" y="${ky.toFixed(1)}" width="${ww.toFixed(1)}" height="${kh.toFixed(1)}" rx="${rx}"/>`;
    }
  }
  return out;
}

function keyboard(shape) {
  const frame = (x, y, w, h, rx = 7) => `<rect class="pf" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  const k = (s) => `<g stroke-width="1.5">${s}</g>`;
  switch (shape) {
    case "60":
      return SH + frame(36, 46, 128, 62) + k(keys(42, 52, 116, 50, 14, 5, { space: [3, 9] }));
    case "65":
      return SH + frame(30, 46, 140, 62) + k(keys(36, 52, 128, 50, 15, 5, { space: [3, 9] }));
    case "75":
      return SH + frame(30, 40, 140, 72) + k(keys(36, 46, 128, 9, 15, 1) + keys(36, 59, 128, 47, 15, 5, { space: [3, 9] }));
    case "tkl":
      return SH + frame(18, 42, 164, 68) + k(
        keys(24, 48, 118, 9, 13, 1) + keys(24, 61, 118, 43, 13, 5, { space: [3, 8] }) +
        keys(148, 48, 28, 9, 3, 1) + keys(148, 61, 28, 16, 3, 2) +
        `<rect x="157.6" y="86" width="8.8" height="8" rx="1.6"/>` + keys(148, 96, 28, 8, 3, 1),
      );
    case "96":
      return SH + frame(16, 42, 168, 68) + k(keys(22, 48, 156, 9, 18, 1) + keys(22, 61, 156, 43, 18, 5, { space: [3, 9] }));
    case "full":
      return SH + frame(8, 42, 184, 68) + k(
        keys(13, 48, 108, 9, 13, 1) + keys(13, 61, 108, 43, 13, 5, { space: [3, 8] }) +
        keys(126, 48, 22, 9, 3, 1) + keys(126, 61, 22, 16, 3, 2) + keys(126, 96, 22, 8, 3, 1) +
        keys(153, 48, 34, 9, 4, 1) + keys(153, 61, 34, 43, 4, 5),
      );
    case "split":
      return SH + `<g transform="rotate(-7 58 80)">${frame(14, 50, 80, 58)}${k(keys(20, 56, 68, 46, 7, 5, { space: [4, 6] }))}</g>
        <g transform="rotate(7 142 80)">${frame(106, 50, 80, 58)}${k(keys(112, 56, 68, 46, 7, 5, { space: [0, 2] }))}</g>`;
    case "low":
      return SH + frame(10, 56, 180, 46, 5) + k(keys(16, 61, 168, 36, 19, 5, { space: [4, 11], rx: 1, gap: 2 }));
    default:
      return SH + frame(22, 44, 156, 66) + k(keys(28, 50, 144, 54, 15, 6, { space: [3, 9] }));
  }
}

function drawing(category, shape) {
  if (category === "headphones") {
    if (shape === "in-ear") return inEar();
    if (shape === "on-ear") return onEar(false);
    if (shape === "headset") return onEar(true);
    return overEar();
  }
  if (category === "mouse") {
    if (shape === "ergonomic") return mouseErgo();
    if (shape === "vertical") return mouseVertical();
    if (shape === "gaming") return mouseGaming();
    if (shape === "compact") return mouseStd(0.8);
    return mouseStd();
  }
  if (category === "keyboard") return keyboard(shape);
  return SH;
}

/** plate(product, { variant: "card" | "thumb" | "hero", src }) — ảnh thật (Amazon) trên nền "studio",
 *  không có ảnh thì vẽ minh họa nét trên nền "blueprint". */
export function plate(p, { variant = "card", label = true, src } = {}) {
  const img = src || p.image;
  const cls = ["plate", variant === "thumb" ? "plate--thumb" : "", img ? "plate--photo" : ""].join(" ");
  const art = img
    ? html`<img src="${img}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : raw(`<svg viewBox="0 0 200 150" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${drawing(p.category, p.shape)}</svg>`);
  const meta = label && variant !== "thumb" ? raw(`<span class="plate__id">${esc(p.id)}</span>`) : "";
  return html`<span class="${cls}" aria-hidden="true">${art}${meta}</span>`;
}
