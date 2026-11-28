# Tóm tắt mô phỏng simulate-1@20261128-140857

Do `python run.py simulate` sinh ra — không sửa tay. Chép bảng sang `cost/cost-estimate.md`.

| Persona | Số phiên mô phỏng | Lượt hỏi / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên | Gọi công cụ / phiên |
|---|---:|---:|---:|---:|---:|---:|
| mua_mot_lan | 26 | 1 | 2664 | 202 | 0.6 | 10.5 |
| so_sanh_ky | 15 | 2 | 3005 | 252 | 0.7 | 13.3 |
| hay_mua_phu_kien | 9 | 3 | 7150 | 579 | 1.9 | 30.1 |

Tỉ lệ đạt dùng để tính: 24/24 (100%) — lượt run-2@20261128-140317

- Tỉ lệ đạt lấy từ lượt nhóm chọn: eval/run-2.csv (--rate-from).

| Model (giá) | Chi phí / phiên | Chi phí / task thành công | Chi phí / câu hỏi đạt | Chi phí / tháng — thấp (50 người) | Chi phí / tháng — cơ sở (100 người) | Chi phí / tháng — cao (300 người) | Chi phí / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|---:|
| gemini-3.1-flash-lite (vào 0.25 · ra 1.5 $/1M) | $0.0013 (≈ 34 ₫) | $0.0013 (≈ 34 ₫) | $0.00080 (≈ 21 ₫) | $0.1643 (≈ 4.272 ₫) | $0.3286 (≈ 8.545 ₫) | $0.9859 (≈ 25.634 ₫) | $0.0033 (≈ 85 ₫) |
| gemini-4-hydrogen (vào 1.5 · ra 7.5 $/1M) | $0.0075 (≈ 195 ₫) | $0.0075 (≈ 195 ₫) | $0.0045 (≈ 117 ₫) | $0.9323 (≈ 24.239 ₫) | $1.86 (≈ 48.479 ₫) | $5.59 (≈ 145.436 ₫) | $0.0186 (≈ 485 ₫) |

- Chi phí / task thành công = chi phí / phiên ÷ tỉ lệ đạt. Chi phí / câu hỏi đạt = chi phí / phiên ÷ số lượt hỏi trung bình mỗi phiên (1.7) ÷ tỉ lệ đạt — tỉ lệ đạt đo theo từng câu thử.
- Token đo trên model: gemini-3.1-flash-lite. Giá tính theo từng model trong bảng — model khác bộ tách token thì số token thật có thể lệch; ghi rõ "đo trên model X, tính giá model Y" trong cost/cost-estimate.md.
- Phiên lỗi (không tính vào trung bình): 0/50.
- Tỷ giá: 1 USD = 26.000 ₫ ((tự ước tính) cùng tỉ giá agent dùng để quy đổi giá Amazon).
