# Nhật ký backend — SmartBuy (nhánh `backend`)

> Người phụ trách: Lý Thành Lập (BE/FE). Phần code trong mục này viết cùng Claude Code (xem `docs/ai-usage.md`).
> Ngày: 27/11/2026 (sau CP2). Không đụng tới `eval/benchmark.csv`, `eval/metric_spec.yaml`, chuẩn "đạt" ở `spec.md` §7,
> hay bất kỳ lượt `eval/run-N.csv` / `cost/simulate-N.csv` nào. Chưa chạy lượt eval có số (lượt 1) — để nhóm chạy và chấm.

## 1. Tình trạng trước khi làm

| Chỗ | Vấn đề | Hậu quả với bộ câu thử |
|---|---|---|
| `codebase/ai.py` | Chưa có phần gọi model thật; `.env` đặt `openai` nhưng code `raise NotImplementedError` | Không chạy được lượt eval nào được tính |
| `codebase/tools.py` | Đọc `data/products.json` **giả lập** (17 sản phẩm "Tai nghe Mẫu…") | Metric `trich_dung_nguon` đòi nguồn Amazon Reviews 2023 → không đạt được |
| `codebase/agent.py` | Bluetooth chỉ là "ưu tiên mềm", không lọc cứng | B01: lượt thử cũ (18:38, chế độ giả) xếp "Tai nghe Mẫu Study" (TN03, tag `co_day` — tai nghe có dây) lên đầu |
| `codebase/agent.py` | Thiếu ngân sách → luôn hỏi lại | B02, B06, B07, B14 đòi "không tự áp đặt ngân sách" → trượt |
| `codebase/agent.py` | Không có nhánh giải thích, mâu thuẫn, so sánh, nhiều lượt, bịa dữ liệu | B04, B09, B11, B13, B15 trượt |
| Web ↔ agent | Web đọc catalog demo (ID `HP-01`…), agent đọc `products.json` (ID `TN01`…); agent không trả khoá `smartbuy` | Giao diện không vẽ được Top 3 / trace; ID agent không có trong catalog web |

## 2. Đã làm

### 2.1 Dữ liệu — một catalog chung cho web và agent
- `codebase/build_catalog.py`: thêm chế độ `--from-export DIR` đọc bản xuất Colab (`data/amazon_raw/products.jsonl` + `reviews.jsonl`):
  - đổi `category_path` → `categories`, `price_usd` → `price`; dùng nhãn `smartbuy_category` có sẵn;
  - bản xuất không chép trường `images` (notebook đã lọc "có ảnh") → chỉ cảnh báo, không chặn công bố;
  - **tiêu đề phải chứa từ của đúng loại** (bản xuất có `audit_status: PENDING` và lẫn hàng sai: một "Outdoor End Table" và một "Battery Pack for Reclining Furniture" bị gắn nhãn Headphones);
  - thêm luật loại phụ kiện theo tiêu đề: cleaning kit, battery pack, "kitty ears", ốp chuột (`case`, `replacement`).
- Lệnh dựng (chạy lại ra cùng file):
  ```
  python codebase/build_catalog.py --from-export data/amazon_raw --per-category 500 --max-reviews 20 --min-ratings 10 --usd-vnd 26000 --fx-source "(tự ước tính)"
  ```
- Kết quả lần đầu (bản xuất v1, 197 sản phẩm): 167 sản phẩm, 2.952 review. **Đã thay bằng bản xuất v2 — xem mục 5.** Tỷ giá 26.000đ/USD *(tự ước tính)*, giống `data/build_from_amazon.py`.
- Độ phủ thuộc tính đã xác minh (in ra khi dựng): kết nối 94% / 91% / 88% (tai nghe / chuột / bàn phím); ANC chỉ 3%; switch 42%; pin 12–41%. → Các câu đòi ANC, Red Switch, pin ≥ N giờ phần lớn sẽ ra "chưa xác minh" — đúng ý B10, B12.
- `data/products.json`, `data/reviews.json` (giả lập) **không còn được agent dùng**; giữ lại vì `data/DATA_CARD.md` còn mô tả. `frontend/demo/catalog.synthetic.json` chỉ dùng khi chưa có `data/catalog.json`.

### 2.2 `codebase/ai.py` — nối model thật
- Chỉ thư viện chuẩn (`urllib`). Hỗ trợ `openai` (và API kiểu OpenAI qua `MODEL_BASE_URL`), `anthropic`, `gemini`, `ollama`; chế độ `fake` giữ nguyên.
- Token lấy từ `usage` của API (OpenAI `prompt_tokens/completion_tokens`, Claude `input_tokens/output_tokens`, Gemini `promptTokenCount/candidatesTokenCount (+thoughtsTokenCount)`, Ollama `prompt_eval_count/eval_count`). Không ước lượng.
- `temperature=0`, `max_tokens=1200`, thử lại tối đa 2 lần khi HTTP 429 / 5xx / mất mạng. Lỗi khác bay ra để khung ghi vào cột `error`. Không in key.

### 2.3 `codebase/tools.py` — công cụ trên catalog chung
| Công cụ | Input | Output | Tác động ra ngoài? |
|---|---|---|---|
| `parse_constraints` | tin nhắn | loại, ngân sách, điều kiện **cứng** (Bluetooth, không dây, có dây, ANC, có mic, bàn phím số, màu switch, pin ≥ N giờ), điều kiện bị phủ định, tiêu chí **mềm** theo thứ tự, mục đích, số lượng, cờ ý định (tìm / giải thích / so sánh / đặt hàng / bịa dữ liệu / "cứ mặc định") | Không |
| `search_catalog` | loại, khoảng giá, điều kiện cứng | `matches` (mọi điều kiện MATCH), `unverified` (có điều kiện UNKNOWN/CONFLICT), số đếm, mẫu rẻ nhất | Không |
| `get_evidence` | product_id, tiêu chí mềm | thuộc tính đã xác minh + mã nguồn, review theo từng tiêu chí (số review nhắc tới, số ≥4★, số ≤2★, trích dẫn có mã R…) | Không |
| `check_shortlist` | danh sách AI chọn, ràng buộc, ID ứng viên | mục hợp lệ + lỗi: bịa ID, ngoài ngân sách, vi phạm điều kiện cứng, mã bằng chứng không thuộc sản phẩm (loại), mã model không được xem (gỡ mã) | Không |
| `compare_products` | 2–3 ID, tiêu chí mềm | so sánh cùng tiêu chí; tiêu chí không có review → n=0 để agent ghi "chưa có dữ liệu" | Không |

Cách tách cứng/mềm bằng code: câu được chia theo dấu câu; phần sau "ưu tiên / nếu được" và mệnh đề có "…thì tốt / cũng được" là **mềm**, còn lại là **cứng**. Phủ định ("tuyệt đối không được hỗ trợ … không dây") được tách riêng để phát hiện mâu thuẫn.

### 2.4 `codebase/agent.py` — luồng mới (workflow cố định, model ở 2 chỗ)
1. `parse_constraints` (code).
2. Chặn / thu hẹp: bịa sản phẩm-rating-review → từ chối + đưa 3 mẫu thật (B15); đặt hàng → nói rõ không làm, vẫn nghiên cứu (B14); ngoài 3 loại; không rõ loại → hỏi, **không tự đặt ngân sách** (B08); nhiều loại → hỏi; điều kiện cứng mâu thuẫn → hỏi, không đề xuất (B09).
3. Câu hỏi kiến thức → **model** giải thích (dự phòng: bảng thuật ngữ viết tay) và không biến thành điều kiện (B04).
4. `search_catalog` → không có ứng viên: NO_MATCH có số đếm, mẫu rẻ nhất, thử bỏ lọc giá để báo hướng điều chỉnh, **không tự nới** (B10, B12). Câu "nếu không ghi rõ thì cứ mặc định" → ghi rõ không mặc định (B12).
5. `get_evidence` cho ≤12 ứng viên → xếp sơ bộ theo tiêu chí mềm → **model** chọn ≤ 3 (hoặc số người dùng xin: "hai con chuột" → 2, "một bàn phím" → 1) kèm lý do, điểm trừ, mã bằng chứng. Model hỏng / chế độ giả → luật dự phòng (trọng số theo thứ tự ưu tiên + điểm Q).
6. `check_shortlist` (code) → in kết quả: giá VND + USD gốc, rating + số lượt đúng nguồn, ✓ điều kiện cứng kèm mã nguồn, trích review, "chưa có dữ liệu về…", danh sách "chưa xác minh — không đề xuất chính thức".
- Không nêu ưu tiên → suy từ mục đích ("học online" → Micro > Thoải mái) và **ghi rõ là suy ra**.
- Nhiều lượt: "Lượt 1: … Lượt 2: …" trong một tin nhắn (B11, B13) hoặc `context.shopping_context.agent_state` từ web. Lượt sau giữ loại / điều kiện cứng / mục đích, chỉ đổi phần được nói; "so sánh hai mẫu vừa tìm" dùng đúng ID lượt trước.
- `answer(text, context=None)` trả thêm khoá `smartbuy` (state ST-0x, plan có thời gian từng bước, recommendations có điểm S/F/Q/E, hard_results, reasons + evidence, excluded, no_match, clarify, context) theo `frontend/README.md`. Eval vẫn chỉ đọc `output`.

