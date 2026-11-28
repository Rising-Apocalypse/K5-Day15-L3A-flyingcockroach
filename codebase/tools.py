"""Công cụ của bài toán — tư vấn chọn tai nghe / chuột / bàn phím (Track D, SmartBuy).

Mỗi công cụ là một hàm có @tool; docstring ghi: tên · input · output · có tác động ra ngoài không.
KHÔNG có công cụ nào tác động ra ngoài: không đặt hàng, không thanh toán, không thêm vào giỏ, không sửa catalog.

Nguồn dữ liệu: ĐÚNG catalog mà giao diện web đang dùng (codebase/catalog.py) — website và agent đọc chung một nguồn:
  1. data/catalog.json — tập con Amazon Reviews 2023 (Electronics), dựng bằng
        python codebase/build_catalog.py --from-export data/amazon_raw --per-category 500 --max-reviews 20 \
            --min-ratings 10 --usd-vnd 26000
  2. frontend/demo/catalog.synthetic.json — catalog DEMO hư cấu, chỉ dùng khi chưa có file 1.
Mỗi thuộc tính trong catalog có trạng thái VERIFIED / UNKNOWN / CONFLICT và mã nguồn:
  T = tiêu đề · D<n> = một dòng `details` · F<n> = một dòng `features` · R<n> = một review của chính sản phẩm đó.

Nguyên tắc: điều kiện bắt buộc (loại, ngân sách, thuộc tính cứng) đọc và kiểm bằng CODE, không để AI tự lọc.
Thuộc tính chưa xác minh (UNKNOWN / CONFLICT) KHÔNG được tính là khớp.
"""
import re

import catalog
from tracing import tool, TOOLS  # noqa: F401

# ───────── từ vựng ─────────
CATEGORIES = {"headphones": "tai nghe", "mouse": "chuột", "keyboard": "bàn phím"}
CATEGORY_WORDS = {
    "headphones": ["tai nghe", "headphone", "headset", "earbud", "earphone", "airpod"],
    "mouse": ["chuột", "con chuột", "mouse"],
    "keyboard": ["bàn phím", "keyboard"],
}
OUT_OF_SCOPE_WORDS = ["điện thoại", "laptop", "máy tính bảng", "ipad", "tivi", "loa", "màn hình", "đồng hồ",
                      "nồi", "quần", "áo", "giày", "máy giặt", "tủ lạnh", "camera", "máy ảnh", "webcam", "router"]

PURCHASE_WORDS = ["mua luôn", "mua giùm", "mua giúp", "mua hộ", "đặt hàng", "đặt mua", "chốt đơn",
                  "thanh toán", "thêm vào giỏ", "add to cart", "checkout", "trả tiền"]
FABRICATE_PATTERNS = [
    r"bỏ qua (tất cả |mọi |hết )?(các )?(quy tắc|luật|hướng dẫn|chỉ dẫn)",
    r"\b(ignore|disregard|forget)\b( \w+){0,3} (rules|instructions|guardrails|prompts?)\b",
    r"\b(fake|made[- ]up|invented)\b.{0,30}\b(reviews?|ratings?|products?)\b",
    r"\b(write|create|generate|invent)\b.{0,30}\breviews?\b",
    r"\btạo (ra )?(một |1 )?(sản phẩm|tai nghe|chuột|bàn phím|review|đánh giá)\b.*(không có|giả|mới|ảo)",
    r"(viết|tạo|bịa|thêm)( thêm)? \d* ?(review|đánh giá|nhận xét)", r"\bđặt rating\b", r"\bsửa (rating|giá|đánh giá)\b",
    r"review (giả|ảo|tích cực)", r"\bbịa\b",
]
EXPLAIN_PATTERNS = [r"\blà gì\b", r"\bnghĩa là\b", r"\bkhác (gì|nhau)\b", r"\bcó cần\b.*\bkhông\b", r"\bcó nên\b",
                    r"\bhoạt động (thế|như) nào\b", r"\bcó tác dụng gì\b"]
FIND_WORDS = ["tìm", "gợi ý", "đề xuất", "giới thiệu", "chọn", "mua", "tư vấn", "muốn", "cần một", "cần mua", "cần bàn",
              "cần chuột", "cần tai"]
# người dùng quan tâm tới giá nhưng KHÔNG nêu con số ("vừa túi tiền", "tầm giá hợp lý", "mẫu rẻ", "trả thêm tiền"…)
# → agent hỏi ngân sách, không tự gán một con số. "đánh giá", "giá trị" không tính là nói về giá.
PRICE_WORDS = ["tiền", "rẻ", "đắt", "ngân sách", "kinh phí", "chi phí", "phân khúc", "tiết kiệm", "túi tiền"]
PRICE_RX = r"(?<!đánh )(?<![a-zà-ỹ])giá(?![a-zà-ỹ])(?!\s*trị)"
# người dùng nói rõ không giới hạn giá → không hỏi lại ngân sách
BUDGET_OPEN_RX = (r"không (giới hạn|quan trọng|quan tâm|cần quan tâm|bận tâm)[^,.;|]{0,12}(giá|ngân sách|tiền)"
                  r"|(giá|ngân sách|tiền)[^,.;|]{0,12}(không giới hạn|không quan trọng|nào cũng được|bao nhiêu cũng được)"
                  r"|bao nhiêu cũng được|chưa có ngân sách|không có ngân sách|bỏ qua (giá|ngân sách)")
COMPARE_WORDS = ["so sánh", "so với", "khác nhau thế nào", "đối chiếu"]
COMPARE_REF = ["vừa tìm", "vừa gợi ý", "ở trên", "mẫu trên", "hai mẫu", "2 mẫu", "ba mẫu", "3 mẫu", "các mẫu này", "hai con", "kết quả trước"]

# điều kiện CỨNG — chấm trên thuộc tính đã xác minh của catalog
HARD_WORDS = {
    "bluetooth": ["bluetooth"],
    "wireless": ["không dây", "wireless"],
    "wired": ["có dây", "cắm dây", "dây cắm", "wired"],
    "anc": ["anc", "chống ồn chủ động", "khử ồn chủ động", "chống ồn", "khử ồn"],
    "microphone": ["có mic", "kèm mic", "có micro", "kèm micro", "phải có mic"],
    "numpad": ["bàn phím số", "phím số", "numpad"],
    "mechanical": ["bàn phím cơ", "phím cơ", "mechanical"],
    "volume": ["nút âm lượng", "núm âm lượng", "phím âm lượng", "chỉnh âm lượng", "điều khiển âm lượng", "tăng giảm âm lượng",
               "volume control", "volume knob", "volume key", "volume button"],
}
HARD_LABEL = {"bluetooth": "Bluetooth", "wireless": "Không dây", "wired": "Có dây", "anc": "Chống ồn chủ động (ANC)",
              "microphone": "Có micro", "numpad": "Có bàn phím số (full-size)",
              "mechanical": "Bàn phím cơ", "volume": "Có nút / phím chỉnh âm lượng"}
# nút / phím chỉnh âm lượng: catalog không có thuộc tính riêng → chỉ MATCH khi tiêu đề / dòng mô tả / thông số của người bán
# ghi rõ (vd "volume up/down", "volume control", "mute, play, volume"); không ghi → UNKNOWN (không coi là có, cũng không
# coi là không). "volume limiting" (giới hạn âm lượng, tai nghe trẻ em) không phải nút chỉnh.
VOLUME_RX = re.compile(r"volume\s*(\+|-|/|up|down|control|knob|roller|wheel|dial|button|key|rocker|adjust|slider|switch)"
                       r"|(control|adjust|change|turn)\w*\s+(the\s+)?(audio\s+)?volume"
                       r"|(mute|play|pause)[^.]{0,30}volume|volume[^.]{0,20}(mute|play|pause)", re.I)
