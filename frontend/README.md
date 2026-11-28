# SmartBuy — giao diện web

Giao diện cho lát cắt SmartBuy: duyệt / lọc catalog (UC-02), chi tiết + bằng chứng review (UC-03), trợ lý nghiên cứu (UC-04/05/07/08), so sánh (UC-06), trace (UC-10). Bám theo tài liệu *SmartBuy — Business Process & Use Case Specification*.

HTML/CSS/JS thuần, **không cần build, không cần npm**. Server chỉ dùng thư viện chuẩn Python, đúng luật của khung.

## Chạy

```
python codebase/web.py            # mở http://127.0.0.1:8000
python codebase/web.py --port 8765
python codebase/web.py --open     # tự mở trình duyệt
```

Font Be Vietnam Pro được dùng thống nhất cho tiêu đề, nội dung, nhãn và số liệu, tải từ Google Fonts. Nếu máy demo mất mạng, giao diện tự dùng font hệ thống thay thế. Icon SVG cùng bộ nét; hiệu ứng nhẹ và tôn trọng `prefers-reduced-motion`.

## Phần nào thật, phần nào minh họa

| Thành phần | Thật / minh họa | Ghi chú |
|---|---|---|
| Duyệt, tìm, lọc, sắp xếp, so sánh | **Thật**, chạy trên backend | `codebase/catalog.py`, không gọi AI (UC-02) |
| Gọi trợ lý từ ô soạn | **Thật** | Gọi `answer()` trong `codebase/agent.py`, đo trace bằng `tracing.py` |
| Catalog | **Thật** (`data/catalog.json`) | 422 sản phẩm Amazon Reviews 2023 (có link ảnh), dựng bằng `codebase/build_catalog.py --from-export data/amazon_raw` (xem `docs/backend-log.md`). Agent đọc cùng file. Chưa có file đó thì server dùng `frontend/demo/catalog.synthetic.json` (24 sản phẩm **hư cấu**). |
| Tỷ giá 25.400đ/USD | **Minh họa** | *(tự ước tính)*. Thay bằng tỷ giá có nguồn trong file catalog |
| "Kịch bản minh họa giao diện" | **Minh họa** | `js/scenarios.js`: dữ liệu dựng sẵn để xem đủ ST-01…ST-09. Chỉ chạy khi bấm chọn, luôn gắn nhãn "minh họa", không có trace |

Khi demo, **không trình bày kịch bản minh họa như kết quả AI**. Giao diện đã gắn nhãn ở tin nhắn, báo cáo và trace.

## Hợp đồng agent → giao diện

`answer(text)` vẫn trả `{"output": str}` như khung yêu cầu. Eval chỉ đọc `output`, nên khoá thêm không ảnh hưởng eval/simulate.

Để giao diện vẽ trạng thái, Top 3, điểm, bằng chứng…, agent trả thêm khoá **`smartbuy`**. Mọi khoá đều tuỳ chọn, khoá nào có thì giao diện vẽ phần đó:

```jsonc
{
  "output": "câu trả lời dạng chữ (cho eval)",
  "smartbuy": {
    "state": "ST-04",                 // ST-01…ST-09 (spec mục VI)
    "final_status": "OK",             // OK | PARTIAL_RESULT | NO_MATCH | NEEDS_CLARIFICATION | TOOL_ERROR | OUT_OF_SCOPE
    "intent": "FIND_PRODUCTS",
    "message": "Lời giải thích ngắn cho người dùng",
    "catalog_version": "…", "prompt_version": "…", "retry_count": 0,
    "validation": { "claims_without_source": 0, "hard_violations": 0 },

    "context": {                      // Shopping Context (spec mục VII) — giao diện hiện ở "sổ nhu cầu"
      "version": 1, "category": "headphones", "category_label": "Tai nghe", "purpose": "Học online",
      "budget": { "max_vnd": 1000000, "label": "≤ 1.000.000đ" },
      "hard":    [{ "key": "connectivity", "label": "Bluetooth" }],
      "soft":    [{ "key": "comfort", "label": "Đeo lâu thoải mái" }],
      "exclude": [{ "label": "Nhét tai" }]
    },

    "plan": [                         // nhật ký nghiên cứu — status: done | warn | error | skip
      { "label": "Tìm trong catalog", "tool": "search_catalog", "detail": "8 sản phẩm", "status": "done", "ms": 120 }
    ],

    "recommendations": [              // tối đa 3, ID phải có trong catalog công bố (ID lạ bị chặn — EX-10)
      {
        "id": "HP-01", "rank": 1,
        "score": { "S": 95.0, "F": 100, "Q": 85.0, "E": 80 },   // F = null → giao diện ghi "xếp theo Q"
        "hard_results": [{ "label": "Bluetooth 5.3", "result": "MATCH", "evidence": ["M1"] }],  // MATCH | UNKNOWN | MISMATCH
        "reasons":   [{ "text": "…", "evidence": ["R1", "R3"] }],   // evidence = id trong evidence[] của sản phẩm
        "tradeoffs": [{ "text": "…", "evidence": ["R5"] }],
        "missing":   ["ANC: chưa xác minh"],
        "limits":    ["Dựa trên 14 review"]
      }
    ],
    "excluded": [{ "id": "HP-08", "name": "Kestrel Audio Wave", "reason": "Bluetooth chưa xác minh" }],

    "clarify": { "question": "Bạn cần loại nào?", "options": [{ "label": "Chuột", "text": "Chuột" }], "hint": "…" },
    "no_match": { "findings": ["Rẻ nhất có ANC: … 1.270.000đ"] },
    "pending_change": {               // ST-07 — giao diện KHÔNG tự áp dụng, chờ người dùng chọn
      "id": "PC-1", "title": "Đề xuất điều chỉnh",
      "options": [
        { "key": "budget", "title": "Tăng ngân sách", "diff": { "field": "Ngân sách", "from": "≤ 500.000đ", "to": "≤ 1.300.000đ" },
          "note": "Có căn cứ: 1 sản phẩm đạt", "text": "Đồng ý tăng ngân sách lên 1.300.000đ" },
        { "key": "keep", "title": "Giữ nguyên", "kind": "keep", "text": "Giữ nguyên điều kiện" }
      ]
    },
    "error": { "type": "TOOL_ERROR", "tool": "search_catalog", "message": "timeout", "retry_count": 2 },
    "limits": ["…"],
    "next_actions": [{ "label": "Tăng ngân sách lên 1,5 triệu", "text": "Tăng ngân sách lên 1,5 triệu" }]
  }
}
```

