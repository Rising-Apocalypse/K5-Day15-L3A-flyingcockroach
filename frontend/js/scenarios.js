// KỊCH BẢN MINH HỌA GIAO DIỆN — dữ liệu dựng sẵn, KHÔNG phải output của AI.
// Mục đích: xem đủ 9 trạng thái tư vấn (ST-01…ST-09) khi agent chưa trả dữ liệu có cấu trúc.
// Mỗi payload theo đúng "Hợp đồng agent → giao diện" (frontend/README.md) — agent thật trả cùng khuôn là giao diện vẽ được.
// Sản phẩm, điểm Q lấy từ catalog minh họa (frontend/demo/catalog.synthetic.json); F, E là số minh họa.

const HP_CTX = {
  version: 1, category: "headphones", category_label: "Tai nghe", purpose: "Học online",
  budget: { max_vnd: 1000000, label: "≤ 1.000.000đ" },
  hard: [{ key: "connectivity", label: "Bluetooth" }, { key: "price", label: "≤ 1.000.000đ" }],
  soft: [{ key: "comfort", label: "Đeo lâu thoải mái" }, { key: "microphone", label: "Có micro" }],
  exclude: [],
};

const TOP3 = {
  state: "ST-04", final_status: "OK", intent: "FIND_PRODUCTS",
  catalog_version: "demo-synthetic-v1", prompt_version: "minh-hoa", retry_count: 0,
  message: "Có đúng ba tai nghe đạt cả hai điều kiện bắt buộc. Aurin Halo 2 hợp nhất cho học online vì nhiều người đeo 2–3 giờ không đau tai và có micro tích hợp; hai mẫu còn lại rẻ hơn nhưng kém thoải mái khi đeo lâu.",
  context: HP_CTX,
  plan: [
    { label: "Hiểu nhu cầu", tool: "llm.parse_intent", detail: "Bắt buộc: Bluetooth, ≤ 1.000.000đ · Ưu tiên: đeo thoải mái, có micro · “có mic thì tốt” → ưu tiên, không bắt buộc", status: "done", ms: 410 },
    { label: "Tìm trong catalog", tool: "search_catalog", args: 'category="headphones"', detail: "8 tai nghe đã duyệt", status: "done", ms: 120 },
    { label: "Kiểm điều kiện bắt buộc", tool: "validate_constraints", args: 'connectivity="bluetooth", max_vnd=1000000', detail: "3 đạt · 5 bị loại (2 vượt ngân sách, 2 không phải Bluetooth, 1 chưa xác minh Bluetooth)", status: "done", ms: 35 },
    { label: "Lấy thông số & review", tool: "get_evidence", args: 'ids=["B0DEMOHP01", "B0DEMOHP02", "B0DEMOHP04"]', detail: "15 review + details/features của 3 ứng viên", status: "done", ms: 260 },
    { label: "Chấm độ phù hợp F", tool: "llm.score_fit", args: "rubric=0|50|100", detail: "Theo đeo lâu + micro", status: "done", ms: 1820 },
    { label: "Tự kiểm tra", detail: "B0DEMOHP01: pin mâu thuẫn 40 / ≈30 giờ → ghi rõ là mâu thuẫn, không dùng làm lý do", status: "warn", ms: 640 },
    { label: "Kiểm định đầu ra", tool: "validate_output", detail: "0 nhận định thiếu nguồn · 0 vi phạm điều kiện bắt buộc", status: "done", ms: 30 },
  ],
  recommendations: [
    {
      id: "B0DEMOHP01", rank: 1, score: { S: 95.0, F: 100, Q: 85.0, E: 80 },
      hard_results: [{ label: "Bluetooth 5.3", result: "MATCH", evidence: ["D3"] }, { label: "≈ 940.000đ ≤ 1 triệu", result: "MATCH" }],
      reasons: [
        { text: "Nhiều người đeo 2–3 giờ học online mỗi ngày mà không đau tai; đệm mềm, không bí.", evidence: ["R1", "R3"] },
        { text: "Có micro tích hợp, giọng rõ khi ngồi phòng yên tĩnh.", evidence: ["F4", "R2"] },
      ],
      tradeoffs: [
        { text: "Micro kém khi có tiếng ồn xung quanh (quán cà phê, quạt mạnh).", evidence: ["R5"] },
        { text: "Hãng ghi pin 40 giờ, một review đo khoảng 30 giờ — vẫn đủ cho một tuần học.", evidence: ["F2", "R6"] },
      ],
      missing: ["Chống ồn chủ động (ANC): chưa xác minh — không ảnh hưởng nhu cầu học online."],
      limits: ["Dựa trên 14 review đã thu thập, không đại diện cho mọi người dùng."],
    },
    {
      id: "B0DEMOHP02", rank: 2, score: { S: 58.0, F: 50, Q: 80.1, E: 70 },
      hard_results: [{ label: "Bluetooth 5.0", result: "MATCH", evidence: ["D3"] }, { label: "≈ 622.000đ ≤ 1 triệu", result: "MATCH" }],
      reasons: [
        { text: "Rất nhẹ (158 g), gập gọn mang theo.", evidence: ["D6", "R1"] },
        { text: "Micro đủ rõ khi gọi Zoom.", evidence: ["R3"] },
      ],
      tradeoffs: [{ text: "Kiểu áp tai: vài người đau vành tai sau khoảng một giờ học.", evidence: ["R2", "R4"] }],
      missing: [],
      limits: ["9 review — mới đủ phân tích sơ bộ."],
    },
    {
      id: "B0DEMOHP04", rank: 3, score: { S: 56.5, F: 50, Q: 77.5, E: 60 },
      hard_results: [{ label: "Bluetooth 5.3", result: "MATCH", evidence: ["D3"] }, { label: "≈ 482.000đ ≤ 1 triệu", result: "MATCH" }],
      reasons: [
        { text: "Rẻ nhất trong nhóm đạt điều kiện; pin đủ cả ngày học.", evidence: ["R1"] },
      ],
      tradeoffs: [
        { text: "Nhét tai: có người mỏi ống tai sau khoảng 90 phút.", evidence: ["R2"] },
        { text: "Giọng hơi nhỏ khi gọi ngoài trời.", evidence: ["R4"] },
      ],
      missing: [],
      limits: ["12 review đã thu thập."],
    },
  ],
  excluded: [
    { id: "B0DEMOHP03", name: "Kestrel Audio Studio Q", reason: "Vượt ngân sách: ≈ 1.270.000đ." },
    { id: "B0DEMOHP05", name: "Lumen Calm ANC", reason: "Vượt ngân sách: ≈ 1.727.000đ." },
    { id: "B0DEMOHP06", name: "Aurin Wired One", reason: "Không phải Bluetooth (có dây 3.5 mm)." },
    { id: "B0DEMOHP07", name: "Nomo Desk Pro", reason: "Không phải Bluetooth (USB-C có dây) — dù micro rất hợp học online." },
    { id: "B0DEMOHP08", name: "Kestrel Audio Wave", reason: "Bluetooth chưa xác minh: nguồn chỉ ghi “wireless”, không suy ra là Bluetooth." },
  ],
  limits: [],
  next_actions: [
    { label: "So sánh 3 lựa chọn", action: "compare-recs" },
    { label: "Tăng ngân sách lên 1,5 triệu", text: "Tăng ngân sách lên 1,5 triệu", next: "top3.raise" },
    { label: "Ưu tiên pin lâu hơn", text: "Ưu tiên thêm pin lâu" },
  ],
};

