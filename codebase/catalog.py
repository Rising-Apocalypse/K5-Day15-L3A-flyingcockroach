"""Catalog cho giao diện web SmartBuy — duyệt, tìm, lọc, sắp xếp, chi tiết, so sánh (UC-02, UC-03, UC-06).

Chỉ dùng thư viện chuẩn. KHÔNG gọi AI: spec UC-02 ghi "tìm kiếm không phụ thuộc AI", nên phần này vẫn chạy
khi model lỗi (AC-CAT-01, BR-ST-07).

Nguồn dữ liệu (ưu tiên từ trên xuống):
  1. data/catalog.json                       catalog THẬT — dựng từ Amazon Reviews 2023 bằng codebase/build_catalog.py
  2. frontend/demo/catalog.synthetic.json    catalog DEMO cùng schema (sản phẩm, review hư cấu)

Khuôn bản ghi (schema "smartbuy.catalog/v2"): mỗi sản phẩm là một bản ghi metadata của Amazon Reviews 2023
(parent_asin, title, store, average_rating, rating_number, price, features, description, images, categories,
details…), thêm `reviews` (các review đã chọn, cùng trường với file review gốc) và khối `smartbuy` do pipeline
suy ra (category, status, attributes đã kiểm định, rating_hist…). Xem frontend/README.md.

Mã bằng chứng dùng chung cho giao diện và agent:
  T   tiêu đề sản phẩm          D1…Dn  từng cặp trong `details` (theo thứ tự)
  F1… từng dòng `features`      R1…Rn  từng review trong `reviews` (theo thứ tự)
Nguồn trong khối smartbuy có thể viết "D:<tên khoá>" — được đổi sang D<số> khi nạp.

Nhóm có thể dùng lại search() / detail() trong tools.py (vd công cụ search_catalog) để website và agent
đọc chung một nguồn — đúng BR-CTX-07.
"""
import datetime
import json
import os
import re
import threading
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REAL_PATH = os.path.join(ROOT, "data", "catalog.json")
DEMO_PATH = os.path.join(ROOT, "frontend", "demo", "catalog.synthetic.json")

BAYES_M = 20          # m trong điểm Bayes (spec UC-05: "m=20" — đề xuất, CHƯA nghiệm thu)
SORTS = ("relevance", "price_asc", "price_desc", "rating", "reviews")

_cache = {"path": None, "mtime": None, "data": None}
_lock = threading.Lock()


class CatalogError(ValueError):
    """Lỗi đầu vào của người dùng (vd khoảng giá sai) — web trả HTTP 400 kèm lời nhắn."""


def source_path():
    return REAL_PATH if os.path.exists(REAL_PATH) else DEMO_PATH


def load():
    """Đọc catalog (cache theo thời điểm sửa file), chuẩn hoá bản ghi Amazon, tính sẵn giá VNĐ và điểm Bayes."""
    path = source_path()
    mtime = os.path.getmtime(path)
    with _lock:
        if _cache["path"] != path or _cache["mtime"] != mtime:
            with open(path, encoding="utf-8-sig") as f:
                data = json.load(f)
            _prepare(data)
            _cache.update(path=path, mtime=mtime, data=data)
        return _cache["data"]


# ───────── chuẩn hoá bản ghi Amazon Reviews 2023 ─────────

def as_dict(value):
    """`details` là dict (file JSONL gốc) hoặc chuỗi JSON (bản load bằng thư viện datasets)."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip().startswith("{"):
        try:
            v = json.loads(value)
            return v if isinstance(v, dict) else {}
        except ValueError:
            return {}
    return {}


def as_images(value):
    """`images` là list[dict] (JSONL gốc) hoặc dict các list (bản thư viện datasets) → list[dict]."""
    if isinstance(value, list):  # list[dict] (JSONL gốc) hoặc list[str] link ảnh (bản xuất Colab v2)
        return [im if isinstance(im, dict) else {"large": im} for im in value if isinstance(im, (dict, str)) and im]
    if isinstance(value, dict):
        keys = [k for k in ("thumb", "large", "hi_res", "variant") if isinstance(value.get(k), list)]
        n = max((len(value[k]) for k in keys), default=0)
        return [{k: value[k][i] if i < len(value[k]) else None for k in keys} for i in range(n)]
    return []


def as_price(value):
    """`price` có thể là số, None, chuỗi 'None', hoặc '$12.99' → float USD hoặc None (thiếu giá — AF-02)."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) if value > 0 else None
    if isinstance(value, str):
        m = re.search(r"\d+(?:\.\d+)?", value.replace(",", ""))
        return float(m.group(0)) if m and value.strip().lower() not in ("none", "null", "") else None
    return None