**Ngữ cảnh từ web gửi cho agent.** Khai báo `def answer(text, context=None)` thì server tự truyền `context`. Eval vẫn gọi `answer(text)` như cũ. `context` gồm:
- `session_id`, `shopping_context` (nhu cầu hiện tại),
- `scope` (`filtered` / `product` / `compare`), `category`, `filters`, `compare_ids`,
- `history` (8 lượt gần nhất), `pending_change` (khi người dùng chọn một phương án ở phiếu ST-07).

Ví dụ agent trả đủ khoá: xem các payload trong `js/scenarios.js`.

## Khuôn catalog (`data/catalog.json`)

Cùng khuôn với `frontend/demo/catalog.synthetic.json`:

- `catalog_version`, `fx.usd_vnd` (+ `source`, `as_of`), `attribute_labels`
- `categories.<cat>.filters` là các bộ lọc **đã qua data gate** (AC-CAT-02); `compare` là tiêu chí so sánh.
- Mỗi sản phẩm:
  - `id`, `status` (chỉ `APPROVED` được công bố), `category`, `brand`, `model`, `title`, `image` (URL hoặc null), `price_usd`, `rating`, `rating_number`,
  - `attributes.<key> = { value, status: VERIFIED|UNKNOWN|CONFLICT, source, tags, values[] }`,
  - `reviews_collected`, `rating_hist`, `insights[]`, `evidence[]` (id `M*` = metadata, `R*` = review).

## Design system

Danh mục mặc định dùng nền xanh pastel, chữ navy, nút xanh cobalt và thẻ trắng bán trong suốt. Trên điện thoại, thanh điều hướng chuyển từ cạnh trái xuống cuối màn hình. Bộ lọc và trợ lý mở theo yêu cầu.

| | |
|---|---|
| Chữ | **Be Vietnam Pro** cho toàn bộ giao diện; phân cấp bằng cỡ và độ đậm, số liệu dùng tabular-nums |
| Màu | Token trong `css/tokens.css`, có chế độ sáng và tối |
| Trạng thái | Tem `ĐÃ XÁC MINH` / `CHƯA XÁC MINH` (viền đứt) / `MÂU THUẪN`. Luôn có icon + chữ, không dùng màu đơn lẻ |
| Biểu đồ | Thanh F/Q/E một màu; phân bố sao một màu; thanh khen / trái chiều / chê dùng cặp màu đã chạy validator CVD (ΔE 20) |
| Chuyển động | 120–320 ms, ease-out; chỉ phần tử mới mới có hiệu ứng; tắt khi `prefers-reduced-motion` |
| Trợ năng | Landmark, focus ring rõ, bẫy focus trong drawer/dialog, Esc để đóng, `aria-live` cho trạng thái, vùng chạm ≥ 40px trên di động, không cuộn ngang |
| Responsive | ≥1360: 3 cột (lọc · nội dung · trợ lý) · 1101–1359: bộ lọc thành ngăn kéo · ≤1100: trợ lý trượt ra · ≤767: thanh điều hướng dưới |

## Cấu trúc

```
frontend/
  index.html
  css/tokens.css      token màu, chữ, khoảng cách (sáng + tối)
  css/app.css         thành phần + bố cục + responsive + trợ năng
  js/main.js          định tuyến (#/, #/bao-cao, #/so-sanh, #/sp/<id>), uỷ quyền sự kiện
  js/views/*.js       catalog · product · compare · report · agent · trace
  js/scenarios.js     kịch bản minh họa (gắn nhãn, không phải AI)
  demo/catalog.synthetic.json
codebase/web.py       server (thư viện chuẩn) + /api/*
codebase/catalog.py   đọc / lọc / so sánh catalog — dùng lại được trong tools.py
```
