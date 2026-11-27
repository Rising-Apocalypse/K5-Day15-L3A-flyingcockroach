# ============================================================================
# Ô XUẤT DỮ LIỆU — dán vào CUỐI notebook DataDiscovery.ipynb (Colab), sau ô tạo final_audit.
#
# Cần các biến notebook đã tạo: revision, final_audit, mvp_review_df, review_pool,
#   MAX_RECORDS, MAX_REVIEWS, MAX_PER_PRODUCT, TARGET_AUDIT.
# Ghi ra /content/amazon_raw/ rồi nén thành amazon_raw.zip và tải về:
#   products.jsonl  — sản phẩm trong final_audit (thông tin gốc, giá USD)
#   reviews.jsonl   — đánh giá đã lọc của các sản phẩm đó (KHÔNG có user_id)
#   manifest.json   — nguồn, revision, tham số lọc, số dòng
# Sau khi tải: giải nén vào data/amazon_raw/ của repo rồi chạy
#   python data/build_from_amazon.py
# ============================================================================
import datetime
import json
import math
import os
import shutil

OUT_DIR = "/content/amazon_raw"
os.makedirs(OUT_DIR, exist_ok=True)


def to_plain(v):
    """numpy array / numpy số / NaN → kiểu JSON thường."""
    if hasattr(v, "tolist"):
        v = v.tolist()
    if isinstance(v, float) and not math.isfinite(v):
        return None
    if isinstance(v, dict):
        return {str(k): to_plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [to_plain(x) for x in v]
    return v


keep_ids = [pid for pid in final_audit["parent_asin"] if pid in review_pool]

PRODUCT_COLS = [
    "parent_asin", "smartbuy_category", "title", "store", "price_usd",
    "average_rating", "rating_number", "features", "description",
    "details_parsed", "category_path", "leaf_category",
]
prod_df = (
    mvp_review_df
    .drop_duplicates(subset=["parent_asin"])
    .set_index("parent_asin")
    .loc[keep_ids]
    .reset_index()
)
prod_cols = [c for c in PRODUCT_COLS if c in prod_df.columns]

n_products = 0
with open(f"{OUT_DIR}/products.jsonl", "w", encoding="utf-8") as f:
    for row in prod_df[prod_cols].to_dict(orient="records"):
        row = to_plain(row)
        row["details"] = row.pop("details_parsed", None) or {}
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
        n_products += 1

REVIEW_COLS = ["review_id", "parent_asin", "asin", "rating", "title", "text",
               "timestamp", "verified_purchase", "helpful_vote"]  # cố ý KHÔNG có user_id
n_reviews = 0
with open(f"{OUT_DIR}/reviews.jsonl", "w", encoding="utf-8") as f:
    for pid in keep_ids:
        for r in review_pool[pid]:
            f.write(json.dumps(to_plain({k: r.get(k) for k in REVIEW_COLS}), ensure_ascii=False) + "\n")
            n_reviews += 1

manifest = {
    "source": "McAuley-Lab/Amazon-Reviews-2023 (Hugging Face), danh mục Electronics",
    "url": "https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023",
    "revision": revision,
    "citation": "Hou, Li, He, Yan, Chen, McAuley (2024). Bridging Language and Items for Retrieval and Recommendation. arXiv:2403.03952",
    "exported_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "filters": {
        "metadata_scanned": MAX_RECORDS,
        "reviews_scanned": MAX_REVIEWS,
        "max_reviews_per_product": MAX_PER_PRODUCT,
        "min_reviews_per_product": 10,
        "target_per_category": TARGET_AUDIT,
        "sample_random_state": 42,
        "steps": "regex tên/danh mục → leaf category hợp lệ → loại phụ kiện/combo → có giá USD + ảnh + details "
                 "→ đánh giá có chữ, sao 1–5, bỏ trùng → giữ SP có ≥10 đánh giá → lấy mẫu theo loại",
    },
    "audit_status": "PENDING (chưa kiểm tay is_correct_product / is_accessory / is_combo)",
    "counts": {
        "products": n_products,
        "reviews": n_reviews,
        "products_by_category": prod_df["smartbuy_category"].value_counts().to_dict(),
    },
    "privacy": "đã bỏ user_id; review_id là sha256(parent_asin, asin, user_id, timestamp, text) do notebook tạo",
}
with open(f"{OUT_DIR}/manifest.json", "w", encoding="utf-8") as f:
    json.dump(to_plain(manifest), f, ensure_ascii=False, indent=2)

shutil.make_archive("/content/amazon_raw", "zip", OUT_DIR)
print(json.dumps(manifest["counts"], ensure_ascii=False, indent=2))
print("Đã ghi /content/amazon_raw.zip")

try:
    from google.colab import files
    files.download("/content/amazon_raw.zip")
except ImportError:
    pass