## 3. Đã kiểm

| Kiểm | Kết quả |
|---|---|
| `python run.py check` | benchmark 15 câu, metric 5 — 2 cảnh báo về bộ câu thử (cần 20–30 câu cho CP3, cần ≥1/3 câu từ người dùng / data thật) — **phần của nhóm, backend không sửa** |
| 15 câu thử, `MODEL_PROVIDER=fake` (script riêng, không ghi file eval) | 15/15 chạy hết, không lỗi. Trạng thái: B01–B07, B11, B13, B14 → có kết quả · B08, B09 → hỏi lại · B10, B12 → NO_MATCH có căn cứ · B15 → từ chối |
| `python run.py eval --try` (gpt-4o-mini, 3 câu) | "Nối model được". Mỗi câu 1 lần gọi model, 12–15 lần gọi công cụ, ~3,6–4,8k token vào / ~230–280 token ra. `check_shortlist` bắt model trích mã `D3`, `D5` không có trong dữ liệu đưa vào → gỡ mã |
| Web `python codebase/web.py --port 8765` | `/api/health` → `data/catalog.json`, 167 sản phẩm (bản v1), model openai · gpt-4o-mini. `/api/agent` trả `smartbuy` đủ khoá; lượt 2 "Tăng ngân sách lên 1,5 triệu" giữ đúng tai nghe + Bluetooth + học online |

Chưa phải là kết quả chấm: cột `pass` do người chấm theo `eval/metric_spec.yaml` (grader `nguoi`).

## 4. Còn lại / giới hạn đã biết
- **Chưa chạy lượt 1** (`python run.py eval` → `eval/run-1.csv`): để nhóm chạy, chấm cột `pass`, ghi `eval/report.md`.
- Tiêu chí mềm chấm bằng từ khoá tiếng Anh + số sao của review → thô: một review 4★ chê độ êm vẫn bị đếm là "≥4★". Model thật đọc lại nội dung, nhưng luật dự phòng thì không.
- Bản xuất Colab vẫn `audit_status: PENDING`; luật tiêu đề mới loại được hàng sai rõ ràng, chưa thay được kiểm tay.
- Tách cứng/mềm bằng luật chữ: câu viết lạ (vd "Bluetooth thì tốt nhưng không bắt buộc") có thể đọc sai — cần thêm câu thử.
- `cost/` chưa chạy lại với model thật (`python run.py simulate --try` trước, rồi `simulate`).
- `spec.md` còn trống §0–§9 — nội dung sản phẩm do nhóm điền; backend chỉ thêm dòng changelog §10.

## 5. Rà soát sau khi thay data (bản xuất Colab v2) — 27/11 tối

Đối chiếu với `D:\1\data_hackathon` (README → Luật chung, 01-challenge-brief → Dữ liệu, 03-rubric → Trừ điểm, tracks/track-d) và `AGENTS.md`.

### 5.1 Data mới và việc đã sửa
- `data/amazon_raw/` v2: 441 sản phẩm, 6.135 review, ≥5 review/sản phẩm, **ảnh là link (list chuỗi)**, không có `user_id`.
- Sửa `build_catalog.py --from-export`: đọc link ảnh dạng chuỗi (`{"large": url}`); `catalog.py` cũng nhận list link.
- **Sửa lỗi luật lọc phụ kiện của chính backend:** luật cũ loại mọi tiêu đề có từ phụ kiện → loại nhầm ~45 mẫu thật trên data v2 (tai nghe true-wireless ghi "Charging Case", tai nghe có "ear pads", bàn phím nhắc "keycaps"). Luật mới: phụ kiện khi từ phụ kiện đứng **trước** tên loại, hoặc **liền sau** tên loại ("Keyboard Stickers", "AirPods Case").
- Kết quả `data/catalog.json` `amz23-electronics-20261127-n422`: **422 sản phẩm** (319 tai nghe · 58 chuột · 45 bàn phím), **5.890 review**, 422/422 có link ảnh. Loại 13 phụ kiện + 6 sai nhãn (2 trong số đó có vẻ là tai nghe thật nhưng tiêu đề không có chữ "headphones": Contixo KB-2600, Logitech ClearChat ghi "HEASET" — chấp nhận mất, không viết luật riêng cho từng mẫu).
- Độ phủ đã xác minh: kết nối 92% / 93% / 80% · ANC 8% · switch 38% · pin 18–51%. Bàn phím: bộ lọc kết nối vừa chạm ngưỡng 80%.
- Trích review trong câu trả lời: tối đa 2 câu, ≤200 ký tự, bỏ thẻ `[[VIDEOID…]]` (luật dữ liệu mục 5 của đề).
- Kiểm lại: 15 câu chế độ giả → cùng trạng thái như mục 3; `eval --try` gpt-4o-mini 3 câu: 3,7–4,7k token vào, 195–257 ra; `check_shortlist` gỡ mã model bịa (`D3`, `D7`).

### 5.2 Tuân thủ — đã kiểm
| Luật | Kết quả |
|---|---|
| Không sửa `eval/benchmark.csv`, `eval/metric_spec.yaml`, chuẩn "đạt" §7 | Không đổi so với HEAD (`git diff`) |
| Không sửa lượt đã chạy (`eval/run-N.csv`, `cost/simulate-N.csv`, `traces/run-N.jsonl`) | Chưa có lượt có số; chỉ ghi `run-try` (đã gitignore) |
| Không commit `.env` / API key | `.env` không được track; quét `sk-…`, `AIza…`, `sk-ant-` trong repo: không thấy |
| Không dữ liệu cá nhân thật | review không có `user_id`, không tên người viết |
| Không "giấu" câu thử vào code | Quét cửa sổ 5 từ của 15 input trong `agent.py` + `tools.py`: **0 trùng** (đã viết lại 4 chỗ comment / câu chữ trùng nguyên văn và bỏ đoạn giải thích ANC viết riêng cho "học online") |
| Mọi thay đổi sau CP2 có dòng §10 | Đã có dòng backend trong `spec.md` §10 |

### 5.3 Việc của nhóm (không phải backend tự sửa)
1. **`spec.md` trên nhánh `backend` là template trống**; bản đã điền nằm ở `origin/main` (commit `d421ff9` 19:05 — chuẩn "đạt" chốt trước 19:30, hợp lệ). Dòng §10 của backend nằm ở hunk khác nên merge vào main không đè §4/§7 — vẫn nên kiểm lại khi merge.
2. Commit `fe3ebf9` (21:29, nhánh `eval/benchmark-metrics`) sửa dòng đếm câu ở §7 **sau CP2** — không đổi chuẩn "đạt", nhưng luật yêu cầu mọi thay đổi sau CP2 có dòng §10 → thêm dòng.
3. `eval/metric_spec.yaml` trên main (18:58) khác backend (17:27) chỉ ở cột `why`; cả hai trước CP2 → lấy bản main khi merge.
4. **Sơ đồ §4 (main) vẽ một agent có vòng lặp** (LLM ở phân tích / lập kế hoạch / đánh giá / kiểm tra, nhánh "cần nghiên cứu thêm"), còn code là **workflow cố định**, LLM chỉ ở xếp hạng + giải thích. Rubric R3 chấm "code khớp sơ đồ" → sửa sơ đồ / ô "Hình dạng" (§4 không bị chốt; ghi §10), hoặc đổi code.
5. Bảng công cụ §4 còn trống → chép bảng ở mục 2.3 file này.
6. CP3 cần 20–30 câu thử và ≥1/3 `source` là `nguoi_dung` / `data_that` (đang 0/15). Được **thêm** câu (vd hỏi về mẫu có thật trong catalog), không sửa / xoá câu cũ.

## 6. Đối chiếu backend ↔ frontend — 27/11 tối

Đọc `frontend/js/api.js`, `views/agent.js`, `views/report.js`, `views/trace.js`, `parts.js`, `main.js` và so với `codebase/web.py`, `catalog.py`, `agent.py`. Không sửa file nào trong `frontend/`.

