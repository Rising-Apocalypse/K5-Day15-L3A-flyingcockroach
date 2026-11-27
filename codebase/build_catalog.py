"""Dựng catalog SmartBuy từ Amazon Reviews 2023 — UC-09 "Chuẩn bị & công bố catalog". Chỉ dùng thư viện chuẩn.

Nguồn: https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023 (thư mục raw/ của repo dataset)
    raw/meta_categories/meta_Electronics.jsonl      metadata  (~1,6 triệu sản phẩm)
    raw/review_categories/Electronics.jsonl         review    (~43,9 triệu dòng)
Nhận cả .jsonl.gz. Để file ở data-btc/ (đã có trong .gitignore) — KHÔNG commit file gốc.

Chạy:
    python codebase/build_catalog.py --meta data-btc/meta_Electronics.jsonl --reviews data-btc/Electronics.jsonl
    python codebase/build_catalog.py --meta ... --reviews ... --per-category 60 --max-reviews 30 \\
        --usd-vnd 25400 --fx-source "Vietcombank, bán ra 27/11/2026"
    python codebase/build_catalog.py --meta ... --limit 300000       # thử nhanh trên 300k dòng đầu (không cần --reviews)
Ra: data/catalog.json — codebase/web.py và catalog.py tự dùng file này thay cho catalog demo.

Các bước (mỗi bước in số đếm để nhóm kiểm lại):
  1. Lọc metadata theo đường dẫn `categories` → tai nghe / chuột / bàn phím; loại phụ kiện, combo (BR-CAT-02).
  2. Trích thuộc tính có kiểm định:
       VERIFIED  có nguồn: một khoá trong `details`, một dòng `features`, hoặc tiêu đề (mã D:/F/T)
       UNKNOWN   không có nguồn, hoặc nguồn mơ hồ — vd chỉ ghi "Wireless" thì KHÔNG suy ra Bluetooth
       CONFLICT  các nguồn ghi khác nhau — giữ cả hai, không tự chọn (AF-03 UC-03)
  3. Chọn N sản phẩm nhiều lượt đánh giá nhất mỗi ngành (ưu tiên có giá — bộ lọc ngân sách cần giá).
  4. Quét file review MỘT lần: đếm phân bố sao, giữ K review hữu ích nhất mỗi sản phẩm; bỏ user_id (AC-OPS-04).
  5. Gắn APPROVED / PENDING kèm lý do; tính độ phủ thuộc tính → chỉ bật bộ lọc đạt data gate (AC-CAT-02).
Luật lọc / trích là heuristic — đọc phần in ra cuối, xem vài sản phẩm bị loại để chỉnh CATEGORY_RULES nếu cần.
"""
import argparse
import collections
import datetime
import gzip
import heapq
import json
import os
import re
import sys
import time

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "catalog.json")