def clean_text(text):
    text = re.sub(r"<br\s*/?>", "\n", str(text or ""), flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def ts_month(ts):
    """timestamp (ms hoặc s) → 'YYYY-MM'."""
    try:
        ts = float(ts)
    except (TypeError, ValueError):
        return ""
    if ts > 1e11:
        ts /= 1000.0
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime("%Y-%m")


def best_image(im):
    return im.get("hi_res") or im.get("large") or im.get("thumb") if isinstance(im, dict) else None


GENERIC = set("""wireless bluetooth headphones headphone headset earbuds earbud earphones over on in ear the with and for
mouse mice keyboard mechanical gaming noise cancelling canceling cancellation active hybrid true deep bass ergonomic ultra
slim portable rechargeable usb wired premium overhead stereo hifi hi-fi compact silent quiet optical computer laptop pc
mac new upgraded 2023 2022 2021""".split())


def short_name(title, brand):
    """Tên ngắn từ tiêu đề Amazon: ưu tiên token có số (mã model: WH-1000XM4, M720, K2), bỏ chữ chung chung."""
    t = re.sub(r"[\[(][^\])]*[\])]", " ", title or "")      # bỏ cụm trong ngoặc: "[2022 Upgraded]", "(CE)"
    t = re.split(r"[,(\[|–—]| - ", t)[0]
    if brand and t.lower().startswith(brand.lower()):
        t = t[len(brand):]
    words = [w.strip(".,;:") for w in t.split() if w.strip(".,;:")]
    for i, w in enumerate(words[:6]):
        if re.search(r"\d", w) and not re.fullmatch(r"\d+(\.\d+)?%?|\d+(h|hrs?|hz|ghz|mm|dpi|mah)", w, re.I):
            chunk = words[max(0, i - 2):i + 1]          # "MX Master 3S", "WH-1000XM4", "K2"
            while len(chunk) > 1 and chunk[0].lower() in GENERIC:
                chunk = chunk[1:]
            return " ".join(chunk)
    keep = [w for w in words if w.lower() not in GENERIC and w.lower() not in ("dpi", "mah", "hz")
            and not re.fullmatch(r"\d+(\.\d+)?%?", w)]
    return " ".join((keep or words)[:3]) or (title or "")[:30]


def clean_model(model, brand, title):
    """Model để giao diện in "<brand> <model>": bỏ tên hãng lặp ở đầu ("JBL" + "JBL TUNE 500BT"), bỏ đoạn ngoặc
    cắt dở ("Pack Apple [Apple"); rỗng / quá dài thì lấy tên ngắn từ tiêu đề."""
    m = re.split(r"[\[(]", str(model or ""))[0].strip(" -,")
    if brand and m.lower().startswith(brand.lower() + " "):
        m = m[len(brand):].strip()
    if not m or len(m) > 40 or (brand and m.lower() == brand.lower()):
        m = short_name(title, brand)
    m = re.split(r"[\[(]| - ", m)[0].strip(" -,")                # tên ngắn từ tiêu đề cũng có thể cắt dở ngoặc
    if brand and m.lower().startswith(brand.lower() + " "):
        m = m[len(brand):].strip()
    return m or (title or "")[:30]


def _hist(reviews):
    h = {}
    for r in reviews:
        try:
            s = str(int(round(float(r.get("rating")))))
        except (TypeError, ValueError):
            continue
        h[s] = h.get(s, 0) + 1
    return h


def normalize(raw):
    """Bản ghi Amazon (+ smartbuy) → dạng phẳng giao diện dùng. Bản ghi đã phẳng (có `id`) giữ nguyên."""
    if "parent_asin" not in raw:
        return raw
    sb = raw.get("smartbuy") or {}
    details = as_dict(raw.get("details"))
    images = as_images(raw.get("images"))
    features = [clean_text(f) for f in (raw.get("features") or []) if f]
    reviews = raw.get("reviews") or []
    brand = details.get("Brand") or raw.get("store") or ""

    evidence = [{"id": "T", "kind": "title", "text": raw.get("title") or ""}]
    dkey = {}
    for i, (k, v) in enumerate(details.items(), 1):
        dkey[k] = "D%d" % i
        evidence.append({"id": "D%d" % i, "kind": "detail", "field": k, "text": v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)})
    for i, f in enumerate(features, 1):
        evidence.append({"id": "F%d" % i, "kind": "feature", "text": f})
    for i, r in enumerate(reviews, 1):
        evidence.append({
            "id": "R%d" % i, "kind": "review", "rating": r.get("rating"), "title": clean_text(r.get("title")),
            "text": clean_text(r.get("text")), "date": ts_month(r.get("timestamp")),
            "verified": bool(r.get("verified_purchase")), "helpful": int(r.get("helpful_vote") or 0),
            "asin": r.get("asin"), "variant": bool(r.get("asin") and r.get("asin") != raw.get("parent_asin")),
            "images": len(r.get("images") or []),
        })

    def src(s):
        return dkey.get(s[2:], s) if isinstance(s, str) and s.startswith("D:") else s

    attrs = {}
    for k, a in (sb.get("attributes") or {}).items():
        a = dict(a or {})
        if a.get("source"):
            a["source"] = src(a["source"])
        if a.get("values"):
            a["values"] = [dict(v, source=src(v.get("source"))) for v in a["values"]]
        attrs[k] = a

    return {
        "id": raw["parent_asin"],
        "parent_asin": raw["parent_asin"],
        "status": sb.get("status", "PENDING"),
        "pending_reasons": sb.get("pending_reasons") or [],
        "category": sb.get("category"),
        "brand": brand,
        "store": raw.get("store") or "",
        "model": clean_model(sb.get("model") or details.get("Model Name"), brand, raw.get("title")),
        "title": raw.get("title") or "",
        "main_category": raw.get("main_category") or "",
        "categories": raw.get("categories") or [],
        "price_usd": as_price(raw.get("price")),
        "rating": raw.get("average_rating"),
        "rating_number": int(raw.get("rating_number") or 0),
        "image": best_image(images[0]) if images else None,
        "images": [{"src": best_image(im), "thumb": im.get("thumb"), "variant": im.get("variant")} for im in images if best_image(im)],
        "tone": sb.get("tone"),
        "shape": sb.get("shape"),
        "attributes": attrs,
        "reviews_collected": int(sb.get("reviews_total") or len(reviews)),
        "rating_hist": sb.get("rating_hist") or _hist(reviews),
        "insights": sb.get("insights") or [],
        "insights_method": sb.get("insights_method") or "",
        "evidence": evidence,
        "details": details,
        "features": features,
        "description": [clean_text(d) for d in (raw.get("description") or []) if d],
        "_raw": raw,
    }


