# Reflection — Nguyễn Tiến Cường

> Bản nháp do Claude Code hỗ trợ soạn từ lịch sử commit, kết quả eval và phiên làm việc trong repo; Nguyễn Tiến Cường đọc lại và chỉnh phần bài học cá nhân trước khi nộp. Hạn: **23:59 Thứ Bảy 28/11**.

1. **Vai trò + phần mình làm (trỏ tới file / commit):**
   Mình phụ trách FE và DevOps. Phần FE: mình dựng giao diện web bản đầu, gồm danh mục, trang sản phẩm, so sánh, báo cáo, trace, panel trợ lý trong `frontend/`, và server `codebase/web.py` phục vụ giao diện và API (`4227281`). Sau đó mình đổi sang giao diện cobalt (`0cc346d`) và làm gọn panel trợ lý: màn trống từ 223 xuống 98 chữ, nhãn Việt hoá, chữ tối thiểu 12px (`07de8c2`).
   Phần tìm kiếm catalog: ô tìm kiếm hiểu tên ngành và vài cụm tiếng Việt, thêm tab "Tất cả" làm mặc định, gõ "tai nghe" từ 0 lên 319 kết quả (`4ff89c6`, `codebase/catalog.py`, `frontend/js/views/catalog.js`). Mình cũng chỉnh thẻ sản phẩm (`c1350ca`), và sửa lỗi API tìm kiếm trả về biến `switched_from` chưa định nghĩa (`524740a`).
   Phần DevOps: mình merge PR #2 (`develop` → `main`), #3 (`eval/benchmark-metrics`) và #6 (`docs`) vào `main`, merge #8 (`backend`) vào `develop`, và giữ nhánh `feat/frontend` theo kịp `develop` trước khi làm tiếp.

2. **AI hỗ trợ mình thế nào (việc gì, công cụ gì, chỗ nào phải sửa lại output AI):**
   Mình dùng hai công cụ: Codex cho `4227281`, `0cc346d`, `c1350ca` và `524740a`; Claude Code (Claude Opus 5.5, trong app Claude) cho `07de8c2`, `4ff89c6` và bản nháp reflection này. Với Claude Code, AI đọc code, sửa giao diện và hàm tìm kiếm, rồi tự mở app trong trình duyệt để kiểm giao diện sáng/tối và mobile.
   Ba chỗ mình phải chỉnh hướng AI:
   - AI không tự thấy panel trợ lý quá nhiều chữ; mình phải chỉ ra thì nó mới đo và làm gọn.
   - Khi sửa lỗi tìm "tai nghe", AI định sửa luôn trên nhánh cũ, chưa có catalog thật; mình bắt kéo `develop` (422 sản phẩm) về trước.
   - Bản sửa đầu chỉ hiện nút "Xem trong Chuột" khi gõ "chuột" ở tab Tai nghe, mà nút nằm dưới mép màn hình; mình yêu cầu hiện thẳng mọi sản phẩm, nên mới có tab "Tất cả".
   Bài học: AI sửa nhanh và tự kiểm được giao diện, nhưng không biết thế nào là "đủ gọn" hay dữ liệu nào là thật. Mình phải nhìn màn hình như người dùng và chỉ đúng nhánh, đúng dữ liệu thì nó mới sửa đúng chỗ.

3. **Một câu thử trượt của nhóm và mình học được gì từ nó:**
   B16 trượt ở lượt 1. Người dùng kể "âm thanh, chống ồn, pin và giá" là các tiêu chí để thu hẹp lựa chọn, nhưng agent biến "chống ồn" thành điều kiện bắt buộc (còn 24/319 mẫu), không hỏi ngân sách, và đưa mẫu đầu là Sony 5,98 triệu (`eval/run-1.csv`). Ở lượt 2 câu này đạt: agent hỏi ngân sách và giải thích tiêu chí (`eval/run-2.csv`).
   Từ góc nhìn FE, bài học là ranh giới "bắt buộc" và "ưu tiên" rất dễ lẫn, nên giao diện phải cho người dùng thấy agent đã hiểu thế nào. Ở ô tìm kiếm, "chống ồn" là bộ lọc vì người dùng chủ động gõ để lọc; trong hội thoại nó chỉ nên là tiêu chí ưu tiên.
   Panel trợ lý tách riêng hai nhóm "Bắt buộc / Ưu tiên" và cho bỏ từng mục rồi chạy lại. Nhờ vậy, khi agent hiểu sai như ở B16, người dùng thấy ngay "chống ồn" nằm trong nhóm Bắt buộc và tự gỡ được, không phải chờ lượt sửa code tiếp theo.
