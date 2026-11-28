# Reflection — Nguyễn Thị Thùy Dung

> Bản nháp do Codex hỗ trợ từ lịch sử commit, tài liệu và phiên làm việc trong repo; Nguyễn Thị Thùy Dung cần đọc lại, chỉnh phần trải nghiệm và bài học cá nhân trước khi nộp. Hạn: **23:59 Thứ Bảy 28/11**.

1. **Vai trò + phần mình làm (trỏ tới file / commit):**
   Mình phụ trách BA: xác định người dùng, pain, phạm vi giải pháp và cách kiểm chứng trong `canvas.md`, `spec.md` §0–§3, phần thiết kế §4 và chuẩn nghiệm thu §7 (commit `89bba09`, `d421ff9`, `8c1b235`).
   Mình tổng hợp bằng chứng từ ba phỏng vấn P1–P3 và khảo sát trong `evidence/summary.md`, ghi rõ nguồn, giới hạn mẫu và những điều chưa xác minh (`8cf9e17`).
   Mình xây dựng benchmark và metric, sau đó mở rộng thành 24 câu gồm 12 câu thường, 10 câu khó và 2 câu từ chối; bổ sung hồ sơ đánh giá trong `eval/README.md` (`b99b1d3`, `fe371af`).
   Mình cũng bổ sung notebook, bảng nhãn và `evidence/count_pain.py` để tái lập số đếm 13/181 review có pain; các giả định impact trong spec được tách khỏi kết quả đo thực tế.

2. **AI hỗ trợ mình thế nào (việc gì, công cụ gì, chỗ nào phải sửa lại output AI):**
   Trong phiên hoàn thiện hồ sơ, mình dùng Codex rà soát repo, đối chiếu code với tài liệu, kiểm tra format và hoàn thiện `TEAMS.md` và khai báo dùng AI.
   Codex hỗ trợ soạn `evidence/hypothesis.md` và bản nháp reflection này từ nguồn đã có; phần khai báo này chỉ ghi những lượt hỗ trợ đã được xác minh, không suy đoán công cụ dùng cho các commit trước.


3. **Một câu thử trượt của nhóm và mình học được gì từ nó:**
   B22 ở lượt 1 yêu cầu bàn phím có nút chỉnh âm lượng và hỏi cách xử lý khi thông tin không ghi. Agent lại hiểu là không có điều kiện bắt buộc, đề xuất ba mẫu và nói đủ điều kiện dù chưa có bằng chứng về nút âm lượng (`eval/report.md`, `eval/run-1.csv`).
   Từ góc nhìn BA, bài học là yêu cầu bằng ngôn ngữ tự nhiên phải được chuyển thành điều kiện kiểm được: người dùng nói “cần có” thì hệ thống phải giữ điều kiện đó, không được bỏ qua vì catalog thiếu dữ liệu.
   “Chưa xác minh” cần là một trạng thái rõ ràng, khác với “đạt”; câu hỏi lại hoặc thông báo chưa đủ căn cứ cũng có thể là kết quả đúng. Bộ câu thử cần bao phủ trường hợp này thay vì chỉ kiểm các yêu cầu đầy đủ thông tin.