# ───────── 1. Ngành hàng ─────────
# include: tên một tầng trong `categories` (so khớp nguyên tầng, không phân biệt hoa thường).
# exclude_leaf: tầng CUỐI là phụ kiện / combo → loại. exclude_title: tiêu đề giống phụ kiện / combo → loại.
CATEGORY_RULES = {
    "headphones": {
        "label": "Tai nghe",
        "include": ["headphones", "over-ear headphones", "on-ear headphones", "earbud headphones", "computer headsets"],
        "exclude_leaf": ["headphone accessories", "earpads", "cases", "headphone amplifiers", "headphone extension cords", "adapters"],
        "exclude_segment": ["accessories & supplies > audio & video accessories > cables"],
        "exclude_title": [r"\bcases?\b", r"\bear ?pads?\b", r"\bear ?cushions?\b", r"replacement", r"\bcover\b", r"\bstand\b",
                          r"\bhanger\b", r"\badapter\b", r"\bsplitter\b", r"\bear ?tips?\b", r"\bextension cable\b",
                          r"clean(er|ing)? kit", r"battery pack", r"\bfurniture\b", r"kitty ears", r"\bears for\b"],
        "filters": {"connectivity": {"bluetooth": "Bluetooth", "wired": "Có dây"},
                    "wear_type": {"over-ear": "Trùm tai", "on-ear": "Áp tai", "in-ear": "Nhét tai"}},
        "compare": ["connectivity", "wear_type", "microphone", "anc", "battery", "weight"],
    },
    "mouse": {
        "label": "Chuột",
        "include": ["mice"],
        "exclude_leaf": ["mouse pads", "mouse pads & wrist rests", "keyboard & mouse combos", "mice & keyboard combos"],
        "exclude_segment": [],
        "exclude_title": [r"\bmouse ?pad\b", r"\bcombo\b", r"keyboard (and|&) mouse", r"mouse (and|&) keyboard", r"\bskins?\b",
                          r"\bgrip tape\b", r"\bskates\b", r"\bmouse feet\b", r"\bbungee\b",
                          r"\b(hard )?case\b", r"\breplacement\b"],
        "filters": {"connectivity": {"bluetooth": "Bluetooth", "wireless-2.4": "2.4 GHz", "wired": "Có dây"}},
        "compare": ["connectivity", "dpi", "buttons", "weight", "battery", "shape"],
    },
    "keyboard": {
        "label": "Bàn phím",
        "include": ["keyboards"],
        "exclude_leaf": ["keyboard & mouse combos", "keyboard accessories", "keycaps", "keyboard covers", "wrist rests"],
        "exclude_segment": ["tablet accessories", "musical instruments"],
        "exclude_title": [r"\bcombo\b", r"keyboard (and|&) mouse", r"\bkeycaps?\b", r"\bwrist rest\b", r"\bcover\b", r"\bskin\b",
                          r"\bcase\b", r"\bfolio\b", r"\bpiano\b", r"\bmidi\b", r"\bkeyboard tray\b", r"\bstickers?\b"],
        "filters": {"connectivity": {"bluetooth": "Bluetooth", "wireless-2.4": "2.4 GHz", "wired": "Có dây"},
                    "layout": {"60": "60%", "65": "65%", "75": "75%", "tkl": "TKL", "96": "96%", "full": "Full-size", "split": "Tách đôi"}},
        "compare": ["connectivity", "layout", "switch", "hot_swap", "backlight", "battery"],
    },
}
ATTRIBUTE_LABELS = {
    "connectivity": "Kết nối", "wear_type": "Kiểu đeo", "microphone": "Micro", "anc": "Chống ồn chủ động (ANC)",
    "battery": "Pin", "weight": "Trọng lượng", "dpi": "Độ phân giải (DPI)", "buttons": "Số nút", "shape": "Kiểu dáng",
    "layout": "Bố cục", "switch": "Switch", "hot_swap": "Hot-swap", "backlight": "Đèn nền",
}
ASPECTS = {
    "headphones": {"Đeo lâu": ["comfort", "comfortable", "ear pad", "earpad", "fit", "hurt", "pressure", "tight", "clamp", "heavy"],
                   "Âm thanh": ["sound", "bass", "audio quality", "treble", "clarity", "music"],
                   "Micro khi gọi": ["mic", "microphone", "call quality", "calls", "zoom"],
                   "Pin": ["battery", "charge", "charging", "hours"],
                   "Chống ồn": ["noise cancel", "anc", "noise canceling", "noise-cancel"],
                   "Kết nối": ["bluetooth", "pairing", "pair", "disconnect", "connection", "lag", "latency"]},
    "mouse": {"Cầm lâu": ["comfort", "ergonomic", "wrist", "hand", "grip", "cramp"],
              "Click & cuộn": ["click", "scroll", "wheel", "button"],
              "Pin": ["battery", "charge", "charging"],
              "Kết nối": ["bluetooth", "receiver", "connection", "lag", "disconnect"],
              "Chơi game": ["gaming", "game", "fps", "sensor", "tracking"]},
    "keyboard": {"Cảm giác gõ": ["typing", "feel", "switch", "tactile", "clicky", "keys feel", "linear"],
                 "Độ ồn": ["loud", "quiet", "noisy", "noise", "thock"],
                 "Kết nối": ["bluetooth", "connection", "pairing", "disconnect", "lag", "receiver"],
                 "Pin": ["battery", "charge", "charging"],
                 "Đèn nền": ["rgb", "backlight", "backlit", "lighting"]},
}


def open_any(path):
    return gzip.open(path, "rt", encoding="utf-8") if path.endswith(".gz") else open(path, encoding="utf-8")


def as_dict(v):
    if isinstance(v, dict):
        return v
    if isinstance(v, str) and v.strip().startswith("{"):
        try:
            d = json.loads(v)
            return d if isinstance(d, dict) else {}
        except ValueError:
            return {}
    return {}


def as_price(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v) if v > 0 else None
    if isinstance(v, str) and v.strip().lower() not in ("", "none", "null"):
        m = re.search(r"\d+(?:\.\d+)?", v.replace(",", ""))
        return float(m.group(0)) if m else None
    return None


def has_image(v):
    if isinstance(v, list):
        return any(isinstance(i, dict) and (i.get("hi_res") or i.get("large")) for i in v)
    if isinstance(v, dict):
        return any(x for x in (v.get("hi_res") or []) + (v.get("large") or []))
    return False


def detect_category(cats, title):
    segs = [str(s).strip().lower() for s in (cats or []) if s]
    if not segs:
        return None, "không có categories"
    path = " > ".join(segs)
    t = (title or "").lower()
    for key, rule in CATEGORY_RULES.items():
        if any(s in rule["include"] for s in segs):
            if segs[-1] in rule["exclude_leaf"] or any(x in path for x in rule["exclude_segment"]):
                return None, "phụ kiện / combo (theo categories)"
            if any(re.search(rx, t) for rx in rule["exclude_title"]):
                return None, "phụ kiện / combo (theo tiêu đề)"
            return key, None
    return None, "ngoài 3 ngành hàng"


EXPORT_CATEGORY = {"Headphones": "headphones", "Mouse": "mouse", "Keyboard": "keyboard"}
# Bản xuất Colab chưa kiểm tay (manifest: audit_status PENDING) và có lẫn hàng sai loại (vd "Outdoor End Table" gắn
# nhãn Headphones) → tiêu đề phải chứa ít nhất một từ của đúng loại.
EXPORT_TITLE_REQUIRED = {
    "headphones": r"head ?phones?|head ?sets?|ear ?buds?|ear ?phones?|in[- ]ear|over[- ]ear|on[- ]ear|ear ?plugs?|monitors?\b"
                  r"|skullcandy|plantronics|jabra|sennheiser|\bbose\b|\bbeats\b|airpods",  # thương hiệu chỉ làm tai nghe
    "mouse": r"\bmouse\b|\bmice\b",
    "keyboard": r"key ?board|keypad",
}