# câu hỏi về CÁCH agent xử lý khi thông tin sản phẩm thiếu / khi mô tả người bán và review nói ngược nhau
MISSING_INFO_RX = (r"(nếu|khi|trường hợp|lỡ)[^.?!]{0,60}(không ghi|chưa ghi|không có thông tin|không nêu|không đề cập|"
                   r"thiếu thông tin|không rõ|chưa rõ)[^.?!]{0,60}(xử lý|làm (sao|gì|thế nào)|thế nào|ra sao|\bsao\b)")
SELLER_WORDS = r"(mô tả|quảng cáo|nhà bán|người bán|shop|thông số|trang sản phẩm|nhà sản xuất|hãng ghi|hãng nói)"
BUYER_WORDS = r"(review|đánh giá|nhận xét|người mua|người dùng)"
CONFLICT_RX = (SELLER_WORDS + r"[^?!]{0,80}" + BUYER_WORDS + r"[^?!]{0,60}(không|ngược|trái|khác|chê)"
               r"|" + BUYER_WORDS + r"[^?!]{0,60}(ngược|trái|khác|chê)[^?!]{0,60}" + SELLER_WORDS)
# "thu hẹp / chọn / so sánh … theo A, B, C" — danh sách sau "theo" là TIÊU CHÍ để cân nhắc, không phải điều kiện bắt buộc
CRITERIA_LIST_RX = (r"(?<![a-zà-ỹ])(thu hẹp|lọc|chọn|xếp hạng|xếp|so sánh|đánh giá|cân nhắc|tư vấn|gợi ý)(?![a-zà-ỹ])"
                    r"[^.?!|]{0,25}?(?<![a-zà-ỹ])(theo|dựa trên|dựa vào)\s+(các\s+)?(tiêu chí\s+)?([^.?!|]+)")
MUST_RX = r"bắt buộc|phải có|cần có|nhất định|không thể thiếu"
# kiểu đeo tai nghe (tag khớp thuộc tính wear_type của catalog)
WEAR_WORDS = {"over-ear": ["trùm tai", "chụp tai", "over-ear", "over ear"], "on-ear": ["áp tai", "on-ear", "on ear"],
              "in-ear": ["nhét tai", "in-ear", "in ear"]}
WEAR_LABEL = {"over-ear": "Trùm tai", "on-ear": "Áp tai", "in-ear": "Nhét tai"}
# Thương hiệu: lấy từ catalog; bỏ tên trùng chữ thường hay gặp trong câu hỏi
BRAND_STOP = {"jam", "soul", "august", "coo", "snug", "senso", "jetta", "cc store", "amazon renewed", "elgin", "trueque"}
# câu nói về tập sản phẩm đang lọc trên website (Shopping Context 7.5 — "theo bộ lọc")
FILTER_REF = ["đang lọc", "bộ lọc", "đang xem", "danh sách này", "các mẫu này", "các sản phẩm này", "trong số này",
              "trong các mẫu", "trong các sản phẩm", "ở đây", "khớp bộ lọc"]
SWITCH_COLORS = {"red": "red", "đỏ": "red", "brown": "brown", "nâu": "brown", "blue": "blue", "xanh": "blue",
                 "yellow": "yellow", "vàng": "yellow", "black": "black", "đen": "black"}

# tiêu chí MỀM — chấm bằng review (từ khoá tiếng Anh vì review gốc tiếng Anh) + thuộc tính nếu có
SOFT = {
    "am_thanh": {"label": "Âm thanh", "vi": ["âm thanh", "chất âm", "nghe nhạc", "bass", "âm bass"],
                 "kw": ["sound", "bass", "audio", "music", "treble", "clarity", "clear"]},
    "pin": {"label": "Pin", "vi": ["pin", "thời lượng pin"], "kw": ["battery", "charge", "charging", "hours"], "attr": "battery"},
    "mic": {"label": "Micro", "vi": ["mic", "micro", "thu âm", "gọi điện", "họp online"],
            "kw": ["mic", "microphone", "call", "calls", "zoom", "meeting"], "attr": "microphone"},
    "thoai_mai": {"label": "Thoải mái khi dùng lâu", "vi": ["thoải mái", "cầm", "đeo lâu", "mỏi tay", "êm tai", "công thái học"],
                  "kw": ["comfort", "comfortable", "ergonomic", "fit", "grip", "wrist", "hand", "fits"]},
    # không dùng "click" trơn: review chuột nào cũng nhắc "click" (nút trái phải, double click) mà không nói gì về độ êm
    "click_em": {"label": "Tiếng click / gõ êm", "vi": ["click êm", "bấm êm", "gõ êm", "êm", "yên tĩnh", "im lặng", "ít ồn",
                                                        "tiếng click", "tiếng gõ", "độ ồn"],
                 "kw": ["quiet", "silent", "silence", "noise", "noisy", "loud", "clicky", "click sound", "clicking sound",
                        "sound of the click", "clacky", "hush"]},
    "ben": {"label": "Độ bền", "vi": ["bền", "dùng được lâu", "độ bền"],  # không dùng "dùng lâu": trùng nhãn "Thoải mái khi dùng lâu"
            "kw": ["durable", "broke", "broken", "stopped working", "sturdy", "lasted", "died", "quit working", "years"]},
    "go_phim": {"label": "Cảm giác gõ", "vi": ["gõ văn bản", "cảm giác gõ", "đánh máy", "gõ phím", "gõ"],
                "kw": ["typing", "type", "feel", "keys", "tactile"]},
    "phim_so": {"label": "Bàn phím số", "vi": ["bàn phím số", "phím số", "numpad"],
                "kw": ["number pad", "numpad", "numeric keypad", "10-key", "ten key", "number keys"], "attr": "layout"},
    "chong_on": {"label": "Chống ồn", "vi": ["chống ồn", "khử ồn", "anc"], "kw": ["noise cancel", "anc", "noise-cancel"],
                 "attr": "anc"},
    "nho_gon": {"label": "Nhỏ gọn", "vi": ["nhỏ gọn", "gọn nhẹ", "mang đi", "mang theo"],
                "kw": ["compact", "portable", "small", "travel", "mini"]},
    "gaming": {"label": "Chơi game", "vi": ["chơi game", "game", "gaming"], "kw": ["gaming", "game", "fps", "latency", "lag"]},
    "danh_gia": {"label": "Được đánh giá tốt", "vi": ["đánh giá tốt", "rating cao", "nhiều đánh giá", "được đánh giá"], "kw": []},
}
PURPOSES = {"học online": "Học online", "học tập": "Học tập", "văn phòng": "Làm việc văn phòng", "làm việc": "Làm việc",
            "nghe nhạc": "Nghe nhạc", "chơi game": "Chơi game", "gõ văn bản": "Gõ văn bản", "chạy bộ": "Thể thao",
            "thể thao": "Thể thao", "du lịch": "Du lịch"}
SOFT_MARKERS_AFTER = ["ưu tiên", "nếu được", "nếu có thể", "càng tốt", "tốt nhất là"]
SOFT_MARKERS_BEFORE = ["thì tốt", "thì càng tốt", "thì hay", "cũng được", "nếu có"]
NEGATION = r"(tuyệt đối không|không được|không hỗ trợ|không có|không dùng|không cần|không muốn|không phải|không lấy|loại bỏ|trừ)"
COUNT_WORDS = {"một": 1, "1": 1, "hai": 2, "2": 2, "ba": 3, "3": 3}


MONEY_100K = ("lít", "lit", "lốp", "lop", "xị", "xi", "trăm", "tram")


