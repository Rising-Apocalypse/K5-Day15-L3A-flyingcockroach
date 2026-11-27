"""Sinh dữ liệu GIẢ LẬP (synthetic) cho bản chạy thử CP2 — chưa phải Amazon Reviews 2023.

Chạy lại:  python data/make_synthetic.py   → ghi data/products.json + data/reviews.json
Seed cố định (SEED) nên chạy lại ra đúng cùng file. Tên sản phẩm là tên dựng ("... Mẫu ..."),
giá tính bằng VND, đánh giá là câu viết mẫu theo tag — KHÔNG phải lời người dùng thật, KHÔNG dùng làm bằng chứng pain.
Mô tả ở data/DATA_CARD.md (Dataset 1).
"""
import json
import os
import random

SEED = 2711
HERE = os.path.dirname(os.path.abspath(__file__))

# (id, category, name, price_vnd, tags, specs, q = xác suất một đánh giá là khen)
PRODUCTS = [
    ("TN01", "tai_nghe", "Tai nghe Mẫu Air S", 590000, ["bluetooth", "nhe", "chong_nuoc"], {"kieu": "true wireless", "pin_gio": 6, "chong_nuoc": "IPX4"}, 0.75),
    ("TN02", "tai_nghe", "Tai nghe Mẫu Bass Pro", 890000, ["bluetooth", "bass_manh", "chong_on_chu_dong"], {"kieu": "chụp tai", "pin_gio": 30}, 0.7),
    ("TN03", "tai_nghe", "Tai nghe Mẫu Study", 250000, ["co_day", "mic", "nhe"], {"kieu": "nhét tai có dây", "jack": "3.5mm"}, 0.8),
    ("TN04", "tai_nghe", "Tai nghe Mẫu ANC Max", 1950000, ["bluetooth", "chong_on_chu_dong", "pin_trau", "mic"], {"kieu": "chụp tai", "pin_gio": 40}, 0.85),
    ("TN05", "tai_nghe", "Tai nghe Mẫu Sport", 450000, ["bluetooth", "chong_nuoc", "the_thao"], {"kieu": "móc tai", "pin_gio": 8, "chong_nuoc": "IPX5"}, 0.6),
    ("TN06", "tai_nghe", "Tai nghe Mẫu Gamer", 1200000, ["co_day", "mic", "gaming"], {"kieu": "chụp tai", "am_thanh": "giả lập 7.1"}, 0.7),
    ("TN07", "tai_nghe", "Tai nghe Mẫu NoName", 350000, [], {}, 0.5),  # cố ý thiếu thông số + không có đánh giá
    ("CH01", "chuot", "Chuột Mẫu Office", 150000, ["khong_day", "im_lang"], {"ket_noi": "USB 2.4GHz", "dpi": 1200}, 0.75),
    ("CH02", "chuot", "Chuột Mẫu Ergo", 690000, ["khong_day", "cong_thai_hoc"], {"ket_noi": "USB 2.4GHz + bluetooth", "dpi": 1600}, 0.8),
    ("CH03", "chuot", "Chuột Mẫu Gaming G1", 450000, ["co_day", "gaming", "dpi_cao"], {"ket_noi": "dây USB", "dpi": 12000}, 0.7),
    ("CH04", "chuot", "Chuột Mẫu Travel", 320000, ["bluetooth", "nho_gon", "im_lang"], {"ket_noi": "bluetooth", "dpi": 1000}, 0.65),
    ("CH05", "chuot", "Chuột Mẫu Pro Wireless", 1490000, ["khong_day", "gaming", "nhe", "dpi_cao"], {"ket_noi": "USB 2.4GHz", "dpi": 26000, "can_nang_g": 63}, 0.85),
    ("BP01", "ban_phim", "Bàn phím Mẫu Office", 290000, ["co_day", "im_lang"], {"layout": "full size", "loai": "màng"}, 0.7),
    ("BP02", "ban_phim", "Bàn phím Mẫu Mech 87", 890000, ["co_day", "co"], {"layout": "TKL 87 phím", "loai": "cơ"}, 0.75),
    ("BP03", "ban_phim", "Bàn phím Mẫu Mech Wireless", 1390000, ["khong_day", "bluetooth", "co", "hot_swap"], {"layout": "75%", "loai": "cơ"}, 0.8),
    ("BP04", "ban_phim", "Bàn phím Mẫu Slim BT", 590000, ["bluetooth", "mong", "nhieu_thiet_bi", "im_lang"], {"layout": "full size mỏng", "loai": "cắt kéo"}, 0.7),
    ("BP05", "ban_phim", "Bàn phím Mẫu Gaming RGB", 650000, ["co_day", "co", "rgb", "gaming"], {"layout": "full size", "loai": "cơ"}, 0.6),
]