const RAISED = {
  ...TOP3,
  message: "Đã nâng ngân sách lên 1.500.000đ theo yêu cầu của bạn, các điều kiện khác giữ nguyên. Kestrel Studio Q vào nhóm đạt và đứng thứ hai: có chống ồn, đáng cân nhắc nếu bạn hay học ở nơi ồn. Halo 2 vẫn hợp nhất cho việc đeo lâu.",
  context: { ...HP_CTX, version: 2, budget: { max_vnd: 1500000, label: "≤ 1.500.000đ" }, hard: [{ key: "connectivity", label: "Bluetooth" }, { key: "price", label: "≤ 1.500.000đ" }] },
  plan: [
    { label: "Cập nhật nhu cầu", detail: "Chỉ đổi giới hạn giá 1.000.000đ → 1.500.000đ (chỉ thị rõ của bạn = xác nhận). Giữ nguyên Bluetooth và các ưu tiên.", status: "done", ms: 380 },
    { label: "Lọc lại điều kiện bắt buộc", tool: "validate_constraints", detail: "4 đạt (thêm B0DEMOHP03)", status: "done", ms: 40 },
    { label: "Lấy bằng chứng bổ sung", tool: "get_evidence", detail: "22 review của B0DEMOHP03", status: "done", ms: 210 },
    { label: "Xếp hạng lại", detail: "Giữ điểm F cũ của B0DEMOHP01/02/04, chấm F cho B0DEMOHP03", status: "done", ms: 1210 },
    { label: "Kiểm định đầu ra", tool: "validate_output", detail: "0 nhận định thiếu nguồn", status: "done", ms: 28 },
  ],
  recommendations: [
    { ...TOP3.recommendations[0], hard_results: [{ label: "Bluetooth 5.3", result: "MATCH", evidence: ["D3"] }, { label: "≈ 940.000đ ≤ 1,5 triệu", result: "MATCH" }] },
    {
      id: "B0DEMOHP03", rank: 2, score: { S: 61.5, F: 50, Q: 87.5, E: 90 },
      hard_results: [{ label: "Bluetooth 5.2", result: "MATCH", evidence: ["D3"] }, { label: "≈ 1.270.000đ ≤ 1,5 triệu", result: "MATCH" }],
      reasons: [
        { text: "Chống ồn chủ động được khen nhiều ở phòng có quạt, điều hoà.", evidence: ["R1", "R2"] },
        { text: "Hai micro, giọng vẫn rõ khi ngoài đường ồn.", evidence: ["F4", "R5"] },
      ],
      tradeoffs: [{ text: "Nặng hơn (268 g); vài người thấy nóng tai sau khoảng hai giờ.", evidence: ["D7", "R3"] }],
      missing: [], limits: ["22 review đã thu thập."],
    },
    { ...TOP3.recommendations[1], rank: 3, hard_results: [{ label: "Bluetooth 5.0", result: "MATCH", evidence: ["D3"] }, { label: "≈ 622.000đ ≤ 1,5 triệu", result: "MATCH" }] },
  ],
  excluded: [
    { id: "B0DEMOHP04", name: "Basswood Pod S", reason: "Đạt điều kiện nhưng xếp thứ 4 (S = 56,5) — ngoài Top 3." },
    { id: "B0DEMOHP05", name: "Lumen Calm ANC", reason: "Vượt ngân sách: ≈ 1.727.000đ." },
    { id: "B0DEMOHP06", name: "Aurin Wired One", reason: "Không phải Bluetooth." },
    { id: "B0DEMOHP07", name: "Nomo Desk Pro", reason: "Không phải Bluetooth." },
    { id: "B0DEMOHP08", name: "Kestrel Audio Wave", reason: "Bluetooth chưa xác minh." },
  ],
  next_actions: [{ label: "So sánh 3 lựa chọn", action: "compare-recs" }],
};