# ───────── Rà soát tay bản xuất v4 (28/11) — lý do ghi ở docs/backend-log.md ─────────
# Mũ len gắn loa Bluetooth: tiêu đề có "Headphones" nhưng là đồ thời trang, không phải tai nghe người dùng tìm → loại.
NOT_PRODUCT_TITLE = r"\bbeanie\b|\bhats?\b"
# Giá niêm yết lệch hẳn giá review kể (người bán bên thứ ba đẩy giá) → bỏ giá (coi như thiếu giá). KHÔNG tự điền số khác.
SUSPECT_PRICE = {
    "B00005N6KG": "Sony MDR-W08L ghi $138.2 nhưng review kể giá $7–13 và than người bán đẩy lên $30–40",
}
# Email người viết lẫn trong nội dung review → che (dữ liệu cá nhân, AGENTS.md).
EMAIL_RX = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def from_export(m):
    """Bản ghi xuất từ Colab (data/colab_export_cell.py) → khuôn metadata gốc mà phần dưới đọc.
    Khác biệt: `category_path` (chuỗi "A > B > C") thay cho `categories`, `price_usd` thay cho `price`."""
    m = dict(m)
    if not m.get("categories") and m.get("category_path"):
        m["categories"] = [s.strip() for s in str(m["category_path"]).split(">") if s.strip()]
    if m.get("price") in (None, "") and m.get("price_usd") is not None:
        m["price"] = m["price_usd"]
    if isinstance(m.get("images"), list):  # bản xuất v2: list link (str) → khuôn gốc list[{"large": url}]
        m["images"] = [{"large": im} if isinstance(im, str) else im for im in m["images"] if im]
    m.setdefault("main_category", "Electronics")
    return m


# từ phụ kiện đi LIỀN SAU tên loại → tiêu đề đang tả phụ kiện ("Keyboard Stickers", "AirPods Case", "Mouse Pad")
ACCESSORY_AFTER_NOUN = r"\s+(stickers?|covers?|cases?|skins?|stands?|pads?|holders?|hangers?|cushions?|tips|adapters?|cleaners?)\b"


def export_category(m):
    """Bản xuất đã gắn smartbuy_category ở notebook (đã lọc theo leaf category); chạy lại kiểm tra theo tiêu đề:
      1. tiêu đề phải có từ của đúng loại (bắt nhãn sai);
      2. là phụ kiện khi từ phụ kiện đứng TRƯỚC tên loại ("Case for … Mouse", "Keycaps … for Keyboards")
         hoặc đi liền sau tên loại ("Keyboard Stickers"). Từ phụ kiện đứng SAU sản phẩm ("Earbuds … Charging Case",
         "Headphones … soft ear pads") là mô tả sản phẩm thật → giữ. Luật cũ (có từ là loại) loại nhầm ~45 mẫu thật."""
    cat = EXPORT_CATEGORY.get(m.get("smartbuy_category"))
    if not cat:
        return detect_category(m.get("categories"), m.get("title"))
    title = (m.get("title") or "").lower()
    noun = re.search(EXPORT_TITLE_REQUIRED[cat], title)
    if not noun:
        return None, "tiêu đề không có từ của loại %s (nhãn sai ở bản xuất)" % cat
    if re.search(NOT_PRODUCT_TITLE, title):
        return None, "mũ / đồ thời trang gắn tai nghe (không phải sản phẩm chính)"
    acc =[mm.start() for mm in (re.search(rx, title) for rx in CATEGORY_RULES[cat]["exclude_title"]) if mm]
    if acc and min(acc) < noun.start():
        return None, "phụ kiện / combo (từ phụ kiện đứng trước tên loại)"
    if re.search("(%s)%s" % (EXPORT_TITLE_REQUIRED[cat], ACCESSORY_AFTER_NOUN), title):
        return None, "phụ kiện (từ phụ kiện liền sau tên loại)"
    return cat, None


# ───────── 2. Trích thuộc tính ─────────
def dget(details, *names):
    low = {k.lower(): k for k in details}
    for n in names:
        k = low.get(n.lower())
        if k is not None and str(details[k]).strip():
            return k, str(details[k]).strip()
    return None, None


def verified(value, source, tags=None, **extra):
    a = {"value": value, "status": "VERIFIED", "source": source}
    if tags:
        a["tags"] = sorted(tags)
    a.update(extra)
    return a


def unknown(note=None, source=None):
    a = {"value": None, "status": "UNKNOWN"}
    if note:
        a["note"] = note
    if source:
        a["source"] = source
    return a


def conflict(values):
    return {"value": None, "status": "CONFLICT", "values": [{"value": v, "source": s} for v, s in values]}


def texts(details, feats, title):
    """Các nguồn văn bản theo thứ tự tin cậy: details → features → tiêu đề."""
    out = [("D:" + k, "%s: %s" % (k, v)) for k, v in details.items() if isinstance(v, (str, int, float))]
    out += [("F%d" % i, f) for i, f in enumerate(feats, 1)]
    out.append(("T", title or ""))
    return out


