"""Chuyển tập con Amazon Reviews 2023 (xuất từ Colab) → data/products.json + data/reviews.json.

Nguồn: McAuley-Lab/Amazon-Reviews-2023 (Hugging Face), danh mục Electronics — lọc bằng notebook
DataDiscovery.ipynb, xuất bằng ô data/colab_export_cell.py → amazon_raw.zip.

Chạy:  giải nén amazon_raw.zip vào data/amazon_raw/  rồi  python data/build_from_amazon.py
       (tuỳ chọn: --raw-dir <thư mục>  --out-dir <thư mục>  --max-reviews N)

Giữ nguyên cấu trúc trường mà codebase/tools.py đọc:
  sản phẩm:  product_id, category, name, price_vnd, tags, specs, rating, rating_count (+ price_usd, label, source)
  đánh giá:  review_id, product_id, rating, aspect, text (+ title, helpful_vote, verified_purchase)

Những gì do script SUY RA (không có sẵn trong data gốc) — ghi ở data/DATA_CARD.md:
  - price_vnd = price_usd × USD_TO_VND, làm tròn nghìn. Tỷ giá là số *(tự ước tính)*.
  - tags: so từ khoá tiếng Anh trên title + features + details (TAG_RULES). Có thể sai / thiếu.
  - aspect của đánh giá: tag đầu tiên của sản phẩm mà nội dung đánh giá nhắc tới, không có thì "_chung".
Chỉ dùng thư viện chuẩn. Chạy lại trên cùng input ra đúng cùng file.
"""
import argparse
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

USD_TO_VND = 26_000  # (tự ước tính) — tỷ giá quy đổi để so với ngân sách VND người dùng nhập
MAX_REVIEWS_PER_PRODUCT = 10
MAX_NAME = 90
MAX_TEXT = 500

CATEGORY = {"Headphones": "tai_nghe", "Mouse": "chuot", "Keyboard": "ban_phim"}

# tag (khớp TAG_VOCAB trong codebase/tools.py) → regex tiếng Anh
TAG_RULES = {
    "bluetooth": r"bluetooth",
    "khong_day": r"wireless|cordless|2\.4\s?g(hz)?\b",
    "co_day": r"\bwired\b|3\.5\s?mm|\busb[- ]?(c\s)?cable\b|\bcorded\b",
    "chong_on_chu_dong": r"active noise|\banc\b|hybrid noise",
    "mic": r"\bmic\b|\bmics\b|microphone",
    "nhe": r"light[- ]?weight|ultra[- ]light",
    "bass_manh": r"\bbass\b",
    "gaming": r"gaming|\bgamer",
    "chong_nuoc": r"waterproof|water[- ]resistant|sweat[- ]?proof|sweat[- ]resistant|\bipx\d",
    "the_thao": r"\bsports?\b|running|workout|\bgym\b|ear[- ]?hooks?",
    "im_lang": r"silent|quiet|noiseless",
    "cong_thai_hoc": r"ergonomic",
    "nho_gon": r"portable|compact|\bmini\b|travel",
    "co": r"mechanical",
    "hot_swap": r"hot[- ]?swap",
    "mong": r"\bslim\b|ultra[- ]?thin|low[- ]profile",
    "nhieu_thiet_bi": r"multi[- ]?device|multi[- ]?point|\b[23] devices|switch between|easy[- ]switch",
    "rgb": r"\brgb\b|backlit|backlight",
}
# tag dựa trên con số
BATTERY_HOURS_MIN = 30  # pin_trau: ≥30 giờ (tai nghe) hoặc ghi pin theo tháng
DPI_MIN = 8000          # dpi_cao

# khoá trong details giữ lại làm specs (theo thứ tự ưu tiên)
SPEC_KEYS = [
    "Brand", "Model Name", "Connectivity Technology", "Connectivity", "Form Factor",
    "Headphones Form Factor", "Ear Placement", "Noise Control", "Battery Life",
    "Keyboard Description", "Switch Type", "Movement Detection Technology", "Number of Buttons",
    "Maximum Sensitivity", "Hand Orientation", "Special Feature", "Item Weight", "Color",
]
MAX_SPECS = 8


def _read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def _text_of(v):
    if v is None:
        return ""
    if isinstance(v, dict):
        return " ".join("%s %s" % (k, _text_of(x)) for k, x in v.items())
    if isinstance(v, (list, tuple)):
        return " ".join(_text_of(x) for x in v)
    return str(v)