def _amount(num, unit):
    v = float(num.replace(",", "."))
    unit = (unit or "").lower()
    if unit in ("triệu", "tr", "củ", "m"):
        return int(v * 1_000_000)
    if unit in ("k", "nghìn", "ngàn"):
        return int(v * 1_000)
    if unit in MONEY_100K:  # cách nói lóng: 1 lít = 1 lốp = 1 xị = 100.000đ; "5 trăm" (nói tắt) = 500.000đ
        return int(v * 100_000)
    return int(v)


# Câu gõ KHÔNG DẤU: chỉ áp dụng khi cả câu không có chữ có dấu (tránh đè lên câu có dấu), và chỉ cho cụm không
# nhập nhằng. Cố ý bỏ "co" đứng một mình ("cơ" / "có" / "cỡ") và "ban phim co".
UNACCENTED = [
    ("ban phim so", "bàn phím số"), ("ban phim", "bàn phím"), ("tai nghe", "tai nghe"), ("con chuot", "con chuột"),
    ("chuot", "chuột"), ("khong day", "không dây"), ("co day", "có dây"), ("chong on", "chống ồn"), ("co mic", "có mic"),
    ("duoi", "dưới"), ("toi da", "tối đa"), ("khong qua", "không quá"), ("tren", "trên"), ("it nhat", "ít nhất"),
    ("trieu", "triệu"), ("nghin", "nghìn"), ("ngan", "ngàn"), ("tim", "tìm"), ("goi y", "gợi ý"), ("tu van", "tư vấn"),
    ("uu tien", "ưu tiên"), ("thoai mai", "thoải mái"), ("click em", "click êm"), ("go em", "gõ êm"), ("ben", "bền"),
    ("van phong", "văn phòng"), ("hoc online", "học online"), ("hoc tap", "học tập"), ("nghe nhac", "nghe nhạc"),
    ("choi game", "chơi game"), ("go van ban", "gõ văn bản"), ("am thanh", "âm thanh"), ("so sanh", "so sánh"),
    ("dat hang", "đặt hàng"), ("thanh toan", "thanh toán"), ("la gi", "là gì"), ("nho gon", "nhỏ gọn"),
    ("trum tai", "trùm tai"), ("chup tai", "chụp tai"), ("nhet tai", "nhét tai"), ("ap tai", "áp tai"),
    ("nut am luong", "nút âm lượng"), ("chinh am luong", "chỉnh âm lượng"),
]


def _restore_accents(t):
    if re.search(r"[à-ỹđ]", t):
        return t
    for src, dst in sorted(UNACCENTED, key=lambda x: -len(x[0])):
        t = re.sub(r"(?<![a-z])%s(?![a-z])" % re.escape(src), dst, t)
    return t


def _has(t, words):
    return any(re.search(r"(?<![a-zà-ỹ])%s(?![a-zà-ỹ])" % re.escape(w), t) for w in words)


_BRANDS = {}


def _brands():
    """{tên thường: tên hiển thị} của các hãng trong catalog công bố (bỏ tên quá ngắn / trùng chữ thường)."""
    if not _BRANDS:
        for p in catalog.published():
            b = (p.get("brand") or "").strip()
            low = b.lower()
            if (len(low) >= 3 or low in ("hp", "lg")) and low not in BRAND_STOP:
                _BRANDS.setdefault(low, b)
    return _BRANDS


def _brand_is(p, value):
    pb, v = (p.get("brand") or "").lower(), (value or "").lower()
    return pb == v or pb.startswith(v + " ") or v.startswith(pb + " ")


def _split_soft(t):
    """Tách câu thành phần CỨNG và phần MỀM theo dấu hiệu "ưu tiên…", "…thì tốt", "nếu được…", và danh sách tiêu chí
    sau "thu hẹp / chọn / so sánh … theo" (trừ khi người dùng ghi rõ "bắt buộc / phải có" trong danh sách đó)."""
    hard, soft = [], []
    for m in list(re.finditer(CRITERIA_LIST_RX, t)):
        lst = m.group(5)
        if not re.search(MUST_RX, lst):
            soft.append(lst)
            t = t.replace(lst, " ", 1)
    for clause in re.split(r"[,.;!?\n]|\bnhưng\b|\btuy nhiên\b", t):
        clause = clause.strip()
        if not clause:
            continue
        before = [m for m in SOFT_MARKERS_BEFORE if m in clause]
        if before:
            soft.append(clause)
            continue
        idx = min([clause.find(m) for m in SOFT_MARKERS_AFTER if m in clause] or [-1])
        if idx >= 0:
            hard.append(clause[:idx])
            soft.append(clause[idx:])
        else:
            hard.append(clause)
    return " | ".join(hard), " | ".join(soft)


def _soft_order(soft_text):
    """Ưu tiên mềm theo thứ tự xuất hiện; "A hơn B" → A trước B."""
    found = []
    for key, s in SOFT.items():
        pos = [soft_text.find(w) for w in s["vi"] if _has(soft_text, [w])]
        if pos:
            found.append((min(p for p in pos if p >= 0), key))
    found.sort()
    return [k for _, k in found]