def conn_tags(text):
    t = text.lower()
    tags = set()
    if "bluetooth" in t:
        tags.add("bluetooth")
    if re.search(r"2\.4\s*g(hz)?\b", t) or "usb receiver" in t or "nano receiver" in t or "dongle" in t:
        tags.add("wireless-2.4")
    if re.search(r"\bwired\b|3\.5\s?mm|\baux\b|\bcorded\b", t):
        tags.add("wired")
    return tags


def x_connectivity(details, feats, title, cat):
    k, v = dget(details, "Connectivity Technology", "Connectivity Technologies", "Wireless Communication Technology", "Connectivity")
    det = conn_tags(v) if v else set()
    other, first_src = set(), None
    for src, text in [("F%d" % i, f) for i, f in enumerate(feats, 1)] + [("T", title or "")]:
        tg = conn_tags(text)
        if tg:
            other |= tg
            first_src = first_src or src
    if det and other and det.isdisjoint(other):
        return conflict([(v, "D:" + k), (", ".join(sorted(other)), first_src)])
    tags = det | other
    if not tags:
        if v and "wireless" in v.lower():
            return unknown("Nguồn chỉ ghi “%s”, không nêu chuẩn kết nối — không suy ra là Bluetooth." % v, "D:" + k)
        return unknown()
    ver = re.search(r"bluetooth\s*v?(\d\.\d)", " ".join([v or "", title or ""] + feats), re.I)
    parts = []
    if "bluetooth" in tags:
        parts.append("Bluetooth" + (" " + ver.group(1) if ver else ""))
    if "wireless-2.4" in tags:
        parts.append("2.4 GHz")
    if "wired" in tags:
        parts.append("Có dây")
    return verified(" + ".join(parts), ("D:" + k) if det else first_src, tags)


def x_wear(details, feats, title, cats):
    leaf = " ".join(cats or []).lower()
    by_cat = "over-ear" if "over-ear" in leaf else "on-ear" if "on-ear" in leaf else "in-ear" if "earbud" in leaf else None
    k, v = dget(details, "Ear Placement", "Form Factor", "Headphones Form Factor")
    by_det = None
    if v:
        lv = v.lower()
        by_det = "over-ear" if "over" in lv else "on-ear" if "on ear" in lv or "on-ear" in lv else "in-ear" if ("in ear" in lv or "in-ear" in lv or "earbud" in lv or "true wireless" in lv) else None
    label = {"over-ear": "Trùm tai (over-ear)", "on-ear": "Áp tai (on-ear)", "in-ear": "Nhét tai (in-ear)"}
    if by_det and by_cat and by_det != by_cat:
        return conflict([(label[by_det], "D:" + k), (label[by_cat], "categories")])
    if by_det:
        return verified(label[by_det], "D:" + k, {by_det})
    if by_cat:
        return verified(label[by_cat], "categories", {by_cat})
    return unknown()


def x_regex(sources, rx, fmt, flags=re.I):
    for src, text in sources:
        m = re.search(rx, text, flags)
        if m:
            return fmt(m), src
    return None, None


def x_microphone(details, feats, title):
    srcs = texts(details, feats, title)
    neg, nsrc = x_regex(srcs, r"\b(no|without)\s+(built[- ]in\s+)?mic(rophone)?\b", lambda m: "Không")
    pos, psrc = x_regex(srcs, r"\bmic(rophone)?s?\b|\bboom mic\b", lambda m: "Có")
    if neg and pos and nsrc != psrc:
        return conflict([("Không", nsrc), ("Có", psrc)])
    if neg:
        return verified("Không", nsrc)
    return verified("Có", psrc) if pos else unknown()


def x_anc(details, feats, title):
    k, v = dget(details, "Noise Control")
    claim, csrc = x_regex([(s, t) for s, t in texts({}, feats, title)], r"active noise cancel|\banc\b|hybrid noise cancel", lambda m: "Có")
    if v:
        det = "Có" if "active" in v.lower() else "Không"
        if claim and det == "Không":
            return conflict([("Không (%s)" % v, "D:" + k), ("Có", csrc)])
        return verified("Có (ANC)" if det == "Có" else "Không", "D:" + k)
    return verified("Có (ANC)", csrc) if claim else unknown()


def x_battery(details, feats, title, cat):
    k, v = dget(details, "Battery Life", "Battery Average Life")
    _, req = dget(details, "Batteries Required")
    srcs = [(s, t) for s, t in texts({}, feats, title)]
    if cat == "mouse":
        val, src = x_regex(srcs, r"(\d{1,2})\s*(months?|years?)\b", lambda m: "đến %s %s" % (m.group(1), "tháng" if m.group(2).startswith("month") else "năm"))
        if not val:
            val, src = x_regex(srcs, r"(\d{2,3})\s*(?:hours?|hrs?)\b", lambda m: "đến %s giờ" % m.group(1))
    elif cat == "keyboard":
        val, src = x_regex(srcs, r"(\d{3,5})\s*mah\b", lambda m: "%s mAh" % m.group(1))
        if not val:
            val, src = x_regex(srcs, r"(\d{1,3})\s*(months?|hours?|hrs?)\b", lambda m: "đến %s %s" % (m.group(1), "tháng" if m.group(2).startswith("month") else "giờ"))
    else:
        val, src = x_regex(srcs, r"(\d{1,3})\s*(?:\+\s*\d+\s*)?(?:hours?|hrs?|h)\b(?:\s*(?:of\s*)?(?:playtime|playback|battery))?", lambda m: "%s giờ" % m.group(1))
    if v:
        num_d = re.search(r"\d+(?:\.\d+)?", v)
        num_f = re.search(r"\d+(?:\.\d+)?", val or "")
        dval = v.replace("Hours", "giờ").replace("hours", "giờ").replace("Months", "tháng")
        if num_d and num_f and abs(float(num_d.group(0)) - float(num_f.group(0))) > max(2.0, 0.2 * float(num_d.group(0))):
            return conflict([(dval, "D:" + k), (val, src)])
        return verified(dval, "D:" + k)
    if val:
        return verified(val, src)
    if req and req.lower() == "no":
        return verified("Không dùng pin", "D:Batteries Required")
    return unknown()


