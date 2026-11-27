"""Recount the reviewed labels without downloading the Amazon dataset."""
import csv
import hashlib
from collections import Counter
from pathlib import Path

EXPECTED_HASH = "e512e1d484cb6d94d6fbbf796d4e06cf3d014f00fc5cb8a6f7eba19e78ea09cd"


def main():
    path = Path(__file__).with_name("pain_annotation_labeled.csv")
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    ids = [row["review_id"] for row in rows]
    if len(rows) != 200 or len(set(ids)) != len(ids):
        raise ValueError("Expected 200 unique review IDs")
    digest = hashlib.sha256("\n".join(sorted(ids)).encode()).hexdigest()
    if digest != EXPECTED_HASH:
        raise ValueError("Sample hash differs from the recorded sample")
    for row in rows:
        if row["label"] not in {"YES", "NO", "OUT_SCOPE"}:
            raise ValueError("Invalid or pending label")
        if not row["reason"].strip() or not row["reviewer"].strip():
            raise ValueError("Missing reason or reviewer")
        if row["label"] == "YES":
            quote = row["quote"].strip()
            if row["pain_type"] not in {"P01", "P02", "P03", "P04", "P05"}:
                raise ValueError("Invalid pain type")
            if not quote or len(quote.split()) > 20:
                raise ValueError("Missing or oversized quote")
            if "text" in row and "title" in row:
                if quote not in row["text"] and quote not in row["title"]:
                    raise ValueError("Quote does not match source text")
    counts = Counter(row["label"] for row in rows)
    denominator = counts["YES"] + counts["NO"]
    if denominator == 0:
        raise ValueError("No in-scope reviews")
    print(f"Sample: {len(rows)} unique reviews; SHA256: {digest}")
    print(f"YES={counts['YES']}, NO={counts['NO']}, OUT_SCOPE={counts['OUT_SCOPE']}")
    print(f"Pain: {counts['YES']}/{denominator} = {100 * counts['YES'] / denominator:.2f}%")
    print("This verifies the recorded labels and count, not human judgment or data collection.")


if __name__ == "__main__":
    main()