def _prepare(data):
    fx = (data.get("fx") or {}).get("usd_vnd")
    products = [normalize(p) for p in data.get("products", [])]
    data["products"] = products
    by_cat = {}
    for p in products:
        p.setdefault("status", "APPROVED")
        p.setdefault("attributes", {})
        p.setdefault("evidence", [])
        p.setdefault("insights", [])
        p.setdefault("rating_hist", {})
        price = p.get("price_usd")
        p["price_vnd"] = int(round(price * fx / 1000.0) * 1000) if (price is not None and fx) else None
        if p["status"] == "APPROVED" and p.get("rating") is not None:
            by_cat.setdefault(p.get("category"), []).append(p["rating"])
    means = {c: sum(v) / len(v) for c, v in by_cat.items() if v}
    for p in products:
        p["q_score"] = _bayes(p, means.get(p.get("category"), 4.0))


def _bayes(p, mean):
    """Q của spec: điểm sao hiệu chỉnh theo số lượt đánh giá, quy về 0–100."""
    r, v = p.get("rating"), p.get("rating_number") or 0
    if r is None:
        return None
    q = (v / (v + BAYES_M)) * r + (BAYES_M / (v + BAYES_M)) * mean
    return round((q - 1) / 4 * 100, 1)


def _norm(text):
    """Chữ thường, bỏ dấu tiếng Việt — để 'Bàn phím' khớp 'ban phim'."""
    text = unicodedata.normalize("NFD", (text or "").lower().replace("đ", "d"))
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


