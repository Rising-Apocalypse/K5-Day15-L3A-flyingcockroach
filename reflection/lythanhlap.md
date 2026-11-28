# Reflection — Lý Thành Lập

> Làm ở guide bước 5.3. Mỗi người một file: chép file này thành `reflection/<ten-khong-dau>.md` (viết thường, không dấu). Hạn: **23:59 Thứ Bảy 28/11**. Mỗi câu 3–6 dòng.

1. Vai trò + phần mình làm (trỏ tới file / commit):
   Thành viên, phụ trách BE/FE — làm backend của agent SmartBuy và nối với web. Khung agent CP2 (`593e23b`): `codebase/agent.py`, `codebase/tools.py`, `data/build_from_amazon.py`.
   Nối model thật, dựng catalog Amazon chung cho web và agent (422 sản phẩm), khớp hợp đồng API với frontend (`f81ed75`, `dd7b979`, `c53620c`): `codebase/ai.py`, `codebase/build_catalog.py`, `data/DATA_CARD.md`.
   Phía FE: sửa ô tìm kiếm tiếng Việt, gõ tên ngành khác thì tự chuyển ngành (`127f6ee`, `frontend/js/views/catalog.js`). Giao diện chính là của Cường; mình gộp các PR #1, #4, #5, #7, #11–#13 vào `develop`.
   Sau lượt 1, sửa nhóm lỗi "không hỏi ngân sách" và "nhận định không có bằng chứng" (`0e65a96`, `0956c6d`). Nhật ký ở `docs/backend-log.md`.

2. AI hỗ trợ mình thế nào (việc gì, công cụ gì, chỗ nào phải sửa lại output AI):
   Dùng Claude Code (Claude Opus 5.5) viết phần lớn backend, khai báo ở `docs/ai-usage.md`. Mình viết bộ tự kiểm (70 ca với model giả, 24 ca tiêm lỗi) để kiểm code AI viết. Bộ kiểm bắt được agent sập khi model trả `shortlist` sai khuôn, và lỗi báo sai "chỉ có 1 mẫu đủ điều kiện" khi catalog có 95 mẫu đạt (`docs/backend-log.md` §8).
   Output của model trong sản phẩm cũng phải chặn: model bịa mã bằng chứng (vd `D3`) và viết nhận định không có review đỡ, như "uy tín thương hiệu… đảm bảo chất lượng" ở B17. Mình thêm `check_shortlist` và `audit_claims` để gỡ những câu đó (§12).
   Chỗ AI đề xuất đổi kiến trúc cho khớp tài liệu BA (thêm bước AI lập kế hoạch, chấm F 0/50/100), mình không cho tự sửa mà ghi lại để nhóm quyết (§9.3).

3. Một câu thử trượt của nhóm và mình học được gì từ nó:
   B21 — "Có quá nhiều bàn phím, tôi không biết chọn cái nào vừa túi tiền." Lượt 1 trượt vì agent không hỏi ngân sách mà vẫn đưa 3 mẫu từ 780k đến 1,196 triệu, kèm dòng "45/45 trong ngân sách".
   Nguyên nhân nằm ở code của mình: luật "thiếu ngân sách thì KHÔNG hỏi" viết cho B02/B06/B07/B14 ("không tự áp đặt ngân sách") lại áp cho mọi câu, kéo trượt luôn B16, B17, B19, B20, B24.
   Bài học: luật sửa cho một nhóm câu thử phải kiểm cả trên những câu có ý ngược lại, và phải xem trượt theo nhóm lỗi chứ không sửa từng câu. Mình tách thành cờ `price_concern` (nhắc đến giá mà không có con số → hỏi lại ngân sách) trong `0e65a96`.
   Kết quả lượt 2: B21 __ (điền sau khi chấm lượt 2).
