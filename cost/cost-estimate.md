# Chi phí khi dùng thật

> Điền ở guide bước 4.2, nộp ở CP4 14:30 Thứ Bảy 28/11. Ôn lại: ngày 13, ngày 1, ngày 14 · lab ngày 13, lab ngày 14. Chấm ở rubric R6.
> Số **không điền tay**: điền `cost/personas.yaml` → `python run.py simulate` → chép bảng trong `cost/simulate-N-summary.md` vào đây.
> Lúc build dùng gói miễn phí vẫn tính theo **giá gói trả phí** — đây là chi phí cho lúc đưa vào dùng thật.

## 1. Đầu vào

- **Persona** (`cost/personas.yaml`): 3 kiểu — `mua_mot_lan` 50% · 1 phiên/tháng · 1 lượt; `so_sanh_ky` 30% · 2 phiên · 2 lượt; `hay_mua_phu_kien` 20% · 4 phiên · 3 lượt. Nguồn: số phiên/tháng theo persona ở `spec.md` §2; tỉ trọng và số lượt/phiên *(tự ước tính)*.
- **Số người dùng thật** 3 kịch bản: thấp 50 · cơ sở 100 · cao 300. Nguồn: cơ sở 100 theo kịch bản impact `spec.md` §2; cả ba *(tự ước tính)*, chưa có nguồn công khai về quy mô.
- **Giá** 2 mức model (từ `further-reading/model-prices.md` của repo đề, https://ai.google.dev/gemini-api/docs/pricing, xem 25/11/2026): gemini-3.1-flash-lite $0,25 vào / $1,50 ra mỗi 1M token · gemini-4-hydrogen $1,50 / $7,50.
- **Tỉ lệ đạt** dùng để tính: 24/24 (100%) — lượt `run-2` (lượt 2, `run-2@20261128-140317`)
- Đo token trên model gemini-3.1-flash-lite, tính giá model gemini-3.1-flash-lite và gemini-4-hydrogen

## 2. Kết quả mô phỏng

Lượt mô phỏng: `cost/simulate-1.csv` · run ID simulate-1@20261128-140857 · 50 phiên (0 phiên lỗi) · seed 42

| Persona | Số phiên mô phỏng | Lượt hỏi / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên | Gọi công cụ / phiên |
|---|---:|---:|---:|---:|---:|---:|
| mua_mot_lan | 26 | 1 | 2664 | 202 | 0.6 | 10.5 |
| so_sanh_ky | 15 | 2 | 3005 | 252 | 0.7 | 13.3 |
| hay_mua_phu_kien | 9 | 3 | 7150 | 579 | 1.9 | 30.1 |

| Model | Chi phí / phiên | Chi phí / task thành công | / tháng — thấp | / tháng — cơ sở | / tháng — cao | / người / tháng (cơ sở) |
|---|---|---|---|---|---|---|
| gemini-3.1-flash-lite | $0.0013 (≈ 34 ₫) | $0.0013 (≈ 34 ₫) | $0.1643 (≈ 4.272 ₫) | $0.3286 (≈ 8.545 ₫) | $0.9859 (≈ 25.634 ₫) | $0.0033 (≈ 85 ₫) |
| gemini-4-hydrogen | $0.0075 (≈ 195 ₫) | $0.0075 (≈ 195 ₫) | $0.9323 (≈ 24.239 ₫) | $1.86 (≈ 48.479 ₫) | $5.59 (≈ 145.436 ₫) | $0.0186 (≈ 485 ₫) |

Chi phí / task thành công = chi phí trung bình mỗi phiên ÷ tỉ lệ đạt — **không coi như đạt 100%**. Ở đây tỉ lệ đạt đo được của lượt 2 là 100% (24/24, một người chấm), nên hai số bằng nhau; nếu chấm lại thấp hơn thì chi phí / task tăng tương ứng. Tỷ giá 26.000 ₫/USD *(tự ước tính)*.

## 3. So với impact

- Impact / người / tháng (`spec.md` §2): kịch bản cơ sở 1.500 phút / 100 người = 15 phút / người / tháng *(tự ước tính, chưa đo)*
- Chi phí / người / tháng (cơ sở, model gemini-3.1-flash-lite): $0.0033 (≈ 85 ₫); model lớn gemini-4-hydrogen $0.0186 (≈ 485 ₫)
- **Kết luận một dòng — đáng làm không:** chi phí model không phải rào cản (dưới 500 ₫ / người / tháng kể cả model lớn); điều quyết định là impact 15 phút / người có thật không — cần đo với người mua thật trước khi mở rộng.