# Cụm tiếng Việt hay gõ vào ô tìm kiếm mà tiêu đề Amazon (tiếng Anh) không có: (cụm đã bỏ dấu, ngành, từ tiếng Anh).
# Ngành ≠ None: cụm là tên ngành — đã khớp nhờ bộ lọc ngành. Danh sách từ: tiêu đề chứa một trong các từ là khớp.
# Thứ tự có nghĩa: bỏ dấu thì "có" và "cơ" cùng là "co", nên "co day" (có dây) phải tách trước "ban phim co" (bàn phím cơ).
# Tên ngành (Tai nghe, Chuột, Bàn phím) lấy từ nhãn trong catalog, xử lý sau cùng.
VI_TERMS = [
    ("khong day", None, ["wireless", "bluetooth"]),
    ("co day", None, ["wired"]),
    ("chong on", None, ["noise cancel", "noise-cancel"]),
    ("choi game", None, ["gaming"]),
    ("nhet tai", None, ["earbud", "in-ear", "in ear"]),
    ("chup tai", None, ["over-ear", "over ear", "on-ear", "on ear"]),
    ("trum tai", None, ["over-ear", "over ear"]),
    ("cong thai hoc", None, ["ergonomic"]),
    ("ban phim co", "keyboard", ["mechanical"]),
]
# Từ đệm tiếng Việt đứng riêng ("tai nghe CÓ mic", "chuột CHO dân văn phòng") — không bắt tiêu đề phải chứa.
VI_STOP = {"co", "cho", "de", "va", "voi", "loai", "mua", "can", "minh", "toi", "cai", "chiec", "mot"}


def parse_query(q, cats):
    """Từ khoá đã chuẩn hoá → (ngành được gọi tên, nhóm từ đồng nghĩa, từ còn lại phải có trong tên/hãng/ASIN).

    'tai nghe khong day sony' → (['headphones'], [['wireless', 'bluetooth']], ['sony'])
    """
    labels = sorted(((_norm(c.get("label")), k, None) for k, c in cats.items() if c.get("label")),
                    key=lambda t: -len(t[0]))
    named, groups = [], []
    for phrase, cat, words in VI_TERMS + labels:
        pat = r"(?<!\S)" + re.escape(phrase) + r"(?!\S)"
        if not re.search(pat, q):
            continue
        if cat and cat not in named:
            named.append(cat)
        if words:
            groups.append(words)
        q = re.sub(pat, " ", q)
    return named, groups, [t for t in q.split() if t not in VI_STOP]


def _text_match(p, groups, tokens):
    hay = _norm(" ".join(str(p.get(k) or "") for k in ("title", "brand", "store", "model", "id")))
    return all(t in hay for t in tokens) and all(any(w in hay for w in g) for g in groups)


def published(data=None):
    """Chỉ sản phẩm APPROVED mới được công bố (BR-CAT, AC-DATA-01)."""
    data = data or load()
    return [p for p in data["products"] if p.get("status") == "APPROVED"]


def meta(data=None):
    data = data or load()
    pending = sum(1 for p in data["products"] if p.get("status") != "APPROVED")
    pub = published(data)
    return {
        "schema": data.get("schema", "smartbuy.catalog/v1"),
        "version": data.get("catalog_version", "?"),
        "synthetic": bool(data.get("synthetic")),
        "note": data.get("note", ""),
        "dataset": data.get("source") or {},
        "source": os.path.relpath(source_path(), ROOT).replace(os.sep, "/"),
        "published": len(pub),
        "hidden_pending": pending,
        "with_images": sum(1 for p in pub if p.get("image")),
        "fx": data.get("fx") or {},
        "categories": {k: {"label": v.get("label", k), "count": sum(1 for p in pub if p.get("category") == k),
                           "coverage": v.get("coverage") or {}, "gate": v.get("gate")}
                       for k, v in (data.get("categories") or {}).items()},
        "attribute_labels": data.get("attribute_labels") or {},
    }


def summary(p):
    """Bản rút gọn cho thẻ / bảng sản phẩm — không kèm review."""
    keep = ("id", "parent_asin", "category", "brand", "store", "model", "title", "tone", "shape", "image",
            "price_usd", "price_vnd", "rating", "rating_number", "reviews_collected", "q_score", "attributes")
    return {k: p.get(k) for k in keep}


def _int(value, name):
    if value in (None, ""):
        return None
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        raise CatalogError("%s phải là số" % name)
    if n < 0:
        raise CatalogError("%s không được âm" % name)
    return n


