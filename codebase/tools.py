"""Công cụ của bài toán — tư vấn chọn tai nghe / chuột / bàn phím (Track D).

Mỗi công cụ là một hàm có @tool; docstring ghi: tên · input · output · có tác động ra ngoài không.
KHÔNG có công cụ nào tác động ra ngoài: không đặt hàng, không thanh toán, không thêm vào giỏ.

Dữ liệu: data/products.json + data/reviews.json, sinh bằng một trong hai script (cùng cấu trúc trường):
  - data/make_synthetic.py   → dữ liệu GIẢ LẬP (seed 2711), nhãn "synthetic"
  - data/build_from_amazon.py → tập con Amazon Reviews 2023, nhãn "amazon_reviews_2023"
  Xem data/DATA_CARD.md.

Nguyên tắc: điều kiện bắt buộc (loại sản phẩm, ngân sách) đọc và kiểm bằng CODE, không để AI tự cộng / tự lọc.
"""
import json
import os
import re

from tracing import tool, TOOLS  # noqa: F401

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

CATEGORIES = {"tai_nghe": "tai nghe", "chuot": "chuột", "ban_phim": "bàn phím"}

# Từ người dùng hay gõ → loại sản phẩm được hỗ trợ
CATEGORY_WORDS = {
    "tai_nghe": ["tai nghe", "headphone", "headset", "earbud", "earphone", "airpod"],
    "chuot": ["chuột", "chuot", "mouse"],
    "ban_phim": ["bàn phím", "ban phim", "keyboard"],
}
# Loại sản phẩm hay bị hỏi nhưng NGOÀI phạm vi lát cắt
OUT_OF_SCOPE_WORDS = ["điện thoại", "laptop", "máy tính bảng", "ipad", "tivi", "loa", "màn hình", "đồng hồ",
                      "nồi", "quần", "áo", "giày", "máy giặt", "tủ lạnh", "camera", "máy ảnh"]

# Bộ tag cố định (khớp trường tags trong data) + từ khoá gợi ý. AI chỉ được chọn tag trong bộ này.
TAG_VOCAB = {
    "bluetooth": ["bluetooth", "không dây", "khong day", "wireless"],
    "khong_day": ["không dây", "khong day", "wireless"],
    "co_day": ["có dây", "co day", "cắm dây"],
    "chong_on_chu_dong": ["chống ồn", "chong on", "anc", "khử ồn"],
    "pin_trau": ["pin trâu", "pin lâu", "pin khoẻ", "pin khỏe"],
    "mic": ["mic", "micro", "họp", "học online", "gọi điện", "call"],
    "nhe": ["nhẹ"],
    "bass_manh": ["bass"],
    "gaming": ["game", "gaming", "chơi game"],
    "chong_nuoc": ["chống nước", "mồ hôi"],
    "the_thao": ["chạy bộ", "thể thao", "gym", "tập luyện"],
    "im_lang": ["bấm êm", "gõ êm", "click êm", "yên tĩnh", "im lặng", "không ồn", "thư viện", "silent"],
    "cong_thai_hoc": ["công thái học", "ergo", "mỏi tay", "cổ tay"],
    "dpi_cao": ["dpi"],
    "nho_gon": ["nhỏ gọn", "mang đi", "du lịch"],
    "co": ["phím cơ", "bàn phím cơ", "mechanical", "switch"],
    "hot_swap": ["hot swap", "hotswap", "thay switch"],
    "mong": ["mỏng"],
    "nhieu_thiet_bi": ["nhiều thiết bị", "nhiều máy", "3 thiết bị", "ipad"],
    "rgb": ["rgb", "led", "đèn"],
}

PURCHASE_WORDS = ["mua luôn", "mua giùm", "mua giúp", "mua hộ", "đặt hàng", "đặt mua", "chốt đơn",
                  "thanh toán", "thêm vào giỏ", "add to cart", "checkout"]


def _load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


_PRODUCTS = None
_REVIEWS = None


def _db():
    global _PRODUCTS, _REVIEWS
    if _PRODUCTS is None:
        _PRODUCTS = {p["product_id"]: p for p in _load("products.json")}
        _REVIEWS = _load("reviews.json")
    return _PRODUCTS, _REVIEWS


def _amount(num, unit):
    v = float(num.replace(",", "."))
    unit = (unit or "").lower()
    if unit in ("triệu", "tr", "củ", "m"):
        return int(v * 1_000_000)
    if unit in ("k", "nghìn", "ngàn"):
        return int(v * 1_000)
    return int(v)


@tool
def parse_constraints(text: str) -> dict:
    """parse_constraints — đọc ĐIỀU KIỆN BẮT BUỘC bằng code (không dùng AI).
    Input: tin nhắn người dùng (str).
    Output: {"categories": [...], "out_of_scope": [...], "min_price": int|None, "max_price": int|None,
             "tags_hint": [...], "wants_purchase": bool}.
    Không tác động ra ngoài."""
    t = text.lower()
    cats = [c for c, words in CATEGORY_WORDS.items() if any(w in t for w in words)]
    oos = [w for w in OUT_OF_SCOPE_WORDS if w in t and not (w == "ipad" and cats)]

    amounts = []
    # 1tr, 1.5 triệu, 800k, 500 nghìn, 2 củ
    for m in re.finditer(r"(\d+(?:[.,]\d+)?)\s*(triệu|tr|củ|k|nghìn|ngàn)(?![a-zà-ỹ])", t):
        amounts.append(_amount(m.group(1), m.group(2)))
    # 1.000.000đ, 1,000,000 vnd, 500000
    for m in re.finditer(r"(\d{1,3}(?:[.,]\d{3})+|\d{5,})\s*(đ|vnd|vnđ|đồng)?", t):
        amounts.append(int(re.sub(r"[.,]", "", m.group(1))))
    amounts = sorted(set(a for a in amounts if a >= 10_000))

    min_price = max_price = None
    if len(amounts) >= 2:
        min_price, max_price = amounts[0], amounts[-1]
    elif len(amounts) == 1:
        if re.search(r"(trên|từ|hơn|ít nhất)\s*\d", t) and not re.search(r"(dưới|tối đa|không quá|đổ lại|max)", t):
            min_price = amounts[0]
        else:
            max_price = amounts[0]

    tags = [tag for tag, words in TAG_VOCAB.items() if any(w in t for w in words)]
    return {
        "categories": cats,
        "out_of_scope": oos,
        "min_price": min_price,
        "max_price": max_price,
        "tags_hint": tags,
        "wants_purchase": any(w in t for w in PURCHASE_WORDS),
    }