def grams(text):
    m = re.search(r"(\d+(?:\.\d+)?)\s*(ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg)\b", text, re.I)
    if not m:
        return None
    n, u = float(m.group(1)), m.group(2).lower()
    g = n * 28.3495 if u.startswith(("ounce", "oz")) else n * 453.592 if u.startswith(("pound", "lb")) else n * 1000 if u.startswith("k") else n
    return "%d g" % round(g)


def x_weight(details):
    k, v = dget(details, "Item Weight")
    g = grams(v) if v else None
    return verified(g, "D:" + k) if g else unknown()


def x_dpi(details, feats, title):
    best, src = 0, None
    for s, t in texts(details, feats, title):
        for m in re.finditer(r"(\d{1,2}[,.]?\d{3}|\d{3,5})\s*dpi", t, re.I):
            n = int(re.sub(r"[,.]", "", m.group(1)))
            if 100 <= n <= 50000 and n > best:
                best, src = n, s
    return verified("đến %s DPI" % format(best, ",").replace(",", "."), src) if best else unknown()


def x_buttons(details, feats, title):
    k, v = dget(details, "Number of Buttons")
    if v and re.search(r"\d+", v):
        return verified("%s nút" % re.search(r"\d+", v).group(0), "D:" + k)
    val, src = x_regex(texts({}, feats, title), r"(\d{1,2})\s*(?:programmable\s+|customizable\s+)?buttons\b", lambda m: "%s nút" % m.group(1))
    return verified(val, src) if val else unknown()


def x_shape(details, feats, title):
    k, v = dget(details, "Hand Orientation")
    shape, src = x_regex(texts({}, feats, title), r"\bvertical\b|\bergonomic\b|\bambidextrous\b|\bcompact\b|\btravel\b",
                         lambda m: {"vertical": "Chuột dọc", "ergonomic": "Công thái học", "ambidextrous": "Đối xứng",
                                    "compact": "Nhỏ gọn", "travel": "Nhỏ gọn"}[m.group(0).lower()])
    hand = {"right": "tay phải", "left": "tay trái", "ambidextrous": "đối xứng"}.get((v or "").lower())
    if shape and hand and shape not in ("Đối xứng",):
        return verified("%s, %s" % (shape, hand), src)
    if shape:
        return verified(shape, src)
    if hand:
        return verified(hand[0].upper() + hand[1:], "D:" + k)
    return unknown()


def x_layout(feats, title):
    def find(text):
        t = text.lower()
        m = re.search(r"\b(60|65|75|96)\s?%", t)
        if m:
            return m.group(1)
        if re.search(r"tenkeyless|\btkl\b|\b87[- ]?keys?\b|\b80\s?%", t):
            return "tkl"
        if re.search(r"\bsplit\b", t):
            return "split"
        if re.search(r"full[- ]?size|\b10[48][- ]?keys?\b|numeric keypad|number pad|\bnumpad\b|\b100\s?%", t):
            return "full"
        return None
    label = {"60": "60%", "65": "65%", "75": "75%", "96": "96%", "tkl": "TKL (80%)", "full": "Full-size (100%)", "split": "Tách đôi (split)"}
    t_tag = find(title or "")
    f_tag, f_src = None, None
    for i, f in enumerate(feats, 1):
        f_tag = find(f)
        if f_tag:
            f_src = "F%d" % i
            break
    if t_tag and f_tag and t_tag != f_tag:
        return conflict([(label[t_tag], "T"), (label[f_tag], f_src)])
    tag = t_tag or f_tag
    return verified(label[tag], "T" if t_tag else f_src, {tag}) if tag else unknown()


def x_switch(details, feats, title):
    k, v = dget(details, "Switch Type", "Keyboard Switch")
    rx = r"\b(red|brown|blue|yellow|black|silver|white|clear|speed silver)\b(?:\s+\w+){0,2}?\s+switch(?:es)?|\b(membrane|scissor|optical|linear|tactile|clicky)\b"
    feel = {"red": "linear", "yellow": "linear", "black": "linear", "silver": "linear", "speed silver": "linear",
            "brown": "tactile", "clear": "tactile", "blue": "clicky", "white": "clicky"}

    def fmt(m):
        if m.group(1):
            c = m.group(1).lower()
            return "%s (%s)" % (c.title(), feel.get(c, "?"))
        return {"membrane": "Membrane", "scissor": "Scissor (phím mỏng)", "optical": "Optical", "linear": "Linear",
                "tactile": "Tactile", "clicky": "Clicky"}[m.group(2).lower()]
    val, src = x_regex(texts({}, feats, title), rx, fmt)
    if v:
        if val and v.split()[0].lower() not in val.lower():
            return conflict([(val, src), (v, "D:" + k)])
        return verified(v, "D:" + k)
    return verified(val, src) if val else unknown()