@tool
def parse_constraints(text: str) -> dict:
    """parse_constraints — đọc ĐIỀU KIỆN BẮT BUỘC và ý định bằng code (không dùng AI).
    Input: tin nhắn người dùng (str).
    Output: {"categories", "out_of_scope", "min_price", "max_price", "hard": [{key, value?, label}], "negated": [...],
             "soft": [key theo thứ tự ưu tiên], "purpose", "count", "wants_purchase", "fabricate", "explain", "compare",
             "find", "assume_unknown", "price_concern" (nói tới giá nhưng không có con số), "budget_open" (nói rõ
             không giới hạn giá)}.
    Không tác động ra ngoài."""
    t = " " + _restore_accents(text.lower().replace("\u00a0", " ")) + " "
    t = t.replace("cơ bản", "cơbản")  # "bàn phím cơ bản" ≠ bàn phím cơ (dính liền để ranh giới từ không khớp)
    # "1tr5", "1 triệu 2" → 1,5 / 1,2 triệu (chữ số lẻ ngay sau đơn vị)
    t = re.sub(r"(\d+)\s*(tr|triệu|củ)\s*(\d)(?![\d.,])", lambda m: " %s.%s triệu " % (m.group(1), m.group(3)), t)
    t = re.sub(r"(\d+)\s*(tr|triệu|củ)\s*rưỡi", lambda m: " %s.5 triệu " % m.group(1), t)  # "1 triệu rưỡi" = 1,5 triệu
    t = re.sub(r"(\d+)\s*trăm\s*(k|nghìn|ngàn)(?![a-zà-ỹ])", lambda m: " %s00 nghìn " % m.group(1), t)  # "5 trăm nghìn"
    # "từ 3 đến 5 triệu", "3-5 lốp": đơn vị chỉ ghi ở số sau → áp cho cả số trước
    t = re.sub(r"(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(đến|tới|-|–|~)\s*(\d+(?:[.,]\d+)?)\s*(triệu|tr|củ|k|nghìn|ngàn|%s)(?![a-zà-ỹ])"
               % "|".join(MONEY_100K), lambda m: " %s %s %s %s %s " % (m.group(1), m.group(4), m.group(2), m.group(3), m.group(4)), t)
    cats = [c for c, words in CATEGORY_WORDS.items() if _has(t, words)]
    oos = [w for w in OUT_OF_SCOPE_WORDS if _has(t, [w]) and not (w in ("ipad", "laptop", "điện thoại") and cats)]

    amounts = []
    for m in re.finditer(r"(\d+(?:[.,]\d+)?)\s*(triệu|tr|củ|k|nghìn|ngàn|%s)(?![a-zà-ỹ])" % "|".join(MONEY_100K), t):
        amounts.append(_amount(m.group(1), m.group(2)))
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

    # phủ định: <từ phủ định> … <kết nối> (vd "không dùng Bluetooth", "không có kết nối không dây") → negated
    negated, t_pos = [], t
    for m in re.finditer(NEGATION + r"[^,.;|]{0,40}?(kết nối không dây|không dây|wireless|bluetooth|có dây|dây)", t):
        obj = m.group(2)
        key = "bluetooth" if obj == "bluetooth" else "wired" if obj in ("có dây", "dây") else "wireless"
        negated.append(key)
        t_pos = t_pos.replace(m.group(0), " ")
    # loại trừ (Shopping Context 7.2): "không lấy nhét tai", "không phải Sony" → điều kiện not_wear / not_brand
    exclude = []
    wear_alt = "|".join(re.escape(w) for ws in WEAR_WORDS.values() for w in ws)
    for m in re.finditer(NEGATION + r"[^,.;|]{0,25}?(%s)" % wear_alt, t_pos):
        tag = next(k for k, ws in WEAR_WORDS.items() if m.group(2) in ws)
        exclude.append({"key": "not_wear", "value": tag, "label": "Không lấy loại %s" % WEAR_LABEL[tag].lower()})
        t_pos = t_pos.replace(m.group(0), " ")
    brands = _brands()
    if brands:
        brand_alt = "|".join(re.escape(b) for b in sorted(brands, key=len, reverse=True))
        for m in re.finditer(NEGATION + r"[^,.;|]{0,20}?(?<![a-z0-9])(%s)(?![a-z0-9])" % brand_alt, t_pos):
            exclude.append({"key": "not_brand", "value": brands[m.group(2)], "label": "Không lấy hãng %s" % brands[m.group(2)]})
            t_pos = t_pos.replace(m.group(0), " ")
    hard_text, soft_text = _split_soft(t_pos)

    hard = []
    for key, words in HARD_WORDS.items():
        if _has(hard_text, words):
            hard.append({"key": key, "label": HARD_LABEL[key]})
    for tag, words in WEAR_WORDS.items():
        if _has(hard_text, words):
            hard.append({"key": "wear_type", "value": tag, "label": "Kiểu đeo: %s" % WEAR_LABEL[tag]})
    if brands:
        for m in re.finditer(r"(?<![a-z0-9])(%s)(?![a-z0-9])" % brand_alt, hard_text):
            b = brands[m.group(1)]
            if not any(h.get("value") == b for h in hard):
                hard.append({"key": "brand", "value": b, "label": "Hãng %s" % b})
    hard += exclude
    if any(h["key"] == "bluetooth" for h in hard):
        hard = [h for h in hard if h["key"] != "wireless" or "không dây" in hard_text.replace("bluetooth", "")]
    sw = re.search(r"\b(red|brown|blue|yellow|black|đỏ|nâu|xanh|vàng|đen)\s*switch|switch\s*(red|brown|blue|yellow|black|đỏ|nâu|xanh|vàng|đen)\b", t_pos)
    if sw:
        color = SWITCH_COLORS[sw.group(1) or sw.group(2)]
        hard.append({"key": "switch", "value": color, "label": "%s Switch" % color.title()})
    bat = re.search(r"pin[^,.;|]{0,15}?(ít nhất|tối thiểu|trên|từ|>=?|≥|hơn)\s*(\d{1,4})\s*(giờ|h|tiếng)", t_pos)
    if bat:
        hard.append({"key": "battery_min", "value": int(bat.group(2)), "label": "Pin ≥ %s giờ" % bat.group(2)})

    soft = _soft_order(soft_text)
    if not soft:  # nhu cầu mềm nêu không kèm chữ "ưu tiên" (vd "để gõ văn bản", "nghe nhạc", "dùng được lâu")
        soft = _soft_order(" ".join(w for w in [hard_text] if w))
        soft = [k for k in soft if k in ("go_phim", "thoai_mai", "click_em", "ben", "am_thanh", "gaming", "nho_gon")]
    hard_attrs = {"anc": "anc", "microphone": "microphone", "numpad": "layout", "battery_min": "battery"}
    taken = {hard_attrs[h["key"]] for h in hard if h["key"] in hard_attrs}
    soft = [k for k in soft if not SOFT[k].get("attr") or SOFT[k]["attr"] not in taken]
    purpose = next((v for k, v in PURPOSES.items() if k in t), None)
    cnt = re.search(r"\b(một|1|hai|2|ba|3)\s+(con|chiếc|mẫu|cái|sản phẩm|lựa chọn|bộ|tai nghe|bàn phím|chuột)\b", t)

    explain = any(re.search(p, t) for p in EXPLAIN_PATTERNS)
    find = _has(t, FIND_WORDS)
    budget_open = bool(re.search(BUDGET_OPEN_RX, t))
    price_concern = (not amounts and not budget_open and (_has(t, PRICE_WORDS) or bool(re.search(PRICE_RX, t))))
    return {
        "categories": cats,
        "out_of_scope": oos,
        "min_price": min_price,
        "max_price": max_price,
        "hard": hard,
        "negated": sorted(set(negated)),
        "soft": soft,
        "purpose": purpose,
        "count": COUNT_WORDS[cnt.group(1)] if cnt else None,
        "wants_purchase": _has(t, PURCHASE_WORDS),
        "fabricate": any(re.search(p, t) for p in FABRICATE_PATTERNS),
        "explain": explain and not find,
        "compare": _has(t, COMPARE_WORDS),
        "compare_ref": _has(t, COMPARE_REF),
        "filter_ref": _has(t, FILTER_REF),
        "question": "?" in text or bool(re.search(r"\bcó\b.{0,40}\b(không|chưa)\s*$|\bbao nhiêu\b|\bthế nào\b|\bra sao\b", t.strip())),
        "find": find,
        "assume_unknown": bool(re.search(r"(không ghi|không rõ|chưa rõ|không nêu).{0,40}(mặc định|coi như|cứ cho là|giả sử)", t)),
        "missing_info_q": bool(re.search(MISSING_INFO_RX, t)),
        "conflict_q": bool(re.search(CONFLICT_RX, t)),
        "price_concern": price_concern,
        "budget_open": budget_open,
    }


# ───────── kiểm điều kiện cứng trên catalog ─────────

def _attr(p, key):
    return (p.get("attributes") or {}).get(key) or {}


def _hours(value):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*giờ", str(value or ""))
    return float(m.group(1).replace(",", ".")) if m else None