const CLARIFY = {
  state: "ST-02", final_status: "NEEDS_CLARIFICATION", intent: "FIND_PRODUCTS",
  message: "Mình cần biết loại sản phẩm trước đã — SmartBuy hiện tư vấn ba ngành hàng.",
  context: { version: 0, category: null, purpose: "Làm việc ở nhà", budget: null, hard: [], soft: [], exclude: [] },
  plan: [{ label: "Hiểu nhu cầu", detail: "Thiếu ngành hàng — không đoán thay bạn", status: "warn", ms: 350 }],
  clarify: {
    question: "Bạn cần tư vấn loại nào?",
    options: [
      { label: "Chuột", text: "Chuột", next: "clarify.mouse" },
      { label: "Bàn phím", text: "Bàn phím" },
      { label: "Tai nghe", text: "Tai nghe" },
    ],
    hint: "Có ngân sách thì ghi kèm, ví dụ “chuột dưới 500k”. Chưa có cũng được — mình sẽ nói rõ giới hạn.",
  },
};

const MOUSE_WORK = {
  state: "ST-04", final_status: "OK", intent: "FIND_PRODUCTS", catalog_version: "demo-synthetic-v1",
  message: "Bạn chưa nêu ngân sách nên mình chưa lọc theo giá — chỉ xếp theo mức hợp với làm việc cả ngày ở nhà. Glidr Flow đứng đầu nhờ dáng ôm tay, click êm và kết nối được cả hai kiểu.",
  context: { version: 1, category: "mouse", category_label: "Chuột", purpose: "Làm việc ở nhà cả ngày", budget: null, hard: [], soft: [{ key: "comfort", label: "Cầm lâu không mỏi" }, { key: "noise", label: "Click êm" }], exclude: [] },
  plan: [
    { label: "Ghép câu trả lời vào nhu cầu", detail: "Ngành: chuột · mục đích: làm việc ở nhà · chưa có ngân sách", status: "done", ms: 300 },
    { label: "Tìm trong catalog", tool: "search_catalog", detail: "8 chuột đã duyệt", status: "done", ms: 90 },
    { label: "Lấy thông số & review", tool: "get_evidence", detail: "6 ứng viên có review về cầm lâu", status: "done", ms: 240 },
    { label: "Chấm độ phù hợp F", status: "done", ms: 1540 },
    { label: "Kiểm định đầu ra", tool: "validate_output", status: "done", ms: 26 },
  ],
  recommendations: [
    { id: "B0DEMOMS01", rank: 1, score: { S: 96.0, F: 100, Q: 87.5, E: 85 }, hard_results: [],
      reasons: [{ text: "Nhiều người làm việc 8 giờ/ngày thấy đỡ mỏi cổ tay.", evidence: ["R1", "R2"] }, { text: "Click gần như không tiếng.", evidence: ["F3", "R3"] }],
      tradeoffs: [{ text: "Chỉ cho tay phải.", evidence: ["D7"] }], missing: [], limits: ["16 review đã thu thập."] },
    { id: "B0DEMOMS05", rank: 2, score: { S: 93.5, F: 100, Q: 82.5, E: 70 }, hard_results: [],
      reasons: [{ text: "Chuột dọc — nhiều người đỡ đau cổ tay sau 1–2 tuần làm quen.", evidence: ["R1", "R2"] }],
      tradeoffs: [{ text: "Pin: hãng ghi 70 ngày, một review chỉ được khoảng 3 tuần (mâu thuẫn).", evidence: ["F2", "R3"] }],
      missing: [], limits: ["8 review — phân tích sơ bộ."] },
    { id: "B0DEMOMS04", rank: 3, score: { S: 59.0, F: 50, Q: 82.5, E: 75 }, hard_results: [],
      reasons: [{ text: "Click êm, pin AA dùng hơn một năm.", evidence: ["R1", "R3"] }],
      tradeoffs: [{ text: "Dáng đối xứng cơ bản, không có review nói về cầm lâu.", evidence: [] }], missing: ["Độ thoải mái khi cầm lâu: chưa có nguồn."], limits: [] },
  ],
  excluded: [
    { id: "B0DEMOMS03", name: "Pointer Lab Precision G", reason: "Chuột chơi game, review không nói về làm việc lâu." },
    { id: "B0DEMOMS06", name: "Orbit Pro Wireless", reason: "Chuột chơi game; F thấp với nhu cầu làm việc." },
  ],
  limits: ["Chưa có ngân sách — kết quả chưa lọc theo giá. Thêm ngân sách để thu hẹp."],
  next_actions: [{ label: "Dưới 500k thôi", text: "Ngân sách dưới 500k" }, { label: "So sánh 3 lựa chọn", action: "compare-recs" }],
};

