// Định dạng số, tiền, thời gian theo kiểu Việt Nam (1.290.000đ · 4,4 · 14:02).

const nf = new Intl.NumberFormat("vi-VN");
const nf1 = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const int = (n) => (n == null ? "—" : nf.format(n));
export const vnd = (n) => (n == null ? null : nf.format(Math.round(n)) + "đ");
export const usd = (n) => (n == null ? null : "$" + Number(n).toFixed(2));
export const rating = (r) => (r == null ? "—" : nf1.format(r));
export const score = (s) => (s == null ? "—" : nf1.format(Math.round(s * 10) / 10));

/** 940000 → "940k" · 1270000 → "1,27 tr" — dùng cho chip ngân sách gọn. */
export function vndShort(n) {
  if (n == null) return "";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(v) + " tr";
  }
  return nf.format(Math.round(n / 1000)) + "k";
}

export function clock(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function seconds(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return ms + " ms";
  return nf1.format(ms / 1000) + " s";
}

export function elapsed(ms) {
  const s = Math.floor(ms / 1000);
  const t = Math.floor((ms % 1000) / 100);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0") + "." + t;
}

/** "2023-03" → "03/2023" */
export function month(s) {
  if (!s) return "";
  const [y, m] = String(s).split("-");
  return m ? `${m}/${y}` : y;
}

/** Chuỗi người dùng nhập "1,5 triệu" / "800k" / "1.200.000" → số đồng. Không hiểu thì null. */
export function parseVnd(text) {
  if (text == null) return null;
  let s = String(text).trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let mult = 1;
  if (/(tr|triệu|trieu|m)$/.test(s)) { mult = 1_000_000; s = s.replace(/(triệu|trieu|tr|m)$/, ""); }
  else if (/(k|nghìn|nghin|ngàn|ngan)$/.test(s)) { mult = 1000; s = s.replace(/(nghìn|nghin|ngàn|ngan|k)$/, ""); }
  s = s.replace(/đ|d|vnd/g, "");
  if (mult > 1) s = s.replace(",", ".");
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}