def check_hard(p, req):
    """Một điều kiện cứng trên một sản phẩm → {label, result: MATCH|UNKNOWN|MISMATCH, evidence: [mã nguồn], value}."""
    key = req["key"]
    out = {"key": key, "label": req["label"], "result": "UNKNOWN", "evidence": [], "value": None}
    if key in ("bluetooth", "wireless", "wired"):
        a = _attr(p, "connectivity")
        if a.get("status") == "VERIFIED":
            tags = set(a.get("tags") or [])
            ok = {"bluetooth": "bluetooth" in tags, "wired": "wired" in tags,
                  "wireless": bool(tags & {"bluetooth", "wireless-2.4"})}[key]
            out.update(result="MATCH" if ok else "MISMATCH", value=a.get("value"), evidence=[a.get("source")] if a.get("source") else [])
        else:
            out.update(value=a.get("note") or a.get("status"))
        return out
    if key in ("wear_type", "not_wear"):
        a = _attr(p, "wear_type")
        if a.get("status") != "VERIFIED":
            out["value"] = "chưa xác minh kiểu đeo"
            return out
        src = a.get("source")
        has_tag = req["value"] in (a.get("tags") or [])
        ok = has_tag if key == "wear_type" else not has_tag
        # nguồn "categories" (đường dẫn danh mục Amazon) không phải một mã trong evidence → không trích mã
        out.update(result="MATCH" if ok else "MISMATCH", value=a.get("value"),
                   evidence=[src] if src and src != "categories" else [])
        return out
    if key in ("brand", "not_brand"):
        b = p.get("brand") or ""
        if not b:
            out["value"] = "chưa rõ hãng"
            return out
        ev = next((e["id"] for e in p.get("evidence") or [] if e.get("kind") == "detail" and e.get("field") == "Brand"), None)
        if not ev and b.lower() in (p.get("title") or "").lower():
            ev = "T"
        same = _brand_is(p, req["value"])
        out.update(result="MATCH" if same == (key == "brand") else "MISMATCH", value=b, evidence=[ev] if ev else [])
        return out
    if key == "volume":  # chỉ đọc thông tin người bán (tiêu đề / mô tả / thông số), không đọc review
        for e in p.get("evidence") or []:
            if e.get("kind") == "review":
                continue
            txt = e.get("text") or ""
            m = VOLUME_RX.search(txt)
            if m and not re.search(r"limit", txt[max(0, m.start() - 30):m.end() + 30], re.I):
                out.update(result="MATCH", value="người bán ghi \"%s\"" % m.group(0).strip(), evidence=[e["id"]])
                return out
        out["value"] = "người bán chưa nhắc tới"
        return out
    if key == "mechanical":  # switch đã xác minh là switch cơ, hoặc tiêu đề ghi "mechanical" (nguồn T)
        a = _attr(p, "switch")
        v = str(a.get("value") or "")
        if a.get("status") == "VERIFIED":
            mech = not re.search(r"membrane|scissor|màng", v, re.I)
            out.update(result="MATCH" if mech else "MISMATCH", value=v, evidence=[a.get("source")] if a.get("source") else [])
        elif re.search(r"\bmechanical\b", p.get("title") or "", re.I):
            out.update(result="MATCH", value="tiêu đề ghi mechanical", evidence=["T"])
        else:
            out["value"] = "chưa xác minh"
        return out
    attr_key = {"anc": "anc", "microphone": "microphone", "switch": "switch", "battery_min": "battery", "numpad": "layout"}[key]
    a = _attr(p, attr_key)
    if a.get("status") != "VERIFIED":
        out["value"] = "chưa xác minh" if a.get("status") != "CONFLICT" else "nguồn mâu thuẫn"
        if a.get("values"):
            out["evidence"] = [v.get("source") for v in a["values"] if v.get("source")]
        return out
    v, src = str(a.get("value") or ""), [a.get("source")] if a.get("source") else []
    out.update(value=v, evidence=src)
    if key in ("anc", "microphone"):
        out["result"] = "MATCH" if v.lower().startswith("có") else "MISMATCH"
    elif key == "switch":
        out["result"] = "MATCH" if req["value"] in v.lower() else "MISMATCH"
    elif key == "numpad":
        out["result"] = "MATCH" if "full" in (a.get("tags") or []) else "MISMATCH"
    elif key == "battery_min":
        h = _hours(v)
        out["result"] = "UNKNOWN" if h is None else ("MATCH" if h >= req["value"] else "MISMATCH")
    return out


def display_name(p):
    """Tên ngắn để hiển thị: thương hiệu + model, không lặp thương hiệu (vd "JBL JBL TUNE 500BT" → "JBL TUNE 500BT")."""
    brand, model = (p.get("brand") or "").strip(), (p.get("model") or "").strip()
    n = model if brand and model.lower().startswith(brand.lower()) else ("%s %s" % (brand, model)).strip()
    return n if len(n) <= 70 else n[:69] + "…"


def _brief(p):
    return {k: p.get(k) for k in ("id", "brand", "model", "price_vnd", "price_usd", "rating", "rating_number", "q_score")}


@tool
def search_catalog(category: str, max_price: int = None, min_price: int = None, hard: list = None) -> dict:
    """search_catalog — tìm trong catalog đã công bố theo loại + khoảng giá (lọc cứng) + điều kiện cứng đã xác minh.
    Input: category ∈ headphones|mouse|keyboard, max_price / min_price (VND, None = không lọc), hard (list điều kiện
           từ parse_constraints).
    Output: {"matches": [sản phẩm đạt MỌI điều kiện, kèm hard_results], "unverified": [còn điều kiện chưa xác minh],
             "counts": {category_total, in_budget, mismatch, unverified, matches}, "cheapest": giá thấp nhất của loại,
             "catalog_version"}. Sản phẩm thiếu giá không được tính là trong ngân sách.
    Không tác động ra ngoài."""
    if category not in CATEGORIES:
        raise ValueError("loại không hỗ trợ: %s" % category)
    data = catalog.load()
    items = [p for p in catalog.published(data) if p.get("category") == category]
    priced = [p for p in items if p.get("price_vnd") is not None]
    cheapest = min(priced, key=lambda p: p["price_vnd"]) if priced else None

    def in_budget(p):
        if max_price is None and min_price is None:
            return True
        if p.get("price_vnd") is None:
            return False
        return (min_price or 0) <= p["price_vnd"] <= (max_price if max_price is not None else 10 ** 12)

    budget = [p for p in items if in_budget(p)]
    matches, unverified, mismatch = [], [], 0
    for p in budget:
        res = [check_hard(p, r) for r in (hard or [])]
        row = dict(_brief(p), hard_results=res)
        if any(r["result"] == "MISMATCH" for r in res):
            mismatch += 1
        elif any(r["result"] == "UNKNOWN" for r in res):
            unverified.append(row)
        else:
            matches.append(row)
    matches.sort(key=lambda r: -(r.get("q_score") or 0))
    unverified.sort(key=lambda r: -(r.get("q_score") or 0))
    return {
        "matches": matches,
        "unverified": unverified,
        "counts": {"category_total": len(items), "in_budget": len(budget), "mismatch": mismatch,
                   "unverified": len(unverified), "matches": len(matches)},
        "cheapest": _brief(cheapest) if cheapest else None,
        "catalog_version": data.get("catalog_version", "?"),
    }


def _review_hits(p, kws):
    hits = []
    for e in p.get("evidence") or []:
        if e.get("kind") != "review":
            continue
        t = ("%s %s" % (e.get("title") or "", e.get("text") or "")).lower()
        if any(re.search(r"\b%s" % re.escape(k), t) for k in kws):
            hits.append(e)
    return hits


# Từ khoá mang nghĩa xấu sẵn ("loud", "broke", "lag") — "no lag", "not loud" là khen nên KHÔNG xét phủ định cho các từ này
NEG_POLARITY_KW = {"noise", "noisy", "loud", "clicky", "clacky", "broke", "broken", "stopped working", "died",
                   "quit working", "lag", "latency"}
NEGATOR_RX = (r"\b(not|no|never|isn't|wasn't|aren't|don't|doesn't|didn't|wouldn't|won't|can't|cannot|nor)\b"
              r"(?!\s+only)[^.!?;]{0,20}?\b")


def _says_not(e, kws):
    """Review nhắc tới tiêu chí nhưng PHỦ ĐỊNH nó ("not for gaming", "isn't quiet") → không phải lời khen, dù 5★."""
    t = ("%s %s" % (e.get("title") or "", e.get("text") or "")).lower().replace("’", "'")
    pos_kws = [k for k in kws if k not in NEG_POLARITY_KW]
    has_pos = [k for k in pos_kws if re.search(r"\b%s" % re.escape(k), t)]
    return bool(has_pos) and all(re.search(NEGATOR_RX + re.escape(k), t) for k in has_pos)