const PARTIAL = {
  state: "ST-05", final_status: "PARTIAL_RESULT", intent: "FIND_PRODUCTS", catalog_version: "demo-synthetic-v1",
  message: "Chỉ hai chuột đạt cả hai điều kiện bắt buộc — mình không thêm mẫu sai điều kiện cho đủ ba. Kestrel Silent M có bằng chứng pin rất lâu; Orbit Mini rẻ tương đương nhưng chưa có dữ liệu thời lượng pin.",
  context: { version: 1, category: "mouse", category_label: "Chuột", purpose: null, budget: { max_vnd: 300000, label: "≤ 300.000đ" },
    hard: [{ key: "connectivity", label: "Không dây" }, { key: "price", label: "≤ 300.000đ" }], soft: [{ key: "battery", label: "Pin lâu" }], exclude: [] },
  plan: [
    { label: "Hiểu nhu cầu", detail: "Bắt buộc: không dây (Bluetooth hoặc 2.4 GHz), ≤ 300.000đ · Ưu tiên: pin lâu", status: "done", ms: 330 },
    { label: "Tìm & kiểm điều kiện", tool: "search_catalog", detail: "2 đạt · B0DEMOMS08 bị loại vì chưa có giá", status: "done", ms: 140 },
    { label: "Tìm bằng chứng về pin", tool: "get_evidence", detail: "B0DEMOMS02: không có nguồn về thời lượng pin", status: "warn", ms: 220 },
    { label: "Tìm lại (1/2)", tool: "search_catalog", detail: "Mở rộng từ khoá “battery life”, “rechargeable” — vẫn không có", status: "warn", ms: 180 },
    { label: "Kiểm định đầu ra", tool: "validate_output", detail: "Đánh dấu B0DEMOMS02 là thiếu bằng chứng cho tiêu chí ưu tiên", status: "done", ms: 24 },
  ],
  recommendations: [
    { id: "B0DEMOMS04", rank: 1, score: { S: 94.0, F: 100, Q: 82.5, E: 75 },
      hard_results: [{ label: "2.4 GHz không dây", result: "MATCH", evidence: ["D3"] }, { label: "≈ 279.000đ ≤ 300k", result: "MATCH" }],
      reasons: [{ text: "Pin AA ghi đến 18 tháng; nhiều người dùng hơn một năm chưa thay.", evidence: ["F2", "R1", "R2"] }],
      tradeoffs: [{ text: "Con lăn hơi lỏng.", evidence: ["R3"] }], missing: [], limits: [] },
    { id: "B0DEMOMS02", rank: 2, score: { S: 54.0, F: 50, Q: 75.2, E: 40 },
      hard_results: [{ label: "Bluetooth", result: "MATCH", evidence: ["D3"] }, { label: "≈ 292.000đ ≤ 300k", result: "MATCH" }],
      reasons: [{ text: "Nhỏ gọn, tiện mang theo laptop.", evidence: ["R1"] }],
      tradeoffs: [{ text: "Tay to cầm lâu dễ mỏi.", evidence: ["R2"] }],
      missing: ["Thời lượng pin: nguồn chỉ ghi “sạc USB-C”, chưa xác minh được bao lâu."], limits: [] },
  ],
  excluded: [{ id: "B0DEMOMS08", name: "Kestrel Duo", reason: "Chưa có giá tham khảo — không xác nhận được ≤ 300.000đ." }],
  limits: ["Kết quả hạn chế: chỉ 2/3 vị trí có sản phẩm đạt điều kiện, và một mẫu thiếu bằng chứng cho tiêu chí pin."],
  next_actions: [{ label: "Nới ngân sách tới 450k", text: "Nới ngân sách tới 450k" }],
};

