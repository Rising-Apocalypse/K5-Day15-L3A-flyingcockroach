# Hồ sơ đánh giá — một trang

> Điền ở guide bước 2.4 (mục 1–4, trước CP2) và 4.1 (mục 5–6, trước CP4). Ôn lại: ngày 9, ngày 14 · lab ngày 9. Chấm ở rubric R4, R5.
> Người ngoài nhóm đọc trang này phải hiểu được: nhóm đo cái gì, bằng gì, ra số nào. Trang slide "Đánh giá thế nào" lấy từ đây.

## 1. Dataset → xử lý

Dataset nào, xử lý gì: tóm 2–3 dòng từ `data/DATA_CARD.md`.

## 2. Bộ câu thử dựng ra sao

- `eval/benchmark.csv`: 24 câu (thuong 12 · kho 10 · tu_choi 2). Hai câu từ chối là B14 (giao dịch ngoài phạm vi) và B15 (tấn công yêu cầu bỏ quy tắc, tạo sản phẩm/review giả).
- Nguồn (`python run.py check`): nguoi_dung 6 · data_that 3 · tu_viet 15 · sinh_seed 0 → từ người dùng / data thật 9/24 (37,5%, đạt ≥1/3).
- Độ phủ: ngành hàng (tai nghe/chuột/bàn phím); thông tin đầu vào (đủ/thiếu/mâu thuẫn); bằng chứng (có/thiếu/trái chiều); nhu cầu (ngân sách/tính năng/ưu tiên); tương tác (một lượt/nhiều lượt/từ chối).
- Câu `kho` trỏ về 4 lớp chỗ khó (`spec.md` §5): lớp 1: __ · lớp 2: __ · lớp 3: __ · lớp 4: __

## 3. Metric và cách chấm

B01–B15 được giữ nguyên khi mở rộng. B16–B24 là câu chuyển thể từ trải nghiệm thật, không phải yêu cầu nguyên văn của người tham gia; `source` ghi rõ vị trí nguồn. B16–B18 dựa trên P1–P3; B19–B21 dựa trên câu trả lời mở khảo sát (tab `680797427`, hàng 7/10/20, cột K); B22–B24 dựa trên ba review có ID trong `evidence/data-mining.md`. Link khảo sát nằm trong `evidence/summary.md`. Không thay expected theo output của agent.

Các câu B11/B13 chứa hai lượt trong một ô input: bộ chạy hiện gửi nguyên ô vào `answer(text)`. Chúng kiểm xử lý nội dung ngữ cảnh được cung cấp, chưa chứng minh bộ nhớ phiên qua hai lần gọi API độc lập.

| Metric (`eval/metric_spec.yaml`) | Cách chấm | Ngưỡng |
|---|---|---|
| | code / llm / nguoi | |
| | | |
| | | |

- **Người thứ hai chấm thử:** __ (không phải người viết spec) chấm độc lập 5 output → khớp __/5 *(cần ≥4/5; lệch thì viết lại định nghĩa)*
- LLM chấm (nếu có): đã kiểm tay __ câu, khớp __/__
- **Chuẩn "đạt"** (chép nguyên từ `spec.md` §7, chốt trước 19:30 Thứ Sáu 27/11): "__"

## 4. Lệnh

`python run.py eval` → `eval/run-N.csv` + `traces/run-N.jsonl` · điền cột `pass` · `python run.py score eval/run-N.csv`

## 5. Đã chạy gì

| Lượt | Run ID | Model | Cấu hình (prompt / công cụ / thay đổi) | Đạt / tổng | % | Đạt chuẩn? |
|---|---|---|---|---|---|---|
| 1 | run-1@20261128-075128 | gemini-3.1-flash-lite | Agent SmartBuy bản đầu (PR #8 backend) | 15/24 | 62% | Chưa (chuẩn ≥80%) |
| 2 | run-2@20261128-140317 | gemini-3.1-flash-lite | Hỏi lại khi thiếu ngân sách / tên mẫu / nhu cầu, bắt thêm điều kiện bắt buộc, sửa prompt (PR #12, #13, #14) | 24/24 | 100% | Đạt |

Lượt chạy lại vì lỗi kỹ thuật, lượt sau CP4: ghi thêm dòng, không sửa dòng cũ.

## 6. Lỗi chính

Nhóm lỗi lớn nhất lượt 1 là **không hỏi lại khi thiếu thông tin** (7/9 câu trượt: B16–B21, B24). Đã sửa agent để hỏi ngân sách / tên mẫu / nhu cầu thay vì tự đề xuất → lượt 2 đạt 24/24, không câu nào tệ đi. Còn lại: chưa có bộ nhớ phiên thật (B11, B13 gộp hai lượt một ô), phần "Vì sao" của model chưa có kiểm tự động trích dẫn, lượt 2 mới một người chấm. Chi tiết: `eval/report.md`.