def _short(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def tags_for(p):
    blob = " ".join(_text_of(p.get(k)) for k in ("title", "features", "details")).lower()
    tags = [t for t, rx in TAG_RULES.items() if re.search(rx, blob)]
    if "bluetooth" in tags and "khong_day" not in tags:
        tags.append("khong_day")  # bluetooth là không dây
    hours = [int(h) for h in re.findall(r"(\d{2,3})\s*\+?\s*(?:hours?|hrs?)\b", blob)]
    if any(h >= BATTERY_HOURS_MIN for h in hours) or re.search(r"\d+\s*(?:-|to)?\s*months?\s+(?:of\s+)?battery", blob):
        tags.append("pin_trau")
    dpis = [int(d.replace(",", "")) for d in re.findall(r"(\d{1,2},?\d{3})\s*dpi", blob)]
    if any(d >= DPI_MIN for d in dpis):
        tags.append("dpi_cao")
    order = list(TAG_RULES) + ["pin_trau", "dpi_cao"]
    return sorted(set(tags), key=order.index)


def specs_for(p):
    details = p.get("details") or {}
    specs = {}
    for k in SPEC_KEYS:
        v = details.get(k)
        if v not in (None, "", [], {}):
            specs[k] = _short(_text_of(v), 60)
        if len(specs) >= MAX_SPECS:
            break
    if p.get("store") and "Brand" not in specs:
        specs["Store"] = _short(p["store"], 60)
    return specs


# regex khi đọc NỘI DUNG ĐÁNH GIÁ (người dùng viết thoải mái hơn mô tả sản phẩm); thiếu thì dùng TAG_RULES
ASPECT_RULES = {
    "chong_on_chu_dong": r"noise[- ]?cancel|\banc\b|active noise",
    "nhe": r"\blight(weight)?\b",
    "pin_trau": r"battery",
    "dpi_cao": r"\bdpi\b|sensor",
    "co": r"mechanical|switches",
}


def aspect_for(text, product_tags):
    t = (text or "").lower()
    for tag in product_tags:
        rx = ASPECT_RULES.get(tag) or TAG_RULES.get(tag)
        if rx and re.search(rx, t):
            return tag
    return "_chung"


def build(raw_dir, out_dir, max_reviews):
    raw_products = _read_jsonl(os.path.join(raw_dir, "products.jsonl"))
    raw_reviews = _read_jsonl(os.path.join(raw_dir, "reviews.jsonl"))

    products, skipped = [], 0
    for p in sorted(raw_products, key=lambda x: (x.get("smartbuy_category") or "", x.get("parent_asin") or "")):
        cat = CATEGORY.get(p.get("smartbuy_category"))
        price = p.get("price_usd")
        if not cat or not p.get("parent_asin") or not isinstance(price, (int, float)) or price <= 0:
            skipped += 1
            continue
        rating = p.get("average_rating")
        products.append({
            "product_id": p["parent_asin"],
            "category": cat,
            "name": _short(p.get("title"), MAX_NAME),
            "price_vnd": int(round(price * USD_TO_VND, -3)),
            "price_usd": round(float(price), 2),
            "tags": tags_for(p),
            "specs": specs_for(p),
            "rating": round(float(rating), 1) if isinstance(rating, (int, float)) else None,
            "rating_count": int(p.get("rating_number") or 0),
            "label": "amazon_reviews_2023",
            "source": "Amazon Reviews 2023 · Electronics · parent_asin %s" % p["parent_asin"],
        })
    tags_of = {p["product_id"]: p["tags"] for p in products}

    by_pid = {}
    for r in raw_reviews:
        pid = r.get("parent_asin")
        if pid in tags_of and isinstance(r.get("text"), str) and r["text"].strip():
            by_pid.setdefault(pid, []).append(r)

    reviews = []
    for p in products:
        pid = p["product_id"]
        rows = sorted(by_pid.get(pid, []),
                      key=lambda r: (-(r.get("helpful_vote") or 0), -(r.get("timestamp") or 0), r.get("review_id") or ""))
        for r in rows[:max_reviews]:
            text = re.sub(r"<br\s*/?>", " ", r["text"])
            rid_src = r.get("review_id") or hashlib.sha256(text.encode("utf-8")).hexdigest()
            reviews.append({
                "review_id": "A-%s" % rid_src[:12],
                "product_id": pid,
                "rating": int(round(float(r.get("rating") or 0))),
                "aspect": aspect_for(text, p["tags"]),
                "title": _short(r.get("title"), 120),
                "text": _short(text, MAX_TEXT),
                "helpful_vote": int(r.get("helpful_vote") or 0),
                "verified_purchase": bool(r.get("verified_purchase")),
            })

    ids = [r["review_id"] for r in reviews]
    if len(ids) != len(set(ids)):
        sys.exit("Lỗi: review_id bị trùng sau khi rút gọn — tăng độ dài mã trong build().")

    os.makedirs(out_dir, exist_ok=True)
    for fname, rows in (("products.json", products), ("reviews.json", reviews)):
        with open(os.path.join(out_dir, fname), "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)

    by_cat = {}
    for p in products:
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    no_review = sum(1 for p in products if p["product_id"] not in by_pid)
    print("Đã ghi %d sản phẩm %s, %d đánh giá → %s" % (len(products), by_cat, len(reviews), out_dir))
    print("Bỏ qua %d sản phẩm thiếu loại / giá; %d sản phẩm không có đánh giá" % (skipped, no_review))


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw-dir", default=os.path.join(HERE, "amazon_raw"))
    ap.add_argument("--out-dir", default=HERE)
    ap.add_argument("--max-reviews", type=int, default=MAX_REVIEWS_PER_PRODUCT)
    a = ap.parse_args()
    if not os.path.exists(os.path.join(a.raw_dir, "products.jsonl")):
        sys.exit("Không thấy %s/products.jsonl — giải nén amazon_raw.zip (xuất từ Colab) vào đó trước." % a.raw_dir)
    build(a.raw_dir, a.out_dir, a.max_reviews)


if __name__ == "__main__":
    main()