const NOMATCH = {
  state: "ST-07", final_status: "NO_MATCH", intent: "FIND_PRODUCTS",
  message: "Chưa tìm thấy tai nghe đáp ứng đủ cả ba điều kiện: Bluetooth, chống ồn chủ động (ANC), giá ≤ 500.000đ trong catalog tham khảo. Mình không tự đổi điều kiện của bạn — chọn một hướng bên dưới.",
  context: { version: 1, category: "headphones", category_label: "Tai nghe", purpose: null, budget: { max_vnd: 500000, label: "≤ 500.000đ" },
    hard: [{ key: "connectivity", label: "Bluetooth" }, { key: "anc", label: "Chống ồn ANC" }, { key: "price", label: "≤ 500.000đ" }], soft: [], exclude: [] },
  plan: [
    { label: "Hiểu nhu cầu", detail: "Bắt buộc: Bluetooth, ANC, ≤ 500.000đ", status: "done", ms: 290 },
    { label: "Tìm trong catalog", tool: "search_catalog", detail: "0 sản phẩm đạt cả 3", status: "warn", ms: 110 },
    { label: "Tìm lại (1/2)", tool: "search_catalog", detail: "Mở rộng: “noise cancelling”, “noise cancellation” — 0", status: "warn", ms: 130 },
    { label: "Tìm lại (2/2)", tool: "search_catalog", detail: "Tách từng điều kiện để tìm nguyên nhân", status: "done", ms: 150 },
    { label: "Dừng tìm lại", detail: "Đã dùng hết 2 lượt tìm lại — không lặp tiếp", status: "skip", ms: 0 },
  ],
  no_match: {
    findings: [
      "Rẻ nhất có ANC đã xác minh: Kestrel Studio Q — ≈ 1.270.000đ.",
      "Dưới 500.000đ có Bluetooth: chỉ Basswood Pod S (≈ 482.000đ) — không có ANC.",
    ],
  },
  pending_change: {
    id: "PC-1",
    title: "Đề xuất điều chỉnh — cần bạn chọn",
    options: [
      { key: "budget", title: "Tăng ngân sách", diff: { field: "Ngân sách", from: "≤ 500.000đ", to: "≤ 1.300.000đ" }, note: "Có căn cứ: 1 sản phẩm đạt (Kestrel Studio Q, ≈ 1.270.000đ).", text: "Đồng ý tăng ngân sách lên 1.300.000đ", next: "nomatch.budget" },
      { key: "anc", title: "Chuyển ANC thành ưu tiên", diff: { field: "ANC", from: "bắt buộc", to: "ưu tiên" }, note: "Có căn cứ: 1 sản phẩm đạt (Basswood Pod S, không có ANC).", text: "Chuyển ANC thành tiêu chí ưu tiên", next: "nomatch.anc" },
      { key: "keep", title: "Giữ nguyên mọi điều kiện", kind: "keep", note: "Không đổi gì; bạn vẫn tự duyệt danh mục được.", text: "Giữ nguyên điều kiện", next: "nomatch.keep" },
    ],
  },
};