def _list(value):
    if value in (None, ""):
        return []
    if isinstance(value, (list, tuple)):
        out = []
        for v in value:
            out.extend(_list(v))
        return out
    return [s.strip() for s in str(value).split(",") if s.strip()]


def verified_tags(p, key):
    a = (p.get("attributes") or {}).get(key) or {}
    return set(a.get("tags") or []) if a.get("status") == "VERIFIED" else set()


def search(params):
    """params: category, q, min_vnd, max_vnd, brand (list), min_rating, sort, và bộ lọc thuộc tính theo danh mục.

    Quy tắc từ spec:
      - Thiếu giá: vẫn hiện nếu KHÔNG lọc ngân sách; có lọc ngân sách thì không xác nhận khớp (AF-02, EX-03).
      - Thuộc tính chưa xác minh (UNKNOWN / CONFLICT) không được tính là khớp bộ lọc (AF-03).
      - Bộ lọc kỹ thuật chỉ bật khi danh mục đạt data gate (AC-CAT-02) — danh sách ở categories.<cat>.filters.
    """
    data = load()
    cats = data.get("categories") or {}
    category = (params.get("category") or "").strip()
    if category == "all":  # tab "Tất cả" của giao diện = không lọc ngành
        category = ""
    if category and category not in cats:
        raise CatalogError("Danh mục không có trong catalog: %s" % category)
    min_vnd = _int(params.get("min_vnd"), "Giá từ")
    max_vnd = _int(params.get("max_vnd"), "Giá đến")
    if min_vnd is not None and max_vnd is not None and min_vnd > max_vnd:
        raise CatalogError("Khoảng giá không hợp lệ: giá từ lớn hơn giá đến")  # EF-01: không truy vấn sai
    try:
        min_rating = float(params.get("min_rating")) if params.get("min_rating") not in (None, "") else None
    except (TypeError, ValueError):
        raise CatalogError("Đánh giá tối thiểu phải là số")
    sort = params.get("sort") or "relevance"
    if sort not in SORTS:
        sort = "relevance"

    # Từ khoá: tên ngành tiếng Việt ("tai nghe") đã khớp nhờ bộ lọc ngành; vài cụm tiếng Việt ("không dây") khớp từ
    # tiếng Anh tương ứng; từ còn lại phải có trong tên / hãng / ASIN. Gõ tên ngành khác ("chuột" khi đang ở Tai nghe)
    # thì không có kết quả ở đây, kèm gợi ý q_category để giao diện mời chuyển ngành.
    named, groups, tokens = parse_query(_norm(params.get("q") or "").strip(), cats)
    other = next((k for k in named if k != category), None) if category and category not in named else None

    in_cat = [p for p in published(data) if (p.get("category") == category if category else
                                             not named or p.get("category") in named)]
    gates = (cats.get(category) or {}).get("filters") or {}

    def text_ok(p):
        return not other and _text_match(p, groups, tokens)

    q_category = None
    if other:
        n = sum(1 for p in published(data) if p.get("category") == other and _text_match(p, groups, tokens))
        q_category = {"category": other, "label": (cats.get(other) or {}).get("label", other), "count": n}
    # Đang ở một ngành và có từ khoá: đếm sản phẩm khớp từ khoá ở mọi ngành, để giao diện mời "Tìm trong tất cả".
    q_all_count = None
    if category and (named or groups or tokens):
        q_all_count = sum(1 for p in published(data)
                          if (not named or p.get("category") in named) and _text_match(p, groups, tokens))

    def price_ok(p):
        if min_vnd is None and max_vnd is None:
            return True
        if p.get("price_vnd") is None:
            return False
        return (min_vnd is None or p["price_vnd"] >= min_vnd) and (max_vnd is None or p["price_vnd"] <= max_vnd)

    attr_filters = {key: set(_list(params.get(key))) for key in gates}
    attr_filters = {k: v for k, v in attr_filters.items() if v}

    def attrs_ok(p):
        return all(verified_tags(p, key) & wanted for key, wanted in attr_filters.items())

    brands = set(_list(params.get("brand")))
    base = [p for p in in_cat if text_ok(p) and price_ok(p) and attrs_ok(p)
            and (min_rating is None or (p.get("rating") or 0) >= min_rating)]
    items = [p for p in base if not brands or p.get("brand") in brands]

    keyfn = {
        "relevance": lambda p: (-(p.get("q_score") or 0), p["id"]),
        "price_asc": lambda p: (p.get("price_vnd") is None, p.get("price_vnd") or 0, p["id"]),
        "price_desc": lambda p: (p.get("price_vnd") is None, -(p.get("price_vnd") or 0), p["id"]),
        "rating": lambda p: (-(p.get("rating") or 0), -(p.get("rating_number") or 0), p["id"]),
        "reviews": lambda p: (-(p.get("rating_number") or 0), p["id"]),
    }[sort]
    items.sort(key=keyfn)

    brand_counts = {}
    for p in base:
        brand_counts[p.get("brand")] = brand_counts.get(p.get("brand"), 0) + 1
    for p in in_cat:  # thương hiệu không còn kết quả vẫn hiện (đếm 0) để người dùng thấy vì sao
        brand_counts.setdefault(p.get("brand"), 0)
    attr_counts = {}
    for key, options in gates.items():
        attr_counts[key] = {tag: sum(1 for p in in_cat if tag in verified_tags(p, key)) for tag in options}
    no_price = sum(1 for p in in_cat if p.get("price_vnd") is None)

    return {
        "items": [summary(p) for p in items],
        "total": len(items),
        "category": category,
        "category_switched_from": switched_from,
        "category_total": len(in_cat),
        "facets": {
            "brands": sorted(({"name": b, "count": c} for b, c in brand_counts.items()), key=lambda x: x["name"] or ""),
            "attributes": attr_counts,
            "no_price": no_price,
        },
        "gates": gates,
        "coverage": (cats.get(category) or {}).get("coverage") or {},
        "filter_candidates": (cats.get(category) or {}).get("filter_candidates") or list(gates),
        "gate": (cats.get(category) or {}).get("gate"),
        "sort": sort,
        "q_category": q_category,
        "q_all_count": q_all_count,
        "catalog": meta(data),
    }