def x_hotswap(feats, title):
    val, src = x_regex(texts({}, feats, title), r"hot[- ]?swap", lambda m: "Có")
    return verified(val, src) if val else unknown()


def x_backlight(details, feats, title):
    k, v = dget(details, "Special Feature", "Special Features")
    if v and re.search(r"rgb|backlit|backlight", v, re.I):
        return verified("RGB" if "rgb" in v.lower() else "Có", "D:" + k)
    neg, nsrc = x_regex(texts({}, feats, title), r"no backlight|non[- ]backlit", lambda m: "Không")
    if neg:
        return verified(neg, nsrc)
    val, src = x_regex(texts({}, feats, title), r"\brgb\b|backlit|backlight", lambda m: "RGB" if m.group(0).lower() == "rgb" else "Có")
    return verified(val, src) if val else unknown()


def extract(cat, details, feats, title, cats):
    a = {"connectivity": x_connectivity(details, feats, title, cat)}
    if cat == "headphones":
        a.update(wear_type=x_wear(details, feats, title, cats), microphone=x_microphone(details, feats, title),
                 anc=x_anc(details, feats, title), battery=x_battery(details, feats, title, cat), weight=x_weight(details))
    elif cat == "mouse":
        a.update(dpi=x_dpi(details, feats, title), buttons=x_buttons(details, feats, title), weight=x_weight(details),
                 battery=x_battery(details, feats, title, cat), shape=x_shape(details, feats, title))
    elif cat == "keyboard":
        a.update(layout=x_layout(feats, title), switch=x_switch(details, feats, title), hot_swap=x_hotswap(feats, title),
                 backlight=x_backlight(details, feats, title), battery=x_battery(details, feats, title, cat))
    return a


# ───────── 4. Review ─────────
ASIN_RX = re.compile(r'"parent_asin":\s*"([^"]+)"')


def slim_review(r):
    text = re.sub(r"<br\s*/?>", " ", str(r.get("text") or ""), flags=re.I)
    text = EMAIL_RX.sub("[email đã ẩn]", re.sub(r"<[^>]+>", "", text).strip())
    imgs = []
    for im in (r.get("images") or [])[:2]:
        if isinstance(im, dict):
            imgs.append({k: im.get(k) for k in ("small_image_url", "medium_image_url", "large_image_url") if im.get(k)})
    return collections.OrderedDict([
        ("rating", r.get("rating")), ("title", EMAIL_RX.sub("[email đã ẩn]", str(r.get("title") or ""))[:160]), ("text", text[:900] + ("…" if len(text) > 900 else "")),
        ("images", imgs), ("asin", r.get("asin")), ("parent_asin", r.get("parent_asin")), ("timestamp", r.get("timestamp")),
        ("helpful_vote", int(r.get("helpful_vote") or 0)), ("verified_purchase", bool(r.get("verified_purchase"))),
    ])  # user_id bị bỏ có chủ đích (AC-OPS-04)