const NOMATCH_BUDGET = {
  state: "ST-04", final_status: "OK", intent: "CONFIRM_CHANGE", catalog_version: "demo-synthetic-v1",
  message: "Đã áp dụng đúng một thay đổi bạn duyệt: ngân sách lên 1.300.000đ. Bluetooth và ANC vẫn bắt buộc. Có một sản phẩm đạt — bạn không có tiêu chí ưu tiên nên mình xếp theo chất lượng (Q).",
  context: { ...NOMATCH.context, version: 2, budget: { max_vnd: 1300000, label: "≤ 1.300.000đ" }, hard: [{ key: "connectivity", label: "Bluetooth" }, { key: "anc", label: "Chống ồn ANC" }, { key: "price", label: "≤ 1.300.000đ" }] },
  plan: [
    { label: "Áp dụng thay đổi đã duyệt", detail: "PC-1 · chỉ đổi ngân sách", status: "done", ms: 120 },
    { label: "Tìm & kiểm điều kiện", tool: "search_catalog", detail: "1 đạt", status: "done", ms: 100 },
    { label: "Kiểm định đầu ra", tool: "validate_output", status: "done", ms: 22 },
  ],
  recommendations: [
    { id: "B0DEMOHP03", rank: 1, score: { S: 87.5, F: null, Q: 87.5, E: 90 },
      hard_results: [{ label: "Bluetooth 5.2", result: "MATCH", evidence: ["D3"] }, { label: "Hybrid ANC", result: "MATCH", evidence: ["D5"] }, { label: "≈ 1.270.000đ ≤ 1,3 triệu", result: "MATCH" }],
      reasons: [{ text: "ANC được khen ở môi trường có quạt, xe cộ.", evidence: ["R1", "R2"] }],
      tradeoffs: [{ text: "Nóng tai sau khoảng hai giờ với một số người.", evidence: ["R3"] }], missing: [], limits: [] },
  ],
  excluded: [{ id: "B0DEMOHP05", name: "Lumen Calm ANC", reason: "Vẫn vượt ngân sách mới: ≈ 1.727.000đ." }],
  limits: ["Chỉ 1 sản phẩm đạt mọi điều kiện bắt buộc."],
};