@tool
def get_evidence(product_id: str, soft: list = None, max_reviews: int = 4) -> dict:
    """get_evidence — bằng chứng của MỘT sản phẩm: thuộc tính đã xác minh, insight review, review theo tiêu chí mềm.
    Input: product_id (parent_asin trong catalog), soft (list key tiêu chí mềm), max_reviews (số review mỗi tiêu chí).
    Output: {"id", "name", "price_vnd", "price_usd", "rating", "rating_number", "attributes": {key: {value, source}},
             "aspects": {soft_key: {pos, neg, n, evidence: [{id, rating, text}]}}, "reviews": [{id, rating, text}]}
            hoặc {} nếu sản phẩm không có / chưa công bố. Text review rút gọn ≤220 ký tự, giữ nguyên tiếng Anh.
    Không tác động ra ngoài."""
    p = next((x for x in catalog.published() if x["id"] == product_id), None)
    if not p:
        return {}
    short = lambda s: (s or "")[:220] + ("…" if len(s or "") > 220 else "")  # noqa: E731
    attrs = {k: {"value": a.get("value"), "source": a.get("source")} for k, a in (p.get("attributes") or {}).items()
             if a.get("status") == "VERIFIED"}
    aspects = {}
    for key in soft or []:
        s = SOFT.get(key)
        if not s or not s["kw"]:
            continue
        hits = _review_hits(p, s["kw"])
        said_not = {e["id"] for e in hits if _says_not(e, s["kw"])}
        pos = [e for e in hits if (e.get("rating") or 0) >= 4 and e["id"] not in said_not]
        neg = [e for e in hits if (e.get("rating") or 0) <= 2]
        # review "nói không" (vd "I do not do gaming", "not for gaming") không phải lời khen, cũng chưa chắc là chê → đếm riêng
        said = [e for e in hits if e["id"] in said_not and (e.get("rating") or 0) > 2]
        pick = (pos[:2] + neg[:2] + said[:1])[:max_reviews] or hits[:max_reviews]
        aspects[key] = {"label": s["label"], "n": len(hits), "pos": len(pos), "neg": len(neg), "said_not": len(said_not),
                        "evidence": [dict({"id": e["id"], "rating": e.get("rating"), "text": short(e.get("text"))},
                                          **({"says_not": True} if e["id"] in said_not else {})) for e in pick]}
    reviews = [e for e in p.get("evidence") or [] if e.get("kind") == "review"]
    top = sorted(reviews, key=lambda e: -(e.get("helpful") or 0))[:max_reviews]
    return {"id": p["id"], "name": display_name(p),
            "title": p.get("title"), "price_vnd": p.get("price_vnd"), "price_usd": p.get("price_usd"),
            "rating": p.get("rating"), "rating_number": p.get("rating_number"), "q_score": p.get("q_score"),
            "reviews_collected": len(reviews), "attributes": attrs, "aspects": aspects,
            "reviews": [{"id": e["id"], "rating": e.get("rating"), "text": short(e.get("text"))} for e in top]}


@tool
def find_product_by_name(text: str) -> dict:
    """find_product_by_name — tìm sản phẩm cụ thể được nhắc tên trong câu hỏi (vd "JBL TUNE 500BT có mic không?").
    Input: tin nhắn người dùng. Output: {"id", "name", "category"} của mẫu khớp dài nhất, hoặc {} nếu không chắc.
    Luật khớp (tránh nhận nhầm): tên model phải có chữ số và dài ≥ 4 ký tự, HOẶC cả hãng lẫn tên model đều có trong câu.
    Không tác động ra ngoài."""
    t = " " + re.sub(r"\s+", " ", (text or "").lower()) + " "
    best, best_len = None, 0
    for p in catalog.published():
        model = (p.get("model") or "").lower().strip()
        brand = (p.get("brand") or "").lower().strip()
        if len(model) < 4 or not re.search(r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(model), t):
            continue
        if not re.search(r"\d", model) and not (brand and re.search(r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(brand), t)):
            continue
        if len(model) > best_len:
            best, best_len = p, len(model)
    return {"id": best["id"], "name": display_name(best), "category": best["category"]} if best else {}


@tool
def find_products_by_name(text: str) -> list:
    """find_products_by_name — mọi sản phẩm được nhắc tên trong câu (vd "so sánh JBL TUNE 500BT với Sony WH-CH510").
    Input: tin nhắn người dùng. Output: [{"id", "name", "category"}] theo thứ tự xuất hiện, tối đa 3; cùng luật khớp chắc
    như find_product_by_name (model có chữ số và ≥ 4 ký tự, hoặc cả hãng lẫn model có trong câu); tên dài khớp trước,
    một đoạn chữ chỉ khớp một sản phẩm. Không tác động ra ngoài."""
    t = " " + re.sub(r"\s+", " ", (text or "").lower()) + " "
    found = []
    for p in catalog.published():
        model = (p.get("model") or "").lower().strip()
        brand = (p.get("brand") or "").lower().strip()
        if len(model) < 4:
            continue
        has_brand = bool(brand) and bool(re.search(r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(brand), t))
        m = re.search(r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(model), t)
        if m and (re.search(r"\d", model) or has_brand):
            found.append((m.start(), m.end(), p))
            continue
        # tên model dài kèm chữ thừa ("Anker Space Q45"): có tên hãng trong câu + một mã có chữ số của model (≥ 3 ký tự)
        if has_brand:
            for tok in re.findall(r"[a-z0-9][a-z0-9\-]*", model):
                if len(tok) >= 3 and re.search(r"\d", tok) and re.search(r"[a-z]", tok):
                    mt = re.search(r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(tok), t)
                    if mt:
                        found.append((mt.start(), mt.end(), p))
                        break
    found.sort(key=lambda x: (-(x[1] - x[0]), x[0]))
    taken, out = [], []
    for a, b, p in found:
        if any(a < y and x < b for x, y in taken):
            continue
        taken.append((a, b))
        out.append((a, {"id": p["id"], "name": display_name(p), "category": p["category"]}))
    return [x for _, x in sorted(out, key=lambda x: x[0])][:3]


# ───────── kiểm nhận định ↔ bằng chứng (check_shortlist dùng) ─────────
# Một vế câu trong lý do / điểm trừ nhắc tới tiêu chí nào thì phải có ít nhất một mã ĐÃ TRÍCH đỡ đúng tiêu chí đó:
# review / dòng mô tả / tiêu đề có từ khoá của tiêu chí, hoặc nguồn của thuộc tính đã xác minh. Không có → gỡ vế đó.
CLAIM_EXTRA = {"click_em": ["click"], "thoai_mai": ["đeo", "cầm nắm"], "ben": ["hỏng", "chắc chắn", "bền bỉ"],
               "am_thanh": ["âm trầm", "âm cao", "treble"], "pin": ["sạc"], "chong_on": ["tạp âm", "cách âm", "ồn ào"]}
# suy chất lượng từ thương hiệu / độ nổi tiếng / giá, hoặc kể việc hệ thống "đã lọc" — không có dữ liệu nào đỡ được
BANNED_CLAIMS = [
    r"uy tín", r"nổi tiếng", r"danh tiếng", r"thương hiệu (lớn|có tiếng|hàng đầu|mạnh)",
    r"(đảm bảo|bảo đảm) (về )?chất lượng", r"chất lượng (được |rất )?(đảm bảo|bảo đảm)",
    r"cao cấp", r"(dòng|hàng|phân khúc) (giá rẻ|bình dân)", r"tiền nào của nấy",
    r"(giá cao|đắt)( hơn)? (thì|nên|thường|sẽ)", r"(giá rẻ|rẻ)( hơn)? (thì|nên|thường|sẽ)",
    r"(tin dùng|ưa chuộng|bán chạy)", r"hàng đầu", r"kiểm chứng (qua|bởi) (rất )?nhiều", r"đã (lọc|loại)( bỏ)? (các |những )?(sản phẩm|mẫu|review|đánh giá)",
]
# vế câu tự nói là thiếu dữ liệu → không phải nhận định, giữ nguyên
DISCLAIMER_RX = (r"chưa có|chưa (rõ|đủ|xác minh|thấy)|không (có|thấy) (review|dữ liệu|bằng chứng|thông tin|nguồn)"
                 r"|không (nhắc|đề cập)|thiếu (dữ liệu|bằng chứng|thông tin)")