# tag → (câu khen, câu chê). None = không có câu chê riêng.
LINES = {
    "bluetooth": ("Kết nối bluetooth nhanh, ít khi rớt.", "Thỉnh thoảng rớt kết nối bluetooth khi để điện thoại xa."),
    "khong_day": ("Không dây nên bàn gọn hẳn.", "Đầu thu USB nhỏ, dễ thất lạc."),
    "co_day": ("Cắm là dùng, không lo hết pin.", "Dây hơi ngắn so với nhu cầu."),
    "chong_on_chu_dong": ("Chống ồn chủ động tốt, đi xe buýt vẫn nghe rõ.", "Chống ồn chỉ ở mức tạm, tiếng quạt vẫn lọt vào."),
    "pin_trau": ("Pin dùng gần một tuần mới phải sạc.", "Pin tụt nhanh hơn quảng cáo."),
    "mic": ("Mic thu rõ, họp online người kia nghe tốt.", "Mic hơi rè khi gọi điện."),
    "nhe": ("Nhẹ, dùng cả ngày không thấy mỏi.", None),
    "bass_manh": ("Bass mạnh, nghe nhạc điện tử rất đã.", "Bass lấn át, giọng hát bị chìm."),
    "gaming": ("Chơi game phản hồi nhanh, không thấy trễ.", "Phần mềm đi kèm khó dùng."),
    "chong_nuoc": ("Ra mồ hôi nhiều vẫn dùng bình thường.", "Dính nước mưa một lần là rè một bên."),
    "the_thao": ("Chạy bộ đeo chắc, không bị rơi.", "Đeo chạy bộ lâu thì hơi đau tai."),
    "im_lang": ("Bấm rất êm, dùng trong thư viện không phiền ai.", None),
    "cong_thai_hoc": ("Cầm đỡ mỏi cổ tay sau cả ngày làm việc.", "Tay nhỏ cầm hơi to."),
    "dpi_cao": ("Cảm biến chính xác, chỉnh DPI được nhiều mức.", None),
    "nho_gon": ("Nhỏ gọn, bỏ túi laptop rất tiện.", "Nhỏ quá, tay to cầm lâu bị mỏi."),
    "co": ("Gõ phím cơ đã tay, âm thanh vui tai.", "Gõ khá ồn, ở văn phòng dễ làm phiền người khác."),
    "hot_swap": ("Thay switch dễ, không cần hàn.", None),
    "mong": ("Mỏng, mang theo cùng laptop tiện.", "Hành trình phím nông, gõ lâu hơi mỏi."),
    "nhieu_thiet_bi": ("Chuyển qua lại 3 thiết bị rất nhanh.", "Đổi thiết bị đôi khi phải bấm 2 lần."),
    "rgb": ("Đèn RGB đẹp, nhiều hiệu ứng.", "Đèn chói, chỉnh được ít mức."),
    "_chung": ("Đóng gói cẩn thận, hàng đúng mô tả. Giá này là đáng tiền.", "Dùng được 2 tháng thì bắt đầu có lỗi nhỏ, chất liệu nhựa hơi rẻ."),
}


def main():
    try:
        import sys
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    rng = random.Random(SEED)
    products, reviews = [], []
    for pid, cat, name, price, tags, specs, q in PRODUCTS:
        n_reviews = 0 if not tags else 5
        for i in range(1, n_reviews + 1):
            tag = rng.choice(tags + ["_chung"])
            pos, neg = LINES[tag]
            good = rng.random() < q or neg is None
            reviews.append({
                "review_id": "R-%s-%02d" % (pid, i),
                "product_id": pid,
                "rating": rng.choice([4, 5]) if good else rng.choice([1, 2, 3]),
                "aspect": tag,
                "text": pos if good else neg,
            })
        products.append({
            "product_id": pid,
            "category": cat,
            "name": name,
            "price_vnd": price,
            "tags": tags,
            "specs": specs,
            "rating": round(min(5.0, 3.2 + q * 1.6 + rng.uniform(-0.2, 0.2)), 1) if tags else None,
            "rating_count": rng.randint(20, 2500) if tags else 0,
            "label": "synthetic",
        })
    for fname, rows in (("products.json", products), ("reviews.json", reviews)):
        with open(os.path.join(HERE, fname), "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)
    print("Đã ghi %d sản phẩm, %d đánh giá (seed %d)" % (len(products), len(reviews), SEED))


if __name__ == "__main__":
    main()