const NOMATCH_ANC = {
  state: "ST-04", final_status: "OK", intent: "CONFIRM_CHANGE", catalog_version: "demo-synthetic-v1",
  message: "Đã chuyển ANC từ bắt buộc sang ưu tiên, ngân sách giữ ≤ 500.000đ. Basswood Pod S là sản phẩm duy nhất đạt — nhưng nó không có ANC, nên tiêu chí ưu tiên của bạn không được đáp ứng.",
  context: { ...NOMATCH.context, version: 2, hard: [{ key: "connectivity", label: "Bluetooth" }, { key: "price", label: "≤ 500.000đ" }], soft: [{ key: "anc", label: "Chống ồn ANC" }] },
  plan: [{ label: "Áp dụng thay đổi đã duyệt", detail: "PC-1 · ANC → ưu tiên", status: "done", ms: 110 }, { label: "Tìm & xếp hạng", tool: "search_catalog", detail: "1 đạt", status: "done", ms: 140 }],
  recommendations: [
    { id: "B0DEMOHP04", rank: 1, score: { S: 21.5, F: 0, Q: 77.5, E: 60 },
      hard_results: [{ label: "Bluetooth 5.3", result: "MATCH", evidence: ["D3"] }, { label: "≈ 482.000đ ≤ 500k", result: "MATCH" }],
      reasons: [{ text: "Đạt mọi điều kiện bắt buộc còn lại; pin đủ cả ngày.", evidence: ["R1"] }],
      tradeoffs: [{ text: "Không có ANC.", evidence: ["D7"] }], missing: [], limits: [] },
  ],
  limits: ["Tiêu chí ưu tiên (ANC) không được đáp ứng."],
};

const NOMATCH_KEEP = {
  state: "ST-06", final_status: "NO_MATCH", intent: "CONFIRM_CHANGE",
  message: "Đã giữ nguyên ba điều kiện của bạn. Catalog hiện không có tai nghe đáp ứng đủ — bạn vẫn có thể tự duyệt danh mục, hoặc quay lại khi catalog cập nhật.",
  context: NOMATCH.context,
  next_actions: [{ label: "Tự duyệt tai nghe Bluetooth", action: "browse-bt" }],
};

const OUT_OF_SCOPE = {
  state: "ST-09", final_status: "OUT_OF_SCOPE", intent: "OUT_OF_SCOPE",
  message: "SmartBuy chỉ tư vấn — không đặt hàng, không thanh toán, không theo dõi vận chuyển. Mình có thể cho bạn xem chi tiết và nguồn của Aurin Halo 2 để bạn tự mua ở nơi bạn tin cậy.",
  next_actions: [{ label: "Xem chi tiết Halo 2", action: "open-product", id: "B0DEMOHP01" }, { label: "So sánh với lựa chọn khác", text: "So sánh Halo 2 với các tai nghe Bluetooth dưới 1 triệu" }],
};