def insights(cat, reviews):
    out = []
    for aspect, kws in ASPECTS.get(cat, {}).items():
        pos = mixed = neg = 0
        ids = []
        for i, r in enumerate(reviews, 1):
            t = (str(r.get("title") or "") + " " + str(r.get("text") or "")).lower()
            if not any(k in t for k in kws):
                continue
            s = float(r.get("rating") or 0)
            pos, mixed, neg = pos + (s >= 4), mixed + (s == 3), neg + (s <= 2)
            if len(ids) < 3:
                ids.append("R%d" % i)
        n = pos + mixed + neg
        if n >= 2:
            out.append({"aspect": aspect, "pos": pos, "mixed": mixed, "neg": neg, "evidence": ids,
                        "summary": "%d/%d review đã chọn nhắc tới %s: %d khen, %d trung lập, %d chê (đếm theo từ khoá)."
                                   % (n, len(reviews), aspect.lower(), pos, mixed, neg)})
    return sorted(out, key=lambda x: -(x["pos"] + x["mixed"] + x["neg"]))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Dựng data/catalog.json từ Amazon Reviews 2023 (Electronics)")
    ap.add_argument("--from-export", metavar="DIR",
                    help="đọc bản xuất Colab (DIR/products.jsonl + DIR/reviews.jsonl, vd data/amazon_raw) thay cho --meta/--reviews")
    ap.add_argument("--meta", help="meta_Electronics.jsonl hoặc .jsonl.gz")
    ap.add_argument("--reviews", help="Electronics.jsonl hoặc .jsonl.gz (bỏ trống = không có review)")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--per-category", type=int, default=60, help="số sản phẩm mỗi ngành (mặc định 60)")
    ap.add_argument("--max-reviews", type=int, default=30, help="số review hữu ích nhất giữ lại mỗi sản phẩm")
    ap.add_argument("--min-ratings", type=int, default=30, help="tối thiểu rating_number để APPROVED")
    ap.add_argument("--gate", type=float, default=0.8, help="độ phủ tối thiểu để bật một bộ lọc (spec: coverage 80%%, chưa nghiệm thu)")
    ap.add_argument("--usd-vnd", type=float, default=25400)
    ap.add_argument("--fx-source", default="(tự ước tính — thay bằng tỷ giá có nguồn)")
    ap.add_argument("--limit", type=int, default=0, help="chỉ đọc N dòng metadata đầu (thử nhanh)")
    args = ap.parse_args(argv)
    export = bool(args.from_export)
    if export:
        args.meta = args.meta or os.path.join(args.from_export, "products.jsonl")
        args.reviews = args.reviews or os.path.join(args.from_export, "reviews.jsonl")
    if not args.meta:
        ap.error("cần --meta hoặc --from-export")

    t0 = time.time()
    reasons = collections.Counter()
    cands = collections.defaultdict(list)
    scanned = 0
    print("① Đọc metadata:", args.meta, "(bản xuất Colab)" if export else "")
    with open_any(args.meta) as f:
        for line in f:
            scanned += 1
            if args.limit and scanned > args.limit:
                break
            try:
                m = json.loads(line)
            except ValueError:
                reasons["dòng JSON lỗi"] += 1
                continue
            if export:
                m = from_export(m)
                cat, why = export_category(m)
            else:
                cat, why = detect_category(m.get("categories"), m.get("title"))
            if not cat:
                reasons[why] += 1
                continue
            cands[cat].append(m)
            if scanned % 200000 == 0:
                print("   %d dòng · tai nghe %d · chuột %d · bàn phím %d" % (scanned, len(cands["headphones"]), len(cands["mouse"]), len(cands["keyboard"])))
    print("   quét %d dòng trong %.0fs → %s" % (scanned, time.time() - t0, {k: len(v) for k, v in cands.items()}))

    selected = {}
    for cat, items in cands.items():
        items.sort(key=lambda m: (as_price(m.get("price")) is not None, int(m.get("rating_number") or 0)), reverse=True)
        for m in items[:args.per_category]:
            selected[m["parent_asin"]] = (cat, m)
    print("② Chọn %d sản phẩm (tối đa %d / ngành, ưu tiên có giá + nhiều lượt đánh giá)" % (len(selected), args.per_category))

    hist = collections.defaultdict(collections.Counter)
    total = collections.Counter()
    heaps = collections.defaultdict(list)
    if args.reviews:
        t1 = time.time()
        n = kept = 0
        print("③ Quét review:", args.reviews)
        with open_any(args.reviews) as f:
            for line in f:
                n += 1
                mm = ASIN_RX.search(line)
                if not mm or mm.group(1) not in selected:
                    continue
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                pid = r["parent_asin"]
                try:
                    hist[pid][str(int(round(float(r.get("rating") or 0))))] += 1
                except (TypeError, ValueError):
                    pass
                total[pid] += 1
                key = (int(r.get("helpful_vote") or 0), len(str(r.get("text") or "")) > 60, int(r.get("timestamp") or 0))
                item = (key, n, slim_review(r))
                h = heaps[pid]
                if len(h) < args.max_reviews:
                    heapq.heappush(h, item)
                else:
                    heapq.heappushpop(h, item)
                kept += 1
                if n % 2000000 == 0:
                    print("   %d dòng · %d review khớp" % (n, kept))
        print("   quét %d dòng trong %.0fs · %d review thuộc sản phẩm đã chọn" % (n, time.time() - t1, kept))

    products = []
    pend = collections.Counter()
    warn = collections.Counter()
    for pid, (cat, m) in selected.items():
        details = as_dict(m.get("details"))
        feats = [re.sub(r"\s+", " ", str(x)).strip() for x in (m.get("features") or []) if x]
        reviews = [x[2] for x in sorted(heaps.get(pid, []), key=lambda it: it[0], reverse=True)]
        attrs = extract(cat, details, feats, m.get("title") or "", m.get("categories"))
        why = []  # lý do CHẶN công bố
        if not m.get("title"):
            why.append("thiếu tiêu đề")
        if not has_image(m.get("images")):
            if export:  # bản xuất Colab đã lọc "có ảnh" nhưng không chép trường images → chỉ cảnh báo
                warn["bản xuất không kèm ảnh (đã lọc có ảnh ở notebook)"] += 1
            else:
                why.append("không có ảnh")
        if int(m.get("rating_number") or 0) < args.min_ratings:
            why.append("ít hơn %d lượt đánh giá" % args.min_ratings)
        status = "APPROVED" if not why else "PENDING"
        for w in why:
            pend[w] += 1
        if attrs["connectivity"]["status"] != "VERIFIED":
            warn["kết nối chưa xác minh (vẫn công bố, không khớp bộ lọc kết nối)"] += 1
        rec = collections.OrderedDict((k, m.get(k)) for k in ("parent_asin", "main_category", "title", "store", "average_rating",
                                                               "rating_number", "price", "features", "description", "images",
                                                               "categories", "details", "bought_together"))
        # bỏ `videos`: ~3/4 là video gợi ý của sản phẩm KHÁC trên trang Amazon, không phải video của chính sản phẩm
        rec["details"] = details
        rec["price"] = as_price(m.get("price"))
        data_flags = []
        if pid in SUSPECT_PRICE and rec["price"] is not None:
            data_flags.append("đã bỏ giá $%s: %s" % (rec["price"], SUSPECT_PRICE[pid]))
            rec["price"] = None
            warn["bỏ giá đáng ngờ"] += 1
        rec["reviews"] = reviews
        rec["smartbuy"] = collections.OrderedDict([
            ("category", cat), ("status", status), ("pending_reasons", why if status != "APPROVED" else []),
            ("data_flags", data_flags),
            ("attributes", attrs), ("reviews_total", total.get(pid, 0)), ("rating_hist", dict(hist.get(pid, {}))),
            ("insights", insights(cat, reviews)),
            ("insights_method", "Đếm theo từ khoá + số sao trong %d review hữu ích nhất — không phải AI, chưa kiểm định" % args.max_reviews),
        ])
        products.append(rec)

    categories = {}
    print("④ Độ phủ thuộc tính (sản phẩm APPROVED có giá trị VERIFIED) — bộ lọc chỉ bật khi ≥ %.0f%%:" % (args.gate * 100))
    for cat, rule in CATEGORY_RULES.items():
        appr = [p for p in products if p["smartbuy"]["category"] == cat and p["smartbuy"]["status"] == "APPROVED"]
        cov = {}
        for k in dict.fromkeys(list(rule["filters"]) + rule["compare"]):
            v = sum(1 for p in appr if p["smartbuy"]["attributes"].get(k, {}).get("status") == "VERIFIED")
            cov[k] = round(v / len(appr), 2) if appr else 0.0
        filters = {k: opts for k, opts in rule["filters"].items() if cov.get(k, 0) >= args.gate}
        paths = collections.Counter(" > ".join(p["categories"] or []) for p in products if p["smartbuy"]["category"] == cat)
        categories[cat] = {"label": rule["label"], "filters": filters, "filter_candidates": list(rule["filters"]),
                           "compare": rule["compare"], "coverage": cov, "gate": args.gate,
                           "paths": [p for p, _ in paths.most_common(6)]}
        print("   %-10s APPROVED %3d · độ phủ %s · bật lọc: %s" % (cat, len(appr), cov, ", ".join(filters) or "—"))

    out = collections.OrderedDict([
        ("schema", "smartbuy.catalog/v2"),
        ("catalog_version", "amz23-electronics-%s-n%d" % (datetime.date.today().strftime("%Y%m%d"), len(products))),
        ("synthetic", False),
        ("source", collections.OrderedDict([
            ("dataset", "McAuley-Lab/Amazon-Reviews-2023"),
            ("url", "https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023"),
            ("subset", ("bản xuất Colab %s (manifest.json)" % os.path.relpath(args.from_export, ROOT).replace(os.sep, "/")) if export else "raw_meta_Electronics + raw_review_Electronics"),
            ("built_with", "codebase/build_catalog.py"),
            ("built_at", datetime.datetime.now().isoformat(timespec="seconds")),
            ("meta_lines", scanned), ("candidates", {k: len(v) for k, v in cands.items()}), ("rejected", dict(reasons.most_common(8))),
            ("params", {"per_category": args.per_category, "max_reviews": args.max_reviews, "min_ratings": args.min_ratings, "gate": args.gate}),
        ])),
        ("note", "Dựng từ Amazon Reviews 2023 (Electronics). Thuộc tính trích bằng luật (heuristic), có mã nguồn D:/F/T; "
                 "insight review đếm theo từ khoá — không phải AI. Đã bỏ user_id."),
        ("fx", {"usd_vnd": args.usd_vnd, "as_of": datetime.date.today().isoformat(), "source": args.fx_source}),
        ("attribute_labels", ATTRIBUTE_LABELS),
        ("categories", categories),
        ("products", products),
    ])
    # BR-CAT-06 / AC-DATA-04: catalog mới không đạt thì KHÔNG ghi đè bản đang dùng — ghi ra file tạm, kiểm, rồi mới thay
    approved = collections.Counter(p["smartbuy"]["category"] for p in products if p["smartbuy"]["status"] == "APPROVED")
    ids = [p["parent_asin"] for p in products]
    problems = ["ngành %s không có sản phẩm APPROVED" % c for c in CATEGORY_RULES if not approved.get(c)]
    if len(ids) != len(set(ids)):
        problems.append("trùng parent_asin")
    if problems:
        print("✗ Không ghi %s — catalog mới không đạt: %s. Giữ nguyên bản đang dùng." % (
            os.path.relpath(args.out, ROOT), "; ".join(problems)))
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    with open(tmp, encoding="utf-8") as f:
        json.load(f)  # đọc lại được mới thay — lỗi ghi giữa chừng không làm hỏng bản đang dùng
    os.replace(tmp, args.out)
    size = os.path.getsize(args.out) / 1e6
    print("⑤ Ghi %s (%.1f MB) · %d sản phẩm · PENDING: %s" % (os.path.relpath(args.out, ROOT), size, len(products), dict(pend) or "0"))
    print("   Cảnh báo:", dict(warn) or "—")
    print("   Lý do loại ở bước ①:", dict(reasons.most_common(6)))
    print("   Xong trong %.0fs. Chạy lại web: python codebase/web.py" % (time.time() - t0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
