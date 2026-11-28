# Báo cáo đánh giá — lượt 1 → một cải tiến → lượt 2

> Điền ở guide bước 4.1. Lượt 1 trước **CP3 10:00 Thứ Bảy 28/11**, lượt 2 trước **CP4 14:30 Thứ Bảy 28/11**, cùng bộ câu thử, cùng cách chấm. Chấm ở rubric R5.
> Số lấy từ `python run.py score eval/run-1.csv` (và `run-2.csv`) sau khi điền cột `pass`. **Kết quả thấp ghi thật vẫn đủ điểm.**
> Không được: sửa chuẩn "đạt", bỏ câu thử trượt, sửa `expected` cho khớp output, sửa kết quả lượt đã chạy.

## 1. Kết quả

| Lượt | Run ID | Đạt / tổng | % | thuong | kho | tu_choi | So với chuẩn "đạt" |
|---|---|---|---|---|---|---|---|
| 1 | run-1@20261128-075128 | 15/24 | 62% | 7/12 | 6/10 | 2/2 | chưa (chuẩn ≥80%) |
| 2 | run-2@20261128-140317 | 24/24 | 100% | 12/12 | 10/10 | 2/2 | đạt |

Model cả hai lượt: `gemini-3.1-flash-lite`, cùng bộ 24 câu, cùng `metric_spec.yaml`, cùng chuẩn "đạt". Kết quả từng câu: `eval/run-1.csv`, `eval/run-2.csv`. Trace: `traces/run-1.jsonl`, `traces/run-2.jsonl`.

Cách chấm: cột `pass` do người chấm theo `metric_spec.yaml` (grader "nguoi"). Lượt 2: Claude Code đọc 24 output và đề xuất từng ô kèm `ghi_chu`, Nguyễn Trung Anh duyệt trước khi ghi. Câu kém chắc nhất: B19 (agent hỏi lại thay vì đánh giá ngay, có nêu giới hạn dữ liệu). Chưa có người thứ hai chấm độc lập lượt 2, nên 100% cần đọc kèm giới hạn này.

## 2. Lỗi lượt 1 — gom thành nhóm có tên

| Nhóm lỗi | Số câu | Câu |
|---|---|---|
| Không hỏi lại khi thiếu thông tin (ngân sách, tên mẫu, nhu cầu) mà vẫn tự đề xuất | 7 | B16, B17, B18, B19, B20, B21, B24 |
| Kết luận không có căn cứ (trích dẫn không nói điều được khẳng định, đắt / thương hiệu = tốt) | 5 | B17, B19, B20, B23, B24 |
| Hiểu sai điều kiện bắt buộc (biến tiêu chí thành bắt buộc, hoặc bỏ sót điều kiện bắt buộc) | 2 | B16, B22 |

Một câu có thể thuộc nhiều nhóm; 9 câu trượt khác nhau.

**≥3 lỗi cụ thể:**

| Câu | Input | Output | Vì sao sai |
|---|---|---|---|
| B21 | "Có quá nhiều bàn phím, tôi không biết chọn cái nào vừa túi tiền." | Không hỏi ngân sách; đưa 3 mẫu 780k–1,196 triệu kèm dòng "45/45 bàn phím trong ngân sách" | Chưa biết ngân sách mà vẫn nói "trong ngân sách" — đúng điều `pass_criterion` cấm |
| B18 | So sánh "hai mẫu giá gần nhau" nhưng không nêu tên mẫu | Tự chọn Sony WH-1000XM3 (5,98 triệu) và ZIUTY A1 (520k) rồi so sánh | Không hỏi tên/mã; tự thay mẫu của người dùng, hai mẫu còn không "gần giá" |
| B22 | Cần bàn phím có nút chỉnh âm lượng; hỏi xử lý thế nào khi thông tin không ghi | "điều kiện bắt buộc: không có", đề xuất 3 mẫu, ghi "45/45 đạt đủ điều kiện" | Bỏ sót điều kiện bắt buộc; đề xuất mẫu không có bằng chứng về nút âm lượng |
| B24 | Có nên trả thêm tiền vì chống ồn | "dòng cao cấp như Sony thường chống ồn ổn định hơn"; Soundcore Q35 "chống ồn hiệu quả" nhưng trích dẫn nói về LDAC/màu | Mặc định đắt = tốt; nhận định không có trong trích dẫn |

## 3. Một lần cải tiến

- Nhắm vào nhóm lỗi: **không hỏi lại khi thiếu thông tin** — vì sao là nhóm **đau nhất với người dùng**: lớn nhất (7/9 câu trượt), và chính là pain gốc trong bằng chứng (người dùng bị ngợp, chưa rõ ngân sách/tiêu chí); đề xuất khi chưa biết ngân sách đưa ra mẫu 6–9 triệu cho người đang chê giá, vừa sai vừa làm mất lòng tin.
- Đã sửa gì (`codebase/agent.py`, `codebase/tools.py`, PR #12, #13 vào `develop`, PR #14 vào `main`):
  - Người dùng nhắc tới giá nhưng không nêu số ("vừa túi tiền", "hợp lý", "rẻ") → hỏi ngân sách, không đề xuất, không tự gán mức tiền (B16, B17, B20, B21, B24).
  - Người dùng nhắc "hai mẫu" mà không nêu tên → hỏi tên/mã, không tự chọn mẫu khác (B18).
  - Yêu cầu quá chung → hỏi ngân sách, mục đích, tiêu chí bắt buộc/ưu tiên, kèm cách SmartBuy sẽ đánh giá và giới hạn dữ liệu (B19).
  - Bắt thêm điều kiện bắt buộc dạng "cần có nút chỉnh âm lượng"; giải thích cách xử lý thuộc tính không ghi và mô tả trái review (B22, B23); sửa prompt xếp hạng.
- Kết quả: nhóm lỗi đó 0/7 → 7/7 câu đạt · tổng 62% → 100% (15/24 → 24/24).
- Câu nào **tệ đi** sau khi sửa: không có — 15 câu đạt ở lượt 1 vẫn đạt ở lượt 2. Trung bình số lần gọi model / câu giảm từ 0,83 xuống 0,54 vì câu hỏi lại không cần gọi model.

## 4. Còn lại

- Lỗi chưa sửa + nguy hiểm thế nào:
  - B11, B13 đặt hai lượt trong một ô input: chưa chứng minh agent nhớ phiên qua hai lần gọi riêng — trong app thật người dùng có thể bị mất ngữ cảnh.
  - Phần "Vì sao" do model viết vẫn có thể diễn giải quá trích dẫn; hiện chỉ người chấm phát hiện, chưa có kiểm tự động trích dẫn ↔ nhận định.
  - Catalog chỉ 422 sản phẩm Amazon (Mỹ), giá quy đổi 26.000đ/USD (tự ước tính) — không phải giá ở shop Việt Nam người dùng đang xem.
  - Lượt 2 mới có một người chấm; chưa có người thứ hai chấm độc lập.
- Nếu có thêm 1 tuần: thêm bộ nhớ phiên thật và câu thử nhiều lượt gọi riêng; kiểm tự động mỗi câu "Vì sao" có trích dẫn khớp; thử với 5 người dùng thật (`validation/log.md`) và thêm câu thử từ phản hồi của họ; nối giá từ sàn Việt Nam.