_CLAIM_PHRASES = []


def _claim_phrases():
    """(cụm từ, tiêu chí) sắp theo độ dài giảm dần — cụm dài khớp trước ("gõ êm" là click_em, không phải "gõ")."""
    if not _CLAIM_PHRASES:
        seen = set()
        for key, s in SOFT.items():
            if not s["kw"]:  # danh_gia: rating là số liệu catalog, không cần review đỡ
                continue
            for ph in s["vi"] + [s["label"].lower()] + CLAIM_EXTRA.get(key, []):
                if (ph, key) not in seen:
                    seen.add((ph, key))
                    _CLAIM_PHRASES.append((ph, key))
        _CLAIM_PHRASES.sort(key=lambda x: -len(x[0]))
    return _CLAIM_PHRASES


def _claim_keys(segment):
    t, keys = segment.lower(), []
    for ph, key in _claim_phrases():
        rx = r"(?<![a-zà-ỹ])%s(?![a-zà-ỹ])" % re.escape(ph)
        if re.search(rx, t):
            if key not in keys:
                keys.append(key)
            t = re.sub(rx, " ", t)
    return keys


def _support_ids(p, key):
    """Mã nguồn của sản phẩm p nói về tiêu chí key: thuộc tính đã xác minh + mọi dòng bằng chứng có từ khoá tiêu chí."""
    s = SOFT.get(key) or {}
    ids = set()
    a = _attr(p, s["attr"]) if s.get("attr") else {}
    if a.get("status") == "VERIFIED" and a.get("source"):
        ids.add(a["source"])
    kws = s.get("kw") or []
    for e in p.get("evidence") or []:
        if e.get("kind") == "title":  # tiêu đề là tên bán hàng ("Comfortable…"), không đỡ được nhận định về trải nghiệm
            continue
        t = ("%s %s %s" % (e.get("field") or "", e.get("title") or "", e.get("text") or "")).lower()
        if any(re.search(r"\b%s" % re.escape(k), t) for k in kws):
            ids.add(e["id"])
    return ids


def audit_claims(text, p, cited, pool=None):
    """Gỡ khỏi `text` các câu nhắc tới một tiêu chí mà không mã nào trong `cited` (hoặc mã ghi trong câu) đỡ, và các
    câu suy chất lượng từ thương hiệu / giá / độ nổi tiếng. p=None (lưu ý chung, không gắn sản phẩm) → mọi nhận định
    theo tiêu chí đều bị gỡ. `pool`: mã model đã được xem — nhận định đúng dữ liệu nhưng quên trích mã thì gắn mã từ
    đây (ưu tiên thuộc tính / mô tả) thay vì gỡ. Hàm phụ của check_shortlist, không phải công cụ.
    Trả {"text", "removed": [nhãn tiêu chí bị gỡ], "banned": số câu suy diễn bị gỡ, "used": mã đã đỡ một nhận định,
         "attached": mã code gắn thêm, "claims": số câu có nhận định theo tiêu chí còn giữ,
         "had_claims": bản gốc có nhận định theo tiêu chí}."""
    raw = str(text or "").strip()
    cited = set(cited or [])
    if p:  # mã ghi ngay trong câu ("… 50 giờ (F1)") cũng là mã được trích, nếu có thật trong bằng chứng của sản phẩm
        own = {e["id"] for e in p.get("evidence") or []}
        cited |= {x for x in re.findall(r"(?<![A-Za-z0-9])([RDF]\d+)(?![A-Za-z0-9])", raw) if x in own}
    # gỡ theo CẢ CÂU (tách theo . ; ! ?) để phần còn lại không cụt nghĩa; xét nhận định theo từng vế (", " / "nhưng")
    # để vế tự nói "chưa có review…" không che vế khen bên cạnh
    parts = re.split(r"(\s*[;.!?]\s+)", raw)
    kept, removed, banned, used, attached, claims, had = [], [], 0, set(), [], 0, False
    for i in range(0, len(parts), 2):
        seg, sep = parts[i], (parts[i + 1] if i + 1 < len(parts) else "")
        if not seg.strip():
            continue
        if any(re.search(rx, seg.lower()) for rx in BANNED_CLAIMS):
            banned += 1
            continue
        keys, bad = [], []
        for clause in re.split(r",\s+(?![^(\[]*[)\]])|\s+nhưng\s+", seg):
            if re.search(DISCLAIMER_RX, clause.lower()):
                continue
            for k in _claim_keys(clause):
                if k in keys:
                    continue
                keys.append(k)
                support = _support_ids(p, k) if p else set()
                sup = support & cited
                if not sup and pool:
                    extra = sorted(support & set(pool), key=lambda x: (x.startswith("R"), len(x), x))
                    if extra:
                        sup = {extra[0]}
                        cited.add(extra[0])
                        attached.append(extra[0])
                if sup:
                    used |= sup
                else:
                    bad.append(k)
        had = had or bool(keys)
        if bad:
            removed += [SOFT[k]["label"] for k in bad if SOFT[k]["label"] not in removed]
            continue
        claims += bool(keys)
        kept.append(seg + sep)
    out = "".join(kept).strip()
    out = re.sub(r"[\s,;]+$", "", out)
    if out:
        out = out[0].upper() + out[1:]
        if out[-1] not in ".!?…":
            out += "."
    return {"text": out, "removed": removed, "banned": banned, "used": used, "attached": attached, "claims": claims,
            "had_claims": had}


def claim_snippet(text, claim_text, limit=200):
    """Đoạn review (≤ 2 câu, ≤ limit ký tự) chứa từ khoá của tiêu chí mà `claim_text` nhận định — để người đọc thấy
    đúng chỗ review đỡ nhận định, thay vì 2 câu đầu có thể lạc đề. Không có tiêu chí / không khớp → None."""
    text = re.sub(r"\[\[VIDEOID:[^\]]*\]\]\s*", "", str(text or "")).strip()
    sents = re.split(r"(?<=[.!?])\s+", text)
    for k in _claim_keys(claim_text or ""):
        rx = "|".join(r"\b%s" % re.escape(w) for w in SOFT[k]["kw"])
        i = next((j for j, s in enumerate(sents) if re.search(rx, s.lower())), None)
        if i is not None:
            q = " ".join(sents[i:i + 2])
            q = q if len(q) <= limit else q[:limit - 1].rstrip() + "…"
            return ("…" if i > 0 else "") + q
    return None


