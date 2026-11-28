# Khai báo dùng AI

README của nhóm có mục "Dùng AI vào việc gì" (2–3 dòng, bắt buộc). Ghi chi tiết vào bảng dưới đây.

> Luật của đề: dùng AI để làm bài thoải mái, nhưng **ai không giải thích được phần có tên mình thì phần đó nhận 0 điểm**. Khai thiếu không bị trừ; giấu mới bị.

| Việc | Công cụ AI | AI làm gì | Người kiểm/sửa gì | Ai phụ trách |
|---|---|---|---|---|
| Code bản chạy thử | Claude Code (Claude Opus 5.5) | Viết backend 27/11: `ai.py` (gọi model), `tools.py`, `agent.py`, chế độ `--from-export` của `build_catalog.py` — chi tiết `docs/backend-log.md` | Chạy 15 câu thử chế độ giả + `eval --try` 3 câu; người còn phải đọc lại code và chấm lượt 1: __ | Lý Thành Lập |
| Setup repo, tích hợp nhánh, chạy eval, soạn nháp spec | Claude Code (Claude Opus 5.5) | Kiểm `develop` merge vào `main` không xung đột và không đụng file đã chốt rồi tạo/merge PR #9; tạo `.env` (không đọc key); chạy `eval --try`, commit `run-1`; soạn nháp `spec.md` đầu file, nửa sau §4, §5, §6, §9, changelog §10 từ `codebase/agent.py`, `tools.py`, `eval/benchmark.csv`, `eval/run-1.csv` | Cột `pass` lượt 1 do người chấm theo `metric_spec.yaml`, AI không chấm; đọc lại nháp spec trước khi commit; `run.py check` không báo lỗi | Nguyễn Trung Anh |
| Prompt / thiết kế lời gọi mô hình | | | | |
| Đào data (viết script đếm, gợi ý nhãn) | | | Kiểm tay __ dòng, khớp __ | |
| Rà câu hỏi phỏng vấn / khảo sát | | Chỉ rà câu dẫn dắt | | |
| Viết câu thử (benchmark) | | | Mỗi câu thử có `source`; câu thử AI viết được ghi rõ | |
| Sinh data `synthetic` (nếu có) | | | Seed __ · kiểm tay __ dòng | |
| Chấm cột `pass` bằng LLM (nếu có) | | | Kiểm tra thủ công __ câu thử, khớp __/__ | |
| Slide, văn bản | | | | |

**Không dùng AI để:** tạo người được phỏng vấn, trích dẫn, câu trả lời khảo sát; sửa kết quả các lượt đã chạy (`eval/run-*.csv`, `cost/simulate-*.csv`, `traces/`).