@tool
def search_products(category: str, max_price: int, min_price: int = 0, tags: list = None, limit: int = 6) -> list:
    """search_products — tìm sản phẩm trong danh mục theo loại + khoảng giá (lọc cứng) và tag (ưu tiên).
    Input: category ∈ tai_nghe|chuot|ban_phim, max_price (VND), min_price (VND), tags (list tag phải có), limit.
    Output: list sản phẩm {product_id, name, price_vnd, tags, specs, rating, rating_count}, xếp theo số tag khớp
            rồi đến điểm đánh giá. Trả [] nếu không có.
    Không tác động ra ngoài."""
    products, _ = _db()
    tags = tags or []
    hits = [p for p in products.values()
            if p["category"] == category
            and (min_price or 0) <= p["price_vnd"] <= max_price
            and all(tg in p["tags"] for tg in tags)]
    hits.sort(key=lambda p: (-(p["rating"] or 0), -p["rating_count"]))
    return [{k: p[k] for k in ("product_id", "name", "price_vnd", "tags", "specs", "rating", "rating_count")}
            for p in hits[:limit]]


@tool
def cheapest_in_category(category: str) -> dict:
    """cheapest_in_category — giá thấp nhất hiện có của một loại (để báo khi ngân sách quá thấp).
    Input: category. Output: {"product_id", "name", "price_vnd"} hoặc {} nếu loại không có.
    Không tác động ra ngoài."""
    products, _ = _db()
    rows = sorted((p for p in products.values() if p["category"] == category), key=lambda p: p["price_vnd"])
    return {k: rows[0][k] for k in ("product_id", "name", "price_vnd")} if rows else {}


@tool
def get_reviews(product_id: str, limit: int = 5) -> list:
    """get_reviews — lấy đánh giá của một sản phẩm làm bằng chứng.
    Input: product_id, limit. Output: list {review_id, rating, aspect, text}; [] nếu chưa có đánh giá.
    Không tác động ra ngoài."""
    _, reviews = _db()
    rows = [r for r in reviews if r["product_id"] == product_id][:limit]
    return [{k: r[k] for k in ("review_id", "rating", "aspect", "text")} for r in rows]


@tool
def check_shortlist(shortlist: list, constraints: dict, candidate_ids: list) -> dict:
    """check_shortlist — KIỂM BẰNG CODE danh sách AI đề xuất trước khi đưa cho người dùng.
    Input: shortlist [{product_id, reason, review_ids}], constraints {category, min_price, max_price},
           candidate_ids (sản phẩm công cụ đã trả về).
    Output: {"ok": [mục hợp lệ], "violations": [mô tả lỗi]}. Luật: ≤3 mục · không trùng · có trong danh mục và
            trong candidate_ids · đúng loại · trong khoảng giá · có ≥1 review_id và mọi review_id thuộc sản phẩm đó.
    Không tác động ra ngoài."""
    products, reviews = _db()
    owner = {r["review_id"]: r["product_id"] for r in reviews}
    ok, bad, seen = [], [], set()
    for item in shortlist or []:
        pid = str(item.get("product_id", ""))
        p = products.get(pid)
        why = None
        if pid in seen:
            why = "trùng"
        elif p is None:
            why = "không có trong danh mục (bịa sản phẩm)"
        elif pid not in candidate_ids:
            why = "không nằm trong kết quả tìm kiếm"
        elif p["category"] != constraints.get("category"):
            why = "sai loại sản phẩm"
        elif p["price_vnd"] > (constraints.get("max_price") or 0) or p["price_vnd"] < (constraints.get("min_price") or 0):
            why = "ngoài ngân sách (%d đ)" % p["price_vnd"]
        else:
            rids = item.get("review_ids") or []
            if not rids:
                why = "không có bằng chứng đánh giá"
            elif any(owner.get(r) != pid for r in rids):
                why = "trích review_id không thuộc sản phẩm"
        if why:
            bad.append("%s: %s" % (pid or "?", why))
        else:
            seen.add(pid)
            ok.append(item)
    if len(ok) > 3:
        bad.append("quá 3 mục, cắt còn 3")
        ok = ok[:3]
    return {"ok": ok, "violations": bad}


def data_label() -> str:
    """Nhãn nguồn dữ liệu đang nạp ("synthetic" | "amazon_reviews_2023" | ...) — hàm phụ, không phải công cụ."""
    labels = {p.get("label", "?") for p in _db()[0].values()}
    return labels.pop() if len(labels) == 1 else "mixed"


def product(product_id: str) -> dict:
    """Tra nhanh 1 sản phẩm để in kết quả (hàm phụ, không phải công cụ của agent)."""
    return _db()[0].get(product_id, {})