const OUT_OF_CATEGORY = {
  state: "ST-09", final_status: "OUT_OF_SCOPE", intent: "OUT_OF_SCOPE",
  message: "Laptop nằm ngoài phạm vi hiện tại — SmartBuy mới tư vấn tai nghe, chuột và bàn phím. Mình không đoán thông tin cho ngành hàng chưa có dữ liệu kiểm định.",
  next_actions: [{ label: "Chuột cho laptop", text: "Chuột nhỏ gọn đi kèm laptop" }, { label: "Bàn phím rời", text: "Bàn phím Bluetooth gọn cho laptop" }],
};

const TOOL_ERROR = {
  state: "ST-08", final_status: "TOOL_ERROR", intent: "FIND_PRODUCTS",
  message: "Không hoàn tất được vì công cụ tìm kiếm catalog bị lỗi. Đây là lỗi hệ thống — không có nghĩa là không có sản phẩm phù hợp.",
  context: { version: 1, category: "headphones", category_label: "Tai nghe", purpose: "Chơi game", budget: { max_vnd: 800000, label: "≤ 800.000đ" },
    hard: [{ key: "price", label: "≤ 800.000đ" }], soft: [{ key: "microphone", label: "Có micro" }], exclude: [] },
  plan: [
    { label: "Hiểu nhu cầu", status: "done", ms: 310 },
    { label: "Tìm trong catalog", tool: "search_catalog", detail: "Hết thời gian chờ (lần 1)", status: "error", ms: 8000 },
    { label: "Thử lại", tool: "search_catalog", detail: "Hết thời gian chờ (lần 2) — dừng, không tạo kết quả thay thế", status: "error", ms: 8000 },
  ],
  error: { type: "TOOL_ERROR", tool: "search_catalog", message: "timeout sau 2 lần thử", retry_count: 2 },
  next_actions: [{ label: "Thử lại", text: "Tai nghe gaming có mic dưới 800k", next: "error.retry" }, { label: "Tự duyệt danh mục", action: "browse-catalog" }],
};

export const SCENARIOS = [
  { key: "top3", st: "ST-04", label: "Có kết quả · Top 3", user: "Tai nghe Bluetooth dưới 1 triệu để học online, ưu tiên đeo thoải mái, có mic thì tốt.", response: TOP3 },
  { key: "clarify", st: "ST-02", label: "Cần làm rõ", user: "Mình cần mua một món để làm việc ở nhà", response: CLARIFY },
  { key: "partial", st: "ST-05", label: "Kết quả hạn chế", user: "Chuột không dây dưới 300k, pin càng lâu càng tốt", response: PARTIAL },
  { key: "nomatch", st: "ST-06 → 07", label: "Không có · đề xuất nới", user: "Tai nghe chống ồn ANC, Bluetooth, dưới 500k", response: NOMATCH },
  { key: "scope", st: "ST-09", label: "Ngoài phạm vi", user: "Đặt mua giúp mình con Aurin Halo 2 luôn nhé", response: OUT_OF_SCOPE },
  { key: "error", st: "ST-08", label: "Lỗi công cụ", user: "Tai nghe gaming có mic dưới 800k", response: TOOL_ERROR },
];

export const FOLLOWUPS = {
  "top3.raise": RAISED,
  "clarify.mouse": MOUSE_WORK,
  "nomatch.budget": NOMATCH_BUDGET,
  "nomatch.anc": NOMATCH_ANC,
  "nomatch.keep": NOMATCH_KEEP,
  "scope.category": OUT_OF_CATEGORY,
  "error.retry": TOOL_ERROR,
};

export const scenario = (key) => SCENARIOS.find((s) => s.key === key);