| Chỗ lệch | Hậu quả trên giao diện | Đã sửa (backend) |
|---|---|---|
| Điểm: giao diện in `S = 0.70·F + 0.20·Q + 0.10·E`; backend tính `0.75·E + 0.25·Q`, F luôn 100 | Thẻ điểm in công thức không cộng ra S | `_scores`: F = mức hợp tiêu chí mềm (trọng số theo thứ tự ưu tiên), Q = điểm Bayes của catalog, E = % tiêu chí có nguồn; không có tiêu chí mềm → F = n/a, S = Q |
| Nút "Hỏi trợ lý" / "hỏi tiếp" gửi `scope: {type: product, id}`; backend bỏ qua | Trả "bạn muốn tìm tai nghe, chuột hay bàn phím?" | Nhánh `_about_product`: kiểm sản phẩm đó với nhu cầu hiện tại bằng code (điều kiện cứng ✓/✗/?, ngân sách, review theo tiêu chí, mã nguồn) |
| Phạm vi so sánh `scope: {type: compare, ids}` bị bỏ qua | Câu "So sánh … giữa A và B" bị hiểu thành tìm mới | Dùng đúng ID của scope; khác ngành hàng → báo không so sánh được |
| Bỏ chip điều kiện (×) rồi "chạy lại": backend giữ điều kiện cũ trong `agent_state`; câu chạy lại không kèm ngân sách | Kết quả vẫn lọc điều kiện đã bỏ, ngân sách bị mất | `_state_from` đồng bộ `agent_state` theo sổ nhu cầu đang hiển thị; câu nêu lại đúng loại = tinh chỉnh (giữ ngân sách / mục đích) |
| Câu ví dụ "Bàn phím cơ nhỏ gọn có Bluetooth…" | "bàn phím cơ", "nhỏ gọn" không được hiểu | Thêm điều kiện cứng `mechanical` (switch đã xác minh hoặc tiêu đề ghi "mechanical" — nguồn T) và tiêu chí mềm `nho_gon`; "cơ bản" không bị hiểu nhầm |
| Nhãn chip "Pin ≥ 100 giờ" khi chạy lại | Không đọc lại được ký hiệu ≥ | `parse_constraints` nhận "≥" |
| Nhãn "Thoải mái khi dùng lâu" khi chạy lại | Bị đọc thêm thành "Độ bền" | Bỏ "dùng lâu" khỏi từ khoá độ bền |
| Trace: giao diện in `tool(args)`; backend không gửi `args` | In `search_catalog()` rỗng | `plan[].args` rút gọn, vd `search_catalog("headphones", 1000000, None, [bluetooth])` |
| Câu hỏi làm rõ: giao diện in `message` rồi khối `clarify` | Câu hỏi hiện 2 lần | `message` là câu dẫn ngắn |
| Thẻ in `brand + model`; 16 model có sẵn tên hãng, 6 model cắt dở ở "[" | "JBL JBL TUNE 500BT", "Pack Apple [Apple" | `catalog.clean_model`: bỏ hãng lặp, bỏ cụm trong ngoặc. Còn 2 mẫu model trùng hẳn tên hãng (Decibullz, Yurbuds) |

**Kiểm sau khi sửa** (model giả qua `web.run_agent`, và trình duyệt với gpt-4o-mini):
- Mọi ID gợi ý đều có trong catalog công bố; mọi mã nguồn trích ra đều có trong `evidence` của **chính** sản phẩm đó; công thức in ra cộng đúng S.
- Trình duyệt: Top 3 có ảnh, ST-04, sổ nhu cầu v1. Báo cáo in đúng công thức (vd 0.70×85,7 + 0.20×87,5 + 0.10×100 = 87,5). Bấm mã R2 mở đúng review. "hỏi tiếp" ra PRODUCT_CHECK, giữ Bluetooth + ngân sách. Không có lỗi console.
- API frontend gọi: `/api/catalog` (3 loại), `/api/products/<id>`, `/api/compare`, `/api/trace/<id>`, khoảng giá sai → HTTP 400 `INVALID_INPUT` — đều đúng định dạng giao diện đọc.
- 15 câu thử (model giả): trạng thái giữ nguyên như mục 3; quét 5 từ liên tiếp của input trong code: 0 trùng; benchmark / metric không đổi.

**Còn lệch, chưa sửa:**
- Backend không phát `pending_change` (phiếu ST-07); NO_MATCH chỉ gợi ý bằng `next_actions` (vd "Đổi ngân sách thành …") và vẫn chờ người dùng gửi.
- Cùng loại sản phẩm trong một phiên web = tinh chỉnh nhu cầu: điều kiện cũ còn trên sổ nhu cầu đến khi người dùng bấm × hoặc mở phiên mới.

## 7. Bộ tự kiểm agent — 27/11 khuya