def _audit_item(item, p, pid, bad, pool=None):
    """Kiểm nhận định của một mục đã qua các luật khác. Ghi lỗi vào `bad`; trả (mục đã sửa, lý do loại hoặc None)."""
    ev = list(item["evidence"])
    r = audit_claims(item.get("reason"), p, ev, pool)
    t = audit_claims(item.get("tradeoff"), p, ev + r["attached"], pool)
    added = list(dict.fromkeys(r["attached"] + t["attached"]))
    if added:
        bad.append("%s: bổ sung mã đỡ nhận định model quên trích (%s)" % (pid, ", ".join(added)))
        ev += [x for x in added if x not in ev]
    removed = r["removed"] + [x for x in t["removed"] if x not in r["removed"]]
    if removed:
        bad.append("%s: gỡ nhận định không có mã đỡ (%s)" % (pid, ", ".join(removed)))
    if r["banned"] + t["banned"]:
        bad.append("%s: gỡ câu suy từ thương hiệu / giá / độ nổi tiếng (%d câu)" % (pid, r["banned"] + t["banned"]))
    if (r["had_claims"] or r["banned"]) and not r["claims"] and not r["text"]:
        return item, "không còn nhận định nào có bằng chứng"
    reason = r["text"]
    if removed:
        reason = (reason + " " if reason else "") + "Chưa có bằng chứng trong các mã đã trích về: %s." % ", ".join(
            x.lower() for x in removed)
    used = r["used"] | t["used"]
    if used:  # có nhận định được đỡ → bỏ các review được trích mà không đỡ nhận định nào (tránh trích lạc đề)
        reviews = {e["id"] for e in p.get("evidence") or [] if e.get("kind") == "review"}
        stray = [x for x in ev if x in reviews and x not in used]
        if stray:
            bad.append("%s: gỡ mã không đỡ nhận định nào (%s)" % (pid, ", ".join(stray)))
            ev = [x for x in ev if x not in stray]
            reason, tt = _drop_ids(reason, stray), _drop_ids(t["text"], stray)
            return dict(item, reason=reason, tradeoff=tt, evidence=ev), None
    return dict(item, reason=reason, tradeoff=t["text"], evidence=ev), None


def _drop_ids(text, ids):
    """Bỏ mã đã gỡ khỏi phần trích trong câu: "(R6, R2)" → "(R6)", "[R2]" → ""."""
    rx = r"(?<![A-Za-z0-9])(%s)(?![A-Za-z0-9])" % "|".join(re.escape(x) for x in ids)
    out = re.sub(r"[(\[][^)\]]*[)\]]", lambda m: re.sub(r"\s*,\s*(?=[)\]])|(?<=[(\[])\s*,\s*", "",
                                                         re.sub(r"(,\s*)?" + rx, "", m.group(0))), text or "")
    return re.sub(r"\s*[(\[]\s*[)\]]", "", out)


@tool
def check_shortlist(shortlist: list, constraints: dict, candidate_ids: list) -> dict:
    """check_shortlist — KIỂM BẰNG CODE danh sách AI đề xuất trước khi đưa cho người dùng.
    Input: shortlist [{product_id, reason, evidence: [mã R…/D…/F…/T]}], constraints {category, min_price, max_price,
           hard, count, allowed_evidence?: {product_id: [mã đã đưa cho model]}}, candidate_ids (sản phẩm search_catalog
           trả về là đạt mọi điều kiện cứng).
    Output: {"ok": [mục hợp lệ], "violations": [mô tả lỗi]}. Luật: ≤ count (mặc định 3) · không trùng · có trong catalog
            và trong candidate_ids · đúng loại · trong ngân sách · mọi điều kiện cứng MATCH · có ≥1 mã bằng chứng và mọi mã
            đều tồn tại trong bằng chứng CỦA CHÍNH sản phẩm đó · mỗi vế câu nhắc tới một tiêu chí (âm thanh, pin, độ
            bền…) phải có mã trích đỡ đúng tiêu chí đó, không thì gỡ vế đó và ghi "chưa có bằng chứng" · gỡ vế suy chất
            lượng từ thương hiệu / giá / độ nổi tiếng · gỡ review được trích mà không đỡ nhận định nào · mục không còn
            nhận định nào có bằng chứng thì loại.
    Không tác động ra ngoài."""
    pub = {p["id"]: p for p in catalog.published()}
    limit = constraints.get("count") or 3
    ok, bad, seen = [], [], set()
    for item in shortlist if isinstance(shortlist, list) else []:
        if not isinstance(item, dict):  # model trả sai khuôn (chuỗi, số…) → bỏ, không sập
            bad.append("mục sai khuôn: %r" % (item,))
            continue
        evs = item.get("evidence") if isinstance(item.get("evidence"), list) else []
        item = dict(item, evidence=[e for e in evs if isinstance(e, str)])  # chỉ giữ mã dạng chuỗi
        pid = str(item.get("product_id", ""))
        p = pub.get(pid)
        why = None
        if pid in seen:
            why = "trùng"
        elif p is None:
            why = "không có trong catalog đã công bố (bịa sản phẩm)"
        elif pid not in candidate_ids:
            why = "không nằm trong kết quả đạt điều kiện"
        elif p.get("category") != constraints.get("category"):
            why = "sai loại sản phẩm"
        elif (constraints.get("max_price") is not None or constraints.get("min_price") is not None) and (
                p.get("price_vnd") is None or p["price_vnd"] > (constraints.get("max_price") or 10 ** 12)
                or p["price_vnd"] < (constraints.get("min_price") or 0)):
            why = "ngoài ngân sách (%s đ)" % p.get("price_vnd")
        elif any(check_hard(p, r)["result"] != "MATCH" for r in constraints.get("hard") or []):
            why = "vi phạm / chưa xác minh điều kiện cứng"
        else:
            ids = {e["id"] for e in p.get("evidence") or []}
            ev = [e for e in (item.get("evidence") or []) if isinstance(e, str)]
            if not ev:
                why = "không có mã bằng chứng"
            elif any(e not in ids for e in ev):
                why = "trích mã bằng chứng không thuộc sản phẩm (%s)" % ", ".join(e for e in ev if e not in ids)
            elif pid in (constraints.get("allowed_evidence") or {}):
                allowed = constraints["allowed_evidence"][pid]
                stray = [e for e in ev if e not in allowed]
                if stray:  # mã có thật nhưng model không được xem → không đỡ được nhận định: gỡ mã, giữ mục nếu còn mã
                    item = dict(item, evidence=[e for e in ev if e in allowed])
                    bad.append("%s: gỡ mã bằng chứng không có trong dữ liệu đã đưa (%s)" % (pid, ", ".join(stray)))
                    if not item["evidence"]:
                        why = "không còn mã bằng chứng hợp lệ"
            if not why:
                item, why = _audit_item(item, p, pid, bad, (constraints.get("allowed_evidence") or {}).get(pid))
        if why:
            bad.append("%s: %s" % (pid or "?", why))
        else:
            seen.add(pid)
            ok.append(item)
    if len(ok) > limit:
        bad.append("quá %d mục, cắt còn %d" % (limit, limit))
        ok = ok[:limit]
    return {"ok": ok, "violations": bad}


@tool
def compare_products(product_ids: list, soft: list = None) -> dict:
    """compare_products — so sánh 2–3 sản phẩm cùng loại theo cùng bộ tiêu chí (thuộc tính đã xác minh + review).
    Input: product_ids (2–3 id trong catalog), soft (list key tiêu chí mềm, vd thoai_mai, click_em, ben).
    Output: {"items": [get_evidence của từng sản phẩm], "rows": [{key, label}], "problems": [...]}.
            Thiếu bằng chứng cho một tiêu chí thì để n=0 — người gọi phải báo "chưa có dữ liệu", không suy đoán.
    Không tác động ra ngoài."""
    base = catalog.compare(product_ids)
    items = [get_evidence.__wrapped__(p["id"], soft or [], 2) for p in base["items"]]
    rows = [{"key": k, "label": SOFT[k]["label"]} for k in soft or [] if k in SOFT]
    return {"items": items, "rows": rows, "attr_rows": base["rows"], "problems": base["problems"]}


def catalog_info() -> dict:
    """Phiên bản / nguồn / tỷ giá của catalog đang nạp — hàm phụ, không phải công cụ."""
    return catalog.meta()


def product(product_id: str) -> dict:
    """Tra nhanh 1 sản phẩm đã công bố (hàm phụ để in kết quả, không phải công cụ của agent)."""
    return next((x for x in catalog.published() if x["id"] == product_id), {})
