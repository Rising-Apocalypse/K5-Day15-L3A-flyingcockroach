# Reflection — Nguyễn Trung Anh

> Làm ở guide bước 5.3. Hạn: **23:59 Thứ Bảy 28/11**.

1. **Vai trò + phần mình làm (trỏ tới file / commit):**
   Mình là đội trưởng. Mình lo phần repo và đưa bài lên `main`: tạo repo, điền `TEAMS.md` và `canvas.md`, rồi kiểm và merge `develop` vào `main` hai lần (PR #9 lúc 07:41 trước lượt 1, PR #14 lúc 14:04 trước lượt 2), vì giám khảo chấm theo `main`.
   Phần đánh giá: chạy lượt 1 (`433b35f`), chấm 15/24 (`1d7afbc`), chạy lượt 2 (`5590028`), duyệt bản chấm 24/24 (`97cbda8`), viết `eval/report.md` và `eval/README.md` mục 5–6.
   Phần chi phí: chạy `simulate` 50 phiên với tỉ lệ đạt lấy từ `run-2`, ra $0.0013 cho mỗi task thành công (`c720812`).
   Phần spec: viết đầu file, nửa sau §4, §5, §6, §8, §9 và changelog §10 (`cb819ec`). Mình cũng đưa `demo-slides.pdf` lên repo và cập nhật trang 4–7 theo kết quả lượt 2 (`051f4c5`).

2. **AI hỗ trợ mình thế nào (việc gì, công cụ gì, chỗ nào phải sửa lại output AI):**
   Mình dùng Claude Code (Claude Opus 5.5) cho gần hết phần việc trên: setup `.env` (AI không đọc key), kiểm PR không đụng file đã chốt rồi merge, chạy `eval` và `simulate`, soạn nháp spec, report và slide từ code và từ các file kết quả. Chi tiết ở `docs/ai-usage.md`.
   Ba chỗ mình phải sửa hoặc chặn lại:
   - AI từng báo spec §0–§4 đã xong chỉ vì `grep` không còn thấy chuỗi `__`. Mình hỏi lại thì AI mới liệt kê ra những phần thật ra vẫn còn trống.
   - Bản `cost/personas.yaml` AI sửa lần đầu vẫn giữ số mẫu 300/700/1000 người, lệch với kịch bản 100 người ở spec §2. AI phải dừng `simulate` giữa chừng, sửa cho khớp §2 rồi chạy lại.
   - Cột `pass` của lượt 2 do AI đề xuất. Mình duyệt từng câu, và ghi rõ trong report rằng lượt này mới có một người chấm, chưa có người thứ hai chấm độc lập.
   Bài học: AI làm nhanh, nhưng câu nào có số thì mình phải truy được về file gốc thì mới dám để lên repo.

3. **Một câu thử trượt của nhóm và mình học được gì từ nó:**
   Câu B21 ("Có quá nhiều bàn phím, tôi không biết chọn cái nào vừa túi tiền") trượt ở lượt 1. Agent không hỏi ngân sách mà vẫn đưa 3 mẫu giá 780k–1,2 triệu, kèm dòng "45/45 bàn phím trong ngân sách", trong khi người dùng chưa hề nói ngân sách là bao nhiêu.
   Code đã ghi rõ "Thiếu ngân sách KHÔNG hỏi". Đây là quyết định cố ý để agent luôn trả lời được, nhưng lại đi ngược đúng cái pain mà nhóm đã tìm ra: người mua bị ngợp và chưa biết mình cần gì.
   Bảy trên chín câu trượt (B16–B21, B24) cùng chung lỗi này. Các câu đó đều chuyển thể từ phỏng vấn, khảo sát và review thật, còn 15 câu nhóm tự viết thì đạt hết.
   Mình học được hai điều. Thứ nhất, bộ câu thử phải có câu lấy từ người dùng thật, vì câu tự viết hay vô tình né đúng chỗ agent yếu. Thứ hai, với bài tư vấn, "biết hỏi lại" cũng là một kết quả đúng, không phải thất bại. Sau khi sửa cho agent hỏi lại, lượt 2 đạt 24/24 mà không câu nào tệ đi. Dù vậy mình vẫn coi 100% là con số cần kiểm thêm, bằng người chấm thứ hai và bằng việc cho người mua thật dùng thử.