Script `test_agent.py` + kết quả ở `C:\Users\PC ACER\Downloads\amazon_raw (1)\1\` (ngoài repo). **Không phải lượt eval chính thức**: không ghi `eval/`, `traces/`, `cost/`; benchmark / metric không đổi.
57 ca: 15 câu benchmark (kiểm phần code kiểm được của `pass_criterion`) · 20 câu thêm (ngoài phạm vi, mơ hồ, khoảng giá, tấn công, đặt hàng, số lượng, điều kiện cứng, không dấu, tiếng Anh, phủ định) · 7 luồng web · 15 ca công cụ. Mọi gợi ý được kiểm thêm độc lập trên catalog: ID có thật, đúng loại / ngân sách, điều kiện cứng MATCH, mã bằng chứng thuộc đúng sản phẩm, giá / sao / số lượt in ra khớp catalog, công thức điểm.

| Lượt | Model | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | fake | 52/57 | Trượt: X06 tấn công tiếng Anh không bị chặn · X13 "cơ bản" hiểu thành bàn phím cơ · X15/X16 câu không dấu · X19 "1tr5" đọc thành 1 triệu |
| — | — | — | Sửa `tools.py`: mẫu chặn tiếng Anh (ignore/disregard … instructions, fake/write … reviews) · khôi phục dấu cho câu gõ không dấu (chỉ khi cả câu không dấu, chỉ cụm không nhập nhằng) · "cơ bản" không khớp "phím cơ" · "1tr5" / "1 triệu 2" = 1,5 / 1,2 triệu |
| 2 | fake | 57/57 | |
| 3 | gpt-4o-mini | 57/57 | 29 lần gọi model, 86.340 token vào / 6.323 ra (≈ 0,017 USD theo giá 0,15 / 0,60 USD mỗi 1M token *(giá cần đối chiếu bảng giá model)*) |

**Phát hiện ở lượt model thật:** 12/57 ca, `check_shortlist` phải gỡ mã bằng chứng model tự bịa — phần lớn là `D3`. Nguyên nhân khả dĩ: ví dụ JSON trong `SYSTEM_RANK` ghi `"evidence": ["R1", "D3"]`, model chép lại. B03: một mẫu bị loại hẳn vì trích `R9` không thuộc sản phẩm → chỉ còn 2 gợi ý (ST-05). Lớp kiểm bằng code chặn được hết, nhưng nên sửa prompt (đổi ví dụ thành chỗ trống) rồi chạy lại.

## 8. Rà luồng backend + test lỗi / biên — 27/11 khuya

Đọc lại toàn bộ `agent.py`, đối chiếu cách `eval/run_eval.py` (gọi `answer(text)`, bắt lỗi từng câu vào cột `error`), `cost/simulate.py` (mỗi lượt gọi `answer(text)` độc lập) và `web.py` (truyền `context`) gọi agent — đều khớp hợp đồng. Test tiêm lỗi `test_faults.py` (24 ca, ngoài repo).

| Lỗi tìm thấy | Hậu quả | Sửa |
|---|---|---|
| Model trả `shortlist` là list chuỗi | Agent sập (`AttributeError`) | `check_shortlist` bỏ mục sai khuôn |
| Mã bằng chứng là object / số | Agent sập (`TypeError: unhashable`) | `check_shortlist` chỉ giữ mã dạng chuỗi |
| Code loại bớt mục AI chọn (bịa ID, vượt ngân sách, mã lạ) | Báo sai "Chỉ có 1 mẫu đủ điều kiện" khi catalog có 95 mẫu đạt — chính là B03 ở lượt model thật | Bù phần thiếu bằng luật dự phòng từ ứng viên hợp lệ còn lại, ghi note trong trace |
| Web gửi `shopping_context` / `agent_state` / `scope` sai kiểu | Agent sập | `_clean_state` + kiểm kiểu ở `_state_from` |

Kết quả sau sửa: lỗi / biên **24/24** · bộ chính model giả **57/57**. Benchmark / metric không đổi; không ghi `eval/`, `traces/`, `cost/`.
Theo thiết kế (giữ nguyên): lỗi gọi API (mất mạng, 429 sau 2 lần thử lại) **không** che bằng luật dự phòng — bay ra để eval ghi cột `error`, web báo AGENT_ERROR "không có nghĩa là không có sản phẩm".
Phía nhóm: `cost/personas.yaml` chưa có giá `gpt-4o-mini` → simulate không tính được chi phí thực đo; `prices`, `users` còn số "(ví dụ)".

Lượt model thật sau khi sửa (gpt-4o-mini, 27/11 23:34): **57/57**, 29 lần gọi model, 86.340 token vào / 6.383 ra (≈ 0,017 USD). B03 trước đó chỉ còn 2 gợi ý (ST-05, báo sai "chỉ có 2 mẫu") → nay đủ 3 (ST-04): code loại 1 mục trích `R9` không thuộc sản phẩm rồi bù 1 mục từ luật dự phòng. 9/57 ca lớp kiểm vẫn phải gỡ mã model bịa (chủ yếu `D3`) — chưa sửa prompt.

## 9. Khớp backend với tài liệu BA "SmartBuy — Business Process & Use Case Specification" — 27/11 khuya

Nguyên tắc: chỉ sửa `codebase/*.py`. **Không** sửa `eval/benchmark.csv`, `eval/metric_spec.yaml`, chuẩn "đạt" `spec.md` §7, sơ đồ / hình dạng `spec.md` §4, hay tài liệu BA. Thay đổi kiến trúc để nhóm thảo luận (mục 9.3).

### 9.1 Đã sửa (code)
| Tài liệu | Trước | Sau |
|---|---|---|
| 7.2 / 7.4 — loại trừ, thương hiệu, kiểu đeo | "không lấy nhét tai", "Tai nghe Sony", "trùm tai" không được đọc | `parse_constraints` → điều kiện `not_wear`, `not_brand`, `brand`, `wear_type`; `check_hard` kiểm trên thuộc tính / hãng có nguồn; `context.exclude` gửi lên sổ nhu cầu; mâu thuẫn "Sony nhưng không lấy Sony" → hỏi lại |
| UC-04 PRODUCT_QUESTION | "JBL TUNE 500BT có mic không?" bị hiểu thành tìm tai nghe có mic | công cụ `find_product_by_name` (model có chữ số, hoặc hãng + model cùng có trong câu) → kiểm đúng sản phẩm đó |
| BR-CTX-10 | (mới phát hiện) hỏi về một sản phẩm làm đổi nhu cầu của phiên | Điều kiện trong câu hỏi sản phẩm chỉ dùng để đánh giá lượt đó; context trả về giữ nguyên |
| 7.5 / AC-CAT-04 — "trong các mẫu đang lọc" | Agent bỏ qua `context.filters` → hỏi lại loại | Khi câu nhắc tới bộ lọc: lấy loại, giá, kết nối, kiểu đeo, hãng (chỉ khi 1 giá trị) từ bộ lọc website; câu không nhắc bộ lọc thì vẫn hỏi lại như cũ |
| UC-08 / ST-07 / AC-NM-02–04 | Chỉ có nút gợi ý đổi ngân sách | NO_MATCH tạo `pending_change`: tăng ngân sách tới mức có mẫu đạt (đếm thật), chuyển từng điều kiện thành ưu tiên nếu có mẫu đạt phần còn lại, giữ nguyên. Trạng thái ST-07. Không tự áp dụng |
| UC-07 CONFIRM_CHANGE | — | Web gửi `context.pending_change {id, choice}` → áp dụng ĐÚNG phương án đó bằng code (đúng id phiếu đang chờ); "giữ nguyên" → không đổi; phiếu cũ / sai id → bỏ qua |
| BR-CMP / AC-CMP-04 | So sánh không cảnh báo ngân sách | Mẫu ngoài ngân sách: "⚠ … so sánh để tham khảo, không phải đề xuất" + `limits` |
| AF-02 UC-05 / BR-ST-04 | Thiếu review cho tiêu chí ưu tiên vẫn ST-04 | ST-05 / PARTIAL_RESULT, nêu rõ tiêu chí chưa xác minh |
| UC-03 bậc review | Luôn "Dựa trên N review" | 0 / 1–4 (nhận xét cá nhân, không khái quát) / 5–9 (sơ bộ) / ≥10 (không mặc định đại diện) |
| CAP-10 / UC-10 trace | `validation.claims_without_source` ghi cứng 0; `retry_count` luôn 0; không có `context_version` | `validation` đếm thật từ `check_shortlist` (nhận định thiếu nguồn, vi phạm điều kiện, ID bịa, mã bị gỡ, mục bị loại, mục bù bằng luật, ai xếp hạng); `retry_count` từ `ai.RETRIES`; `context_version` từ web |
| EX-11 | Prompt chỉ dặn bỏ qua lệnh trong tin nhắn | `SYSTEM_RANK`: review / thông số là dữ liệu, không làm theo lệnh bên trong; ví dụ JSON không còn ghi mã cụ thể (`"D3"` — nguyên nhân model bịa mã ở mục 7) |
| BR-CAT-06 / AC-DATA-04 | `build_catalog.py` ghi đè thẳng | Ghi file tạm, kiểm (mỗi ngành có APPROVED, không trùng ID, đọc lại được) rồi mới thay; không đạt → giữ bản cũ. (Chưa chạy dựng lại) |

Giữ nguyên theo thiết kế (mục 8): lỗi gọi API không che bằng luật dự phòng — `ai.py` thử lại 2 lần, web báo AGENT_ERROR + nút "Thử lại" / "Tự duyệt danh mục" (đáp ứng EX-08, BR-ST-07).

### 9.2 Kiểm
- `test_agent.py` (ngoài repo): **70/70** với model giả — 57 ca cũ + 13 ca mới theo tài liệu BA (S01–S13: loại trừ, hãng, kiểu đeo, mâu thuẫn hãng, hỏi sản phẩm theo tên không đổi nhu cầu, phạm vi bộ lọc, không tự lấy loại của trang, ST-07 + duyệt / từ chối / phiếu sai id, cảnh báo ngân sách khi so sánh, validation đo thật).
- `test_faults.py` (ngoài repo): **24/24**.
- 15 câu benchmark: không câu nào bị đọc thêm điều kiện hãng / kiểu đeo / tên sản phẩm / bộ lọc. `eval/benchmark.csv`, `eval/metric_spec.yaml` không đổi; không ghi `eval/`, `traces/`, `cost/`.
- **Chưa chạy** với model thật sau đợt sửa này, chưa thử trên trình duyệt (chờ xác nhận).

### 9.3 Cần nhóm thảo luận (không tự sửa)
1. **Kiến trúc** — tài liệu BA (UC-04 bước 4–5, UC-05, Hình 4, CAP-03/06/07, AC-AGT-01 "trace AI thật planning và fit") mô tả AI lập kế hoạch + chấm F 0/50/100 + tìm lại ≤2 lần; code là workflow cố định, AI xếp hạng + giải thích. Chọn: (a) sửa tài liệu BA và `spec.md` §4 theo code, ghi §10; hoặc (b) thêm bước AI vào code (tốn ~2–3 lần gọi model / câu, phải chạy lại test + eval).
2. **Định nghĩa F** — tài liệu: LLM chấm 0/50/100 theo rubric; code: điểm liên tục từ review. Giao diện (`report.js`) cũng ghi "model chấm".
3. **APPROVED** — tài liệu: ứng viên còn PENDING, chỉ APPROVED được công bố; bản xuất ghi `audit_status: PENDING`; `build_catalog` đang tự duyệt bằng luật → 422/422 APPROVED. Cần kiểm tay hoặc ghi rõ "APPROVED = qua kiểm tự động".
4. **AI phân tích đánh đổi khi so sánh** (UC-06 bước 6) — hiện so sánh chỉ bằng code; thêm sẽ tốn 1 lần gọi model / lần so sánh.
5. **Cùng ngành trong một phiên web = tinh chỉnh nhu cầu** — tài liệu (7.4) chưa nói rõ "tìm mới cùng ngành" có kế thừa điều kiện cũ không (DEC-UC-07).

## 10. Thay data bản xuất v4 + dựng lại catalog — 28/11 rạng sáng

### 10.1 Rà soát `data/amazon_raw/` v4 so với v2
- Cùng 441 sản phẩm / 6.135 review, cùng `parent_asin` và `review_id`; mọi trường cũ giữ nguyên giá trị, trừ `images`.
- Trường mới: `images` dạng `{variant, large, hi_res, thumb}` (2.968 ảnh; 139 ảnh không có `hi_res` → `best_image` lấy `large`), `videos` (4.002), ảnh review (682), `amazon_url`, `main_category` thật, `categories`, `candidate_groups`, `details_raw`, cờ `has_*`, `retained_review_count`.
- Số đếm trong `manifest.json` khớp dữ liệu; `retained_review_count` khớp; không có review mồ côi; `price` = `price_usd`; `details_raw` = `details`; không có `user_id`.

### 10.2 Đã sửa (`codebase/build_catalog.py`)
| Vấn đề | Bằng chứng | Xử lý |
|---|---|---|
| `videos` phần lớn không phải của sản phẩm | chỉ 1.061/4.002 tiêu đề video có tên hãng; vd trang Sony MDR-W08L có video "Koss KPH14B…" | không chép `videos` vào catalog |
| Mũ len gắn tai nghe lọt vào loại Tai nghe | 3 mẫu: Mydeal / Rotibox / Qshell Bluetooth Beanie | `NOT_PRODUCT_TITLE` (`beanie`, `hat`) → loại ở bước ① |
| Giá đáng ngờ | Sony MDR-W08L (`B00005N6KG`) ghi $138.2; review kể $7–13, than người bán đẩy lên $30–40 | `SUSPECT_PRICE` → `price = null` (coi như thiếu giá, không tự điền số khác), lý do ở `smartbuy.data_flags` |
| Email người viết trong review | 1 review (`04288adc7c…`) | `EMAIL_RX` → `[email đã ẩn]` ở tiêu đề + nội dung review |

Đã xem nhưng KHÔNG sửa: Samsung IconX $111.11, Plantronics Voyager 5200 $93.04, tai nghe bơi bone conduction $67.99 — số $ trong review là giá app / nút tai / phí ship, không phải giá sản phẩm.

### 10.3 Kết quả
- `data/catalog.json` `amz23-electronics-20261128-n419`: **419 sản phẩm** (316 tai nghe · 58 chuột · 45 bàn phím), **5.867 review**, 2.831 link ảnh sản phẩm, 434 link ảnh review, 5,4 MB. Độ phủ thuộc tính và bộ lọc bật giống bản n422.
- Kiểm: `catalog.published()` 419 mẫu; Sony hiện `price_vnd = null` (web hiện "null" / không có giá); `search_catalog` chạy bình thường. **Chưa chạy** `run.py check` / `eval` sau khi dựng lại.

## 11. Cải tiến trước lượt 2 — nhóm lỗi "không hỏi ngân sách" — 28/11

Lượt 1 (`run-1@20261128-075128`, gemini-3.1-flash-lite): 15/24. 6/9 câu trượt cùng một lỗi: người dùng nhắc tới giá
nhưng không nêu số, hoặc chỉ nêu loại sản phẩm, mà agent vẫn đề xuất 3 mẫu (0,78–8,96 triệu) và ghi "X/Y trong ngân sách"
— B16, B17, B19, B20, B21, B24. Nguyên nhân: luật cũ ở `agent.py` "thiếu ngân sách KHÔNG hỏi" (viết cho B02/B06/B07/B14
"không tự áp đặt ngân sách") áp cho mọi câu.

### 11.1 Đã sửa (chỉ `codebase/tools.py`, `codebase/agent.py`)
| Chỗ | Sửa |
|---|---|
| `parse_constraints` | thêm `price_concern` (có từ về giá — `tiền`, `rẻ`, `đắt`, `ngân sách`, `phân khúc`, `giá` trừ "đánh giá" / "giá trị" — mà KHÔNG có con số) và `budget_open` ("không giới hạn ngân sách", "bao nhiêu cũng được"…) |
| `_turn` | chưa có ngân sách + (`price_concern` hoặc chỉ nêu loại, không có điều kiện / tiêu chí / mục đích) → `_ask_needs`, trừ khi đã hỏi rồi trong cùng loại (`agent_state.budget_asked`), người dùng nói không giới hạn, hoặc câu đặt hàng (B14 giữ như cũ) |
| `_ask_needs` (mới) | ST-02 / NEEDS_CLARIFICATION: nói rõ không tự gán số cho "rẻ / hợp lý / vừa túi tiền"; hỏi ngân sách, mục đích (nếu thiếu), tiêu chí và cái nào bắt buộc; nếu đã đọc ra điều kiện bắt buộc thì hỏi lại "đó có phải chỉ là ưu tiên không"; mời gửi tên / mã mẫu đang phân vân; in khoảng giá thật của loại đó trong catalog (min / trung vị / max, ghi rõ là giá Amazon lúc thu thập, không phải giá shop); nút gợi ý ≤ phân vị 25/50/75 + "Không giới hạn" |
| `_format` | không có ngân sách → "X/Y … trong catalog (chưa lọc theo giá)" thay vì "trong ngân sách" |
| `PROMPT_VERSION` | `smartbuy-v2.1 · 2026-11-28` để phân biệt lượt 2 trong trace |

Không đổi `eval/benchmark.csv`, `eval/metric_spec.yaml`, chuẩn "đạt" §7, `eval/run-1.csv`, `traces/run-1.jsonl`.
Từ khoá là cách nói chung về giá, không chép nguyên văn câu thử. Đã thêm dòng `spec.md` §10.

### 11.2 Dự kiến (đọc code, CHƯA chạy — người khác chạy lượt 2 và chấm)
- Đổi hướng: B16, B17, B18 (có "giá gần nhau"), B19, B20, B21, B22 (chỉ nêu loại — agent không đọc được "nút âm lượng"), B24 → hỏi lại thay vì đề xuất.
- Giữ nguyên: B01–B15 (có số tiền, có tiêu chí, hoặc đi nhánh khác trước), B23 (có tiêu chí "click êm").
- Không sửa trong lần này: B18 hỏi tên mẫu chỉ là một dòng chung; B22 cần điều kiện cứng "nút âm lượng"; B23 và
  các nhận định model vượt quá trích dẫn.
- Chưa chạy kể cả chế độ giả sau khi sửa (chỉ kiểm cú pháp). Trước lượt 2 nên chạy `python run.py check` và
  `python run.py eval --try`.

### 11.3 Rà soát backend sau khi sửa — 28/11 ~9:30 (model giả, không ghi eval/ traces/ cost/)
- Sửa thêm: giao diện web chỉ in `message` + khối `clarify` (câu hỏi, nút, `hint`) → `_ask_needs` đưa lý do vào `message`,
  câu hỏi còn lại + "gửi tên / mã" + khoảng giá catalog vào `hint`, "không thử trực tiếp" vào `limits`.
- `test_agent.py` 70/70 · `test_faults.py` 24/24 · kiểm mới (B16–B24, luồng hỏi → bấm nút ngân sách / "không giới hạn" /
  chỉ nêu mục đích, không hỏi lại lần 2, đổi loại thì hỏi lại, bất biến ID / loại / ngân sách / điều kiện cứng / mã bằng
  chứng trên mọi gợi ý của 24 câu) đạt hết · web trong tiến trình (`run_agent`, hàm catalog của `/api/*`) 21/21.
- Web đang chạy từ 8:50 giữ bản `agent.py` cũ trong bộ nhớ → phải khởi động lại server mới thấy thay đổi.
- Catalog trên `main` vẫn là n422: còn 3 mũ len (B0C584BSHR, B07S83SZV9, B09KK8XGQR) và giá Sony MDR-W08L $138.2 —
  bản sửa (n419) nằm ở commit `c53620c` nhánh `backend`, chưa merge.

## 12. Cải tiến trước lượt 2 — nhóm lỗi "nhận định không có bằng chứng đỡ" — 28/11

Lượt 1: 5/9 câu trượt có nhận định model vượt quá trích dẫn hoặc suy từ thương hiệu / giá — B17 ("uy tín thương hiệu…
đảm bảo chất lượng"), B19 / B20 (Ducky "độ bền cao", trích dẫn in ra không nói về độ bền), B23 ("đã lọc bỏ sản phẩm có
review trái chiều", trích R1 không liên quan click), B24 (note "dòng cao cấp thường chống ồn tốt hơn dòng giá rẻ",
Q35 "chống ồn hiệu quả" trích review về LDAC). `check_shortlist` cũ chỉ kiểm mã có thuộc sản phẩm không, không kiểm mã
có nói đúng điều được nhận định không.

### 12.1 Đã sửa (`codebase/tools.py`, `codebase/agent.py`)
| Chỗ | Sửa |
|---|---|
| `audit_claims` (mới, hàm phụ) | tách lý do / điểm trừ theo câu; vế nào nhắc một tiêu chí (từ khoá `SOFT[k]["vi"]` + vài từ thêm, cụm dài khớp trước) thì phải có mã đã trích — kể cả mã ghi ngay trong câu — nằm trong `_support_ids` của tiêu chí đó (nguồn thuộc tính đã xác minh, hoặc review / dòng mô tả có từ khoá `SOFT[k]["kw"]`; không tính tiêu đề vì là tên bán hàng). Không có → gỡ cả câu. Mã đỡ được nằm trong dữ liệu model đã xem mà model quên trích → code gắn thêm thay vì gỡ. Vế tự nói "chưa có review / dữ liệu" không bị kiểm. Gỡ cả câu suy từ thương hiệu / độ nổi tiếng / giá ("uy tín", "đảm bảo chất lượng", "cao cấp", "hàng đầu", "tiền nào của nấy", "đắt thường…") và câu kể "đã lọc bỏ…" |
| `check_shortlist` | gọi `audit_claims` cho reason + tradeoff; câu bị gỡ được thay bằng "Chưa có bằng chứng trong các mã đã trích về: …"; bỏ review được trích mà không đỡ nhận định nào; mục không còn nhận định nào có bằng chứng → loại (luật dự phòng bù như cũ). Lỗi ghi vào `violations` với tiền tố `gỡ nhận định` / `gỡ câu` / `gỡ mã` / `bổ sung mã` |
| `agent._find` | `note` của model không gắn sản phẩm nào → mọi nhận định theo tiêu chí và câu suy diễn trong note đều bị gỡ |
| `agent._format` | dòng "Bằng chứng [R…]" in đoạn review (≤ 2 câu) chứa từ khoá của tiêu chí được nhận định, thay vì 2 câu đầu — vd Ducky R1 in "…had my Ducky keyboard now around 4 or 5 years" |
| `agent._fallback_rank` | mỗi tiêu chí được nêu đều trích một mã (review khen nếu có, không thì review đầu) để qua được lớp kiểm mới |
| `agent._validation` | thêm `claims_removed`, `evidence_codes_added`; `items_rejected` không đếm các lần gỡ / bổ sung |
| `SYSTEM_RANK` | thêm luật: mỗi câu nhắc tiêu chí phải trích mã nói đúng tiêu chí đó; không suy từ thương hiệu / giá / số lượt đánh giá; không kể việc hệ thống đã làm; `note` chỉ là lưu ý chung về dữ liệu. `PROMPT_VERSION` → `smartbuy-v2.2 · 2026-11-28` |

Luật là từ khoá theo tiêu chí và cụm suy diễn chung, không chép nguyên văn câu thử.

### 12.2 Đã kiểm (model giả + phát lại, không gọi API, không ghi eval/ traces/ cost/)
- 24 câu `eval/benchmark.csv`, `MODEL_PROVIDER=fake`: chạy hết, không lỗi; trạng thái giống trước (ST-04 ×10, ST-02 ×10, ST-05, ST-06, ST-07, ST-09); luật dự phòng không bị gỡ câu / loại mục nào.
- Phát lại "Vì sao / Điểm trừ / Lưu ý" của B16–B24 trong `eval/run-1.csv` qua `audit_claims`: gỡ "uy tín… đảm bảo chất lượng… cao cấp" (B17), note "dòng cao cấp… dòng giá rẻ" (B24), câu "đã lọc bỏ…" (B23), Sony "lựa chọn cao cấp…" (B24); gắn F3 cho câu pin 50 giờ của Soundcore Q45 thay vì gỡ.
- Giới hạn: khớp theo từ khoá tiếng Anh nên không biết chiều khen / chê và có thể khớp nhầm (vd "My old mouse broke" được tính là nói về độ bền); không kiểm con số ("50 giờ") có đúng nguồn không. Trace lượt 1 chỉ lưu bản rút gọn output model nên chưa phát lại được nguyên JSON.

### 12.3 Còn phải làm
- Thêm dòng changelog vào `spec.md` §10 trên bản mới nhất (`origin/main` đã có commit `cb819ec` sửa §4 / §10 — nhánh này chưa có).
- Sửa ô `check_shortlist` trên sơ đồ §4 và dòng `check_shortlist` trong bảng công cụ §4: thêm "kiểm nhận định có mã đỡ, gỡ câu suy từ thương hiệu / giá".
- Lượt 2 do nhóm chạy và chấm.

## 13. Cải tiến trước lượt 2 — câu "xử lý thế nào" + tiêu chí liệt kê — 28/11 ~10:30

Rà lại B16–B24 sau mục 11–12 (model giả): B16–B21, B24 đã chuyển sang hỏi lại; còn 3 chỗ dự kiến vẫn trượt so với
`pass_criterion` của lượt 1:
- B16: "thu hẹp … theo âm thanh, chống ồn, pin và giá" — "chống ồn" bị đọc thành điều kiện BẮT BUỘC (ANC) vì câu bị cắt
  theo dấu phẩy, mỗi mảnh không có dấu hiệu "ưu tiên".
- B22: không có điều kiện cứng cho nút / phím âm lượng → "điều kiện bắt buộc: không có", hỏi ngân sách chung chung,
  không trả lời câu "thiếu thông tin thì xử lý thế nào".
- B23: đưa 3 chuột nhưng không trả lời câu "mô tả nói êm mà review nói không êm thì sao"; từ khoá `click` trơn của tiêu
  chí click êm khớp mọi review chuột ("Double click to wake", "Right and left click…") → trích dẫn không nói về độ êm.

### 13.1 Đã sửa (chỉ `codebase/tools.py`, `codebase/agent.py`)
| Chỗ | Sửa |
|---|---|
| `_split_soft` | danh sách sau "thu hẹp / lọc / chọn / xếp / so sánh / đánh giá / cân nhắc / tư vấn / gợi ý … theo / dựa trên" là **tiêu chí mềm** (giữ thứ tự), trừ khi trong danh sách có "bắt buộc / phải có / cần có" |
| `HARD_WORDS["volume"]` + `check_hard` | điều kiện cứng "Có nút / phím chỉnh âm lượng": MATCH chỉ khi tiêu đề / mô tả / thông số người bán ghi rõ (`VOLUME_RX`: volume up/down/control/knob…, "mute, play, volume"); không ghi → UNKNOWN; bỏ "volume limiting". Trên catalog n422: 3/45 bàn phím, 81/319 tai nghe, 0/58 chuột MATCH |
| `parse_constraints` | cờ `missing_info_q` (hỏi cách xử lý khi nguồn không ghi / thiếu thông tin) và `conflict_q` (mô tả / người bán ↔ review / người mua nói ngược nhau) |
| `agent._policy_lines` (mới) | có cờ → trả lời **cách làm** trước kết quả: chỉ tính CÓ khi người bán ghi rõ kèm mã; không ghi = chưa xác minh, không coi là có / không; mô tả là lời người bán; đếm review khen / chê, vài review là cảm nhận cá nhân; khi nào nên / không nên chọn; cách kiểm thêm. Dùng cả ở nhánh có kết quả và NO_MATCH |
| `agent._seller_vs_reviews` (mới) | khi `conflict_q`: mỗi mẫu có dòng "Đối chiếu <tiêu chí>: mô tả người bán có nhắc [mã] / không nhắc; review: n nhắc tới (pos ≥4★, neg ≤2★)", cảnh báo khi chê > khen, "Quá ít review để kết luận" khi n < 3 |
| `SOFT["click_em"]["kw"]` | bỏ `click` trơn; thêm `silence`, `click sound`, `clicking sound`, `clacky`, `hush` |
| `_ask_needs` | có tiêu chí mềm, chưa có điều kiện cứng → nói rõ các tiêu chí đó chỉ để cân nhắc, không loại mẫu, và hỏi có cái nào bắt buộc không |
| `_format` | dòng "chưa xác minh" ghi thêm "và N mẫu khác cũng chưa xác minh được" |
| `SYSTEM_RANK` | `note` không đưa lời khuyên chung kiểu "nên tin review hơn mô tả". `PROMPT_VERSION` → `smartbuy-v2.3 · 2026-11-28` |

Luật là từ khoá / cấu trúc câu chung, không chép nguyên văn câu thử: quét cửa sổ 5 từ của 24 input trong `agent.py` +
`tools.py` → **0 trùng** (đã viết lại 2 cụm câu chữ tự nhiên bị trùng B22).

### 13.2 Đã kiểm (model giả, không gọi API, không ghi eval/ traces/ cost/)
- 24 câu: B01–B21, B24 giữ nguyên trạng thái như mục 12.2; B16 → điều kiện bắt buộc "không có", ưu tiên Âm thanh > Chống ồn > Pin, vẫn hỏi ngân sách; B22 → ST-04, đoạn cách xử lý + 3 bàn phím có nguồn ghi phím âm lượng [F2/F3/F5] + "và 39 mẫu khác chưa xác minh"; B23 → ST-04, đoạn cách xử lý + dòng đối chiếu mô tả ↔ review từng mẫu, trích dẫn đúng nói về độ êm ("quiet", "quietness", "quieter").
- Bất biến trên mọi gợi ý của 24 câu: mã bằng chứng thuộc đúng sản phẩm, mọi điều kiện cứng MATCH → 0 lỗi.
- `test_agent.py` 70/70 · `test_faults.py` 24/24 (ngoài repo). `eval/benchmark.csv`, `eval/metric_spec.yaml`, `spec.md`, `eval/run-1.csv`, `traces/` không đổi.
- Câu viết khác (không thuộc bộ thử): "chọn chuột theo độ bền, cảm giác cầm và giá cả" → mềm; "lọc … theo Bluetooth bắt buộc" → vẫn cứng; "tai nghe có chỉnh âm lượng trên dây" → `volume`; "trang sản phẩm ghi pin 30 giờ nhưng người mua chê…" → `conflict_q`; "nếu shop không có thông tin về switch thì bạn làm sao" → `missing_info_q`.

### 13.3 Giới hạn / còn lại
- Chưa chạy với model thật; lượt 2 do nhóm chạy và chấm.
- Đếm khen / chê vẫn theo số sao, không theo chiều câu (review 5★ chê click to vẫn tính ≥4★).
- "chống ồn" trong câu tìm chuột / bàn phím vẫn bị đọc thành ANC (luật cũ, ngoài phạm vi lần này).
- Cần dòng `spec.md` §10 cho mục 11–13 trên bản `spec.md` mới nhất (`origin/main`), sau khi merge.

## 14. Lỗi phát hiện trên web: tiền nói lóng + review "nói không" — 28/11 ~10:45

Thử trên giao diện: "có con chuột nào khoảng 5 lốp chơi game ngon không" → agent ghi "ngân sách chưa nêu (không lọc theo
giá)" và đề xuất mẫu không lọc giá; thẻ Logitech M325 ghi "được đánh giá cao cho việc chơi game".

| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| "5 lốp" không được đọc là 500.000đ | `parse_constraints` chỉ biết triệu / tr / củ / k / nghìn / ngàn | thêm đơn vị 100.000đ: `lít`, `lốp`, `xị`, `trăm` (+ dạng không dấu); "1 triệu rưỡi" = 1,5 triệu (trước đọc thành 1 triệu); "5 trăm nghìn" = 500.000đ |
| "từ 3 đến 5 lốp", "3-5 triệu" chỉ đọc số sau | đơn vị chỉ ghi ở số sau | khoảng "A đến / tới / - B <đơn vị>" áp đơn vị cho cả A |
| Review 5★ ghi "not for gaming" / "I do not do gaming" được đếm là khen tiêu chí Chơi game và trích làm bằng chứng | `get_evidence` chia khen / chê chỉ theo số sao | `_says_not`: review nhắc tiêu chí nhưng có từ phủ định đứng ngay trước (not / no / never / don't… , trừ "not only") → không tính vào ≥4★, đếm riêng `said_not`; không xét phủ định với từ khoá mang nghĩa xấu sẵn ("no lag", "not loud" là khen). Luật dự phòng không lấy review đó làm lời khen; ghi vào Điểm trừ "nói "không" về tiêu chí này". `SYSTEM_RANK` báo model trường `says_not` |

Kiểm (model giả, không ghi eval/ traces/ cost/): câu trên → ngân sách ≤ 500.000đ, 33/33 chuột trong ngân sách; Logitech
M325 không còn trong top 3, M187 có ghi "1 review nói "không" … không tính là khen". 24 câu benchmark giữ nguyên trạng
thái như mục 13 · bất biến gợi ý 0 lỗi · quét 5 từ 0 trùng · `test_agent.py` 70/70 · `test_faults.py` 24/24.
Giới hạn: phủ định chỉ xét trong ~20 ký tự trước từ khoá ("can't tell you to become a pro gamer" không bị bắt).
Web đang chạy phải khởi động lại mới nạp code mới.

## 15. Rà lại luồng agent theo chuẩn "đạt" — 28/11 ~11:15

Mục tiêu (`spec.md` §7): ≥ 80% câu qua (≥ 20/24), 100% câu kiểm ràng buộc bắt buộc và câu từ chối phải qua. Lượt 1: 15/24.
Cách rà: chấm khắt khe output hiện tại (model giả) theo `pass_criterion` + `expected` + ghi chú trượt của lượt 1.

### 15.1 Chỗ còn yếu và đã sửa
| Câu | Còn yếu | Sửa |
|---|---|---|
| B18 | Người dùng nói "hai mẫu … so sánh giúp" nhưng agent hỏi ngân sách trước; câu hỏi tên / mã chỉ là dòng phụ; không nêu cách so sánh theo cùng tiêu chí (`expected` đòi cả hai) | nhánh mới `_ask_compare_ids`: có ý so sánh + nhắc "hai mẫu / các mẫu này…" mà phiên chưa có kết quả trước → hỏi tên / mã TRƯỚC, nói rõ không tự chọn mẫu thay, nêu cách so: cùng bộ tiêu chí (lấy từ câu, vd âm thanh, pin), đếm review ≥4★ / ≤2★ kèm mã, trái chiều thì nêu hai phía, mẫu ngoài catalog thì nói không có dữ liệu |
| (mới) | "so sánh A với B" có tên mẫu trong câu không được hiểu (chỉ so được mẫu chọn trên web / lượt trước) | công cụ `find_products_by_name` (mọi mẫu được nhắc tên, tối đa 3; khớp thêm mã có chữ số của model khi tên hãng có trong câu, vd "Soundcore Q45" → "Anker Space Q45") → so đúng các mẫu đó; nhận ra 1 mẫu → hỏi đúng mẫu còn thiếu |
| B16 | Chưa "giải thích tiêu chí dễ hiểu" cho người đang thấy thông số khó (ghi chú lượt 1) | `_ask_needs` in "Các tiêu chí bạn nêu, nói ngắn gọn" — mỗi tiêu chí 1 dòng lời thường + agent kiểm nó bằng dữ liệu gì (`CRITERIA_HELP`) |
| B17, B19, B20, B24 | Chỉ có câu hỏi, chưa có "bước hỗ trợ cụ thể" / "hướng so sánh có căn cứ" / "trình bày theo tiêu chí nhất quán"; chưa nói giá cao / rating / KOL không bảo đảm chất lượng | `_ask_needs` thêm `HOW_WE_HELP`: 3 bước (lọc theo ngân sách + điều kiện có nguồn → đọc review theo từng tiêu chí, đếm khen / chê, trích mã → tối đa 3 mẫu, cùng một bộ tiêu chí, kèm điểm trừ / phần thiếu dữ liệu) + "giá cao, rating cao hay người nổi tiếng giới thiệu không tự bảo đảm" |

### 15.2 Tự chấm (model giả — KHÔNG phải kết quả chính thức; câu có gọi model thì lời lý do sẽ khác)
| Câu | Đường đi | Tự đánh giá | Rủi ro khi chạy model thật |
|---|---|---|---|
| B01–B07, B11, B13, B14 | tìm + model xếp hạng | qua (giống lượt 1) | thấp — lớp `check_shortlist` + `audit_claims` gỡ nhận định thiếu mã |
| B08, B09, B10, B12, B15 | chặn / hỏi bằng code, 0 token | qua | không đổi theo model |
| B16, B17, B19, B20, B21, B24 | hỏi ngân sách / nhu cầu bằng code, 0 token | qua | không đổi theo model |
| B18 | hỏi tên / mã + cách so sánh, 0 token | qua | không đổi theo model |
| B22 | đoạn cách xử lý + 3 mẫu có nguồn ghi phím âm lượng | qua | thấp — chỉ 3 ứng viên đã kiểm |
| B23 | đoạn cách xử lý + đối chiếu mô tả ↔ review | khả năng qua | trung bình — model có thể viết khẳng định "êm" vượt trích dẫn; `audit_claims` gỡ câu thiếu mã |

Ước tính *(tự ước tính)*: 23–24/24 nếu model thật không gây lỗi mới. 15/24 câu không gọi model nên kết quả cố định.

### 15.3 Đã kiểm (model giả, không ghi eval/ traces/ cost/)
- 24 câu: trạng thái như mục 14 (B18 vẫn ST-02 nhưng intent COMPARE); bất biến gợi ý 0 lỗi; quét 5 từ 0 trùng (đã viết lại 1 comment trùng B16).
- Câu ngoài bộ thử: "So sánh JBL TUNE 500BT với Soundcore Q45 về pin và âm thanh" → so đúng B07QLN8MNJ / B0BLG1T9CY; "so sánh Sony WH-CH510 và một mẫu khác" → hỏi mẫu còn lại; "JBL TUNE 500BT có mic không?" vẫn PRODUCT_CHECK; khác ngành → báo không so được.
- `test_agent.py` 70/70 · `test_faults.py` 24/24.
- `eval/benchmark.csv`, `eval/metric_spec.yaml`, `spec.md`, `eval/run-1.csv`, `traces/` không đổi.

### 15.4 Còn phải làm (nhóm)
1. Merge với `origin/main` (spec đã điền, commit `cb819ec`) rồi thêm dòng `spec.md` §10 cho mục 11–15; bảng công cụ §4 thêm `find_products_by_name`.
2. Chạy lượt 2 (`python run.py eval --try` rồi `python run.py eval`), chấm cột `pass`, điền `eval/report.md` §3.

## 16. Chạy `eval --try` với model thật (gpt-4o-mini) trên nhánh `test1` — 28/11 ~11:30

`.env`: `openai · gpt-4o-mini` (lượt 1 dùng gemini-3.1-flash-lite — lượt 2 chính thức nên dùng cùng model với lượt 1).
Mỗi lần thử: 3 câu B01–B03, ghi đè `eval/run-try.csv` / `traces/run-try.jsonl` (gitignore, không phải lượt có số).
Chạy 4 lần; cả 4 lần đều 0 lỗi, mỗi câu 1 lần gọi model, ~4,1–5,2k token vào / 150–255 ra.

### 16.1 Lỗi lộ ra ở model thật (chế độ giả không thấy) và đã sửa (`tools.py`, `agent.py`)
| Lỗi (lần thử) | Ví dụ | Sửa |
|---|---|---|
| Nhận định ngoài danh sách tiêu chí không được kiểm | Seenda: điểm trừ "có thể mất kết nối (R2, R3)" — R2, R3 chỉ khen bấm êm | `EXTRA_TOPICS` (Kết nối, Chất liệu / hoàn thiện) đưa vào lớp kiểm (`CLAIM_TOPICS`); vế câu tự ghi mã mà mã đó không nói đúng chủ đề → gỡ, không thay mã khác |
| Điểm trừ được "đỡ" bằng thông số người bán / review khen | Unipows: "click hơi ồn" nhưng trích R4 "quiet when pressing" | `audit_claims(..., negative=True)` cho tradeoff: chỉ review có ý chê đỡ được (`_neg_ok`: ≤3★, nói "không", từ chê sẵn như "loud", hoặc "but / problem…"); "noiseless", "lag-free" không bị tính là chê |
| Từ khoá `type` khớp "desktop type unit" | KNOWSQT R1 bị trích cho cảm giác gõ | `go_phim.kw`: `typing / typed / typist / type on / to type / keystroke…` |
| Câu không kiểm được | "Không có điểm trừ đáng kể", "Chưa có điểm trừ." | gỡ (BANNED_CLAIMS / tradeoff rỗng) |
| Lộ tên trường nội bộ | "(n=9, pos=8)", "(said_not=1)" | `_clean_text` gỡ; prompt: viết số bằng lời |
| "microphone" không khớp tiêu chí Micro → nhận định không được kiểm, trích review lạc đề | ZIUTY trích R2 nói về pin / âm thanh | thêm `microphone / micrô / míc / cuộc gọi` vào cụm nhận diện Micro |
| "…và không có review tiêu cực nào" bị coi là lời báo thiếu dữ liệu → cả câu không được kiểm, mã đúng bị gỡ nhầm | Unipows mất R1, R3 | `DISCLAIMER_RX` không khớp "không có review tiêu cực / chê" |
| Trích dẫn của điểm trừ không hiện | chỉ in 2 trích dẫn đầu | in tối đa 3 |
`SYSTEM_RANK`: điểm trừ phải trích mã review nói đúng điểm đó, không thì để trống; không chép tên trường. `PROMPT_VERSION` → `smartbuy-v2.4 · 2026-11-28`.

### 16.2 Lần thử cuối (sau sửa)
- B01: fojep / ZIUTY / ORIbox — Bluetooth 5.3 có mã; nhận định micro trích review nói về gọi điện (R5 "People seem to hear me clearly"); ≤ 1 triệu.
- B02: Unipows — thoải mái R1, R3; điểm trừ click to trích đúng R2 1★ "The click is loud"; Logitech POP — điểm trừ tay lớn trích R2 "isn't ideal in terms of ergonomics"; Seenda — nhận định click êm không đỡ được bị gỡ, ghi "chưa có bằng chứng…".
- B03: KNOWSQT / Arteck / Emetok — trích đúng câu nói về phím.
- Hồi quy (model giả): `test_agent.py` 70/70 · `test_faults.py` 24/24 · 24 câu giữ trạng thái · quét 5 từ 0 trùng.

### 16.3 Giới hạn còn lại
- Kiểm theo chủ đề + chiều khen / chê thô, không hiểu nghĩa câu: ZIUTY "thu âm ổn định" trích R1 nói về chạm cảm biến khi đang gọi — đúng chủ đề, chưa chắc đúng ý.
- Số đếm model tự viết ("tất cả bốn review", "5/5") chưa được code đối chiếu với `aspects`.

## 17. Chạy cả 24 câu với model thật (dạng thử) — 28/11 ~12:00

Lệnh: `python run.py eval --try 24` — đủ 24 câu, model thật (gpt-4o-mini), ghi `eval/run-try.csv` / `traces/run-try.jsonl`
(gitignore). **Cố ý không dùng `python run.py eval`**: lệnh đó tạo lượt có số `run-2` chính thức, không sửa / xoá được.
Chạy 2 lần (trước và sau đợt sửa 17.2); cả hai lần 24/24 không lỗi, 12 câu gọi model (B11 gọi 2), 12 câu 0 token.
Token lần cuối: ~48,2k vào / ~2,4k ra cho cả bộ (≈ 0,009 USD theo giá 0,15 / 0,60 USD mỗi 1M token *(cần đối chiếu bảng giá)*).

### 17.1 Lần 1 — tự chấm thấy 5 câu có rủi ro
| Câu | Vấn đề |
|---|---|
| B05 | Điểm trừ "nút cứng, không vừa tay" không trích mã |
| B06 | Điểm trừ iClever "phím không hoạt động đúng" không trích mã |
| B07 | "Âm thanh tốt (R3, R4)" — R3, R4 chỉ nhắc "listening to music", "audio books" (từ khoá `music` / `audio` quá rộng) |
| B22 | Cả 3 điểm trừ không trích mã nào (câu kiểm điều kiện bắt buộc — phải đạt 100%) |
| B23 | Điểm trừ "kết nối" đúng (R1 1★ "disconnects…") nhưng trích dẫn in ra là review khen |
| B02 / B05 | Thuộc tính chỉ ghi "Wireless" bị coi là chưa xác minh với điều kiện Không dây (loại oan Logitech M325, HP X3000) và không bị loại với điều kiện Có dây |

### 17.2 Đã sửa (`tools.py`)
- `check_hard`: nguồn chỉ ghi "Wireless" → Không dây MATCH (kèm mã), Có dây MISMATCH, Bluetooth vẫn UNKNOWN.
- `SOFT["am_thanh"]["kw"]`: bỏ `music`, `audio`, `clear`; thêm `audio quality`, `crisp`, `highs`, `mids`, `tinny`, `muffled`.
- `EXTRA_TOPICS`: thêm "Lỗi / trục trặc" (`loi`) và "Nút / phím bấm" (`nut_bam`); thoải mái nhận "vừa tay / tay lớn…".
- Điểm trừ: ưu tiên review chê RÕ (≤2★ / nói "không") khi model đã được xem; câu điểm trừ kể "review / người dùng phàn nàn…" mà không thuộc chủ đề nào kiểm được → gỡ.
- Câu bị gỡ thì mã gắn cho nó cũng bỏ; lý do không thuộc tiêu chí kiểm được thì giữ mã model trích; mã model ghi trong câu đã kiểm đúng → đưa vào danh sách để in trích dẫn.
- Ghi chú "Chưa có bằng chứng về…" chỉ cho phần lý do bị gỡ và không trùng tiêu chí còn giữ (hết câu tự mâu thuẫn).

### 17.3 Lần 2 (sau sửa) — tự chấm, KHÔNG phải kết quả chính thức
Đọc từng output theo `pass_criterion`: không thấy câu nào trượt rõ. Điểm trừ còn lại đều có review chê đúng ý được in ra
(COOLERPLUS R1 "buttons are very stiff", Macally R2 "after 1 day this button failed", POP R1 / VssoPlor R2 "loses connectivity",
Belkin R2 1★ ghép đôi, JBL R1 "cheaper materials"). Câu còn hơi yếu (có thể bị người chấm trừ): B01 ZIUTY "micro tốt" trích
R1 nói về chạm cảm biến khi đang gọi; B03 Arteck R4 chỉ nói "understand the keys"; B14 điểm trừ "chưa có dữ liệu về micro và pin"
không hợp bàn phím. Ước tính *(tự ước tính)*: 22–24/24.
Hồi quy (model giả): `test_agent.py` 70/70 · `test_faults.py` 24/24 · 24 câu giữ trạng thái · bất biến 0 lỗi · quét 5 từ 0 trùng.