def detail(pid, raw=False):
    """Chi tiết một sản phẩm đã công bố, hoặc None (EF-01: ID không tồn tại / chưa duyệt thì không công bố).
    raw=True kèm bản ghi gốc (metadata + 2 review đầu, đã bỏ user_id) cho mục "JSON gốc"."""
    data = load()
    for p in published(data):
        if p["id"] == pid:
            out = {k: v for k, v in p.items() if k != "_raw"}
            cat = (data.get("categories") or {}).get(p["category"]) or {}
            out["category_label"] = cat.get("label", p["category"])
            out["compare_keys"] = cat.get("compare", [])
            if raw and p.get("_raw"):
                r = {k: v for k, v in p["_raw"].items() if k not in ("reviews", "smartbuy")}
                r["reviews (2 đầu)"] = [{k: v for k, v in x.items() if k != "user_id"} for x in (p["_raw"].get("reviews") or [])[:2]]
                out["raw"] = r
            return out
    return None


def details(ids):
    out, missing = [], []
    for pid in ids:
        d = detail(pid)
        (out if d else missing).append(d if d else pid)
    return out, missing


def compare(ids):
    """BR-CMP: 2–3 sản phẩm, cùng ngành, không trùng ID; tiêu chí lấy từ cấu hình danh mục."""
    ids = _list(ids)
    seen, unique = set(), []
    for pid in ids:
        if pid not in seen:
            seen.add(pid)
            unique.append(pid)
    items, missing = details(unique)
    problems = []
    if missing:
        problems.append("Không còn công bố: %s" % ", ".join(missing))  # EF-02: loại khỏi bảng
    if len(items) < 2:
        problems.append("Cần ít nhất 2 sản phẩm để so sánh")
    if len(items) > 3:
        problems.append("Chỉ so sánh tối đa 3 sản phẩm")
        items = items[:3]
    cats = {p["category"] for p in items}
    if len(cats) > 1:
        problems.append("Các sản phẩm khác ngành hàng — so sánh riêng từng ngành")
    data = load()
    cat = items[0]["category"] if items else ""
    keys = ((data.get("categories") or {}).get(cat) or {}).get("compare", [])
    labels = data.get("attribute_labels") or {}
    return {
        "items": items,
        "rows": [{"key": k, "label": labels.get(k, k)} for k in keys],
        "same_category": len(cats) <= 1,
        "problems": problems,
        "missing": missing,
    }
