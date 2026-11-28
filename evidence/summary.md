# Tổng hợp bằng chứng pain

> Điền ở guide bước 1.2, xong trước **CP3 10:00 Thứ Bảy 28/11**. Chấm ở rubric R1.
> Ba nguồn ngang nhau — tối thiểu **≥1 nguồn đạt ngưỡng**. Mạnh nhất: đào data ra insight → hỏi người dùng để kiểm lại (hoặc ngược lại).

## 1. Nguồn đã dùng

| Nguồn | Đạt ngưỡng? | File |
|---|---|---|
| Đào data (x/N, %, cách đếm chạy lại được, ≥5 ví dụ) | ☑ Đạt các tiêu chí ghi trong bảng: có x/N, tỷ lệ, ≥5 ví dụ và lệnh đếm lại từ CSV đã duyệt. Đã chạy count_pain.py: 13/181 (7,18%), hash mẫu khớp. Notebook đã cố định revision; chưa chạy lại toàn bộ bước thu thập. | [data-mining.ipynb](data-mining.ipynb), [pain_annotation_labeled.csv](pain_annotation_labeled.csv), [data-mining.md](data-mining.md) |
| Phỏng vấn (≥3 người ngoài nhóm, đúng người dùng) | ☑ Ba người ngoài nhóm đã kể trải nghiệm tìm tai nghe; thời điểm trải nghiệm P1/P3 chưa xác nhận | `evidence/interviews/P1.md`, `P2.md`, `P3.md` |
| Khảo sát (≥20 người ngoài nhóm, đúng người dùng) | ☑ 21 phản hồi; 20 người đã tìm hiểu/mua trong 6 tháng, 1 người chưa từng nên loại khỏi phân tích pain. Chưa có trường xác nhận người ngoài nhóm. | [Google Sheets, tab Câu trả lời biểu mẫu 1](https://docs.google.com/spreadsheets/d/1GSvQyDX7Dx9kdQpkZVqW6PHRHNYZ8bbRBDXF09PN0PI/edit#gid=680797427), hàng 2–22 |

Nguồn bổ trợ đã tổng hợp trong CI-01 (nghiên cứu thứ cấp, không tự động thay thế ba phương thức trên):

| ID | Nguồn | Phát hiện liên quan |
|---|---|---|
| EV-01 | Havas Commerce, Purchasing Power Vietnam 2025, tr. 30, Q25–Q26 | 62% cân nhắc mua đồ công nghệ trong vài ngày hoặc ít nhất một tuần. Mẫu khảo sát Việt Nam gồm 1.001 người; chưa xác minh mẫu số riêng của câu hỏi. |
| EV-02 | Baymard Institute, Product Lists UX | Tỷ lệ từ bỏ tác vụ tìm sản phẩm 67–90% ở website có danh sách chưa tốt, so với 17–33% ở website có công cụ tối ưu hơn trong nghiên cứu usability. |
| EV-03 | PowerReviews, The Ever-Growing Power of Reviews (2023 Edition) | Trong khảo sát 8.153 người tiêu dùng Mỹ, 93% cho biết rating/review ảnh hưởng quyết định mua; 56% ít tin điểm sao đơn thuần hơn khi có review văn bản. |
| EV-04 | Mai Văn Cương, Lê Văn Bằng, Thương mại điện tử và người tiêu dùng Việt Nam: niềm tin và xu hướng, 17/03/2026, bảng 2–3 | Nghiên cứu báo cáo 1.200 người khảo sát và 18 phỏng vấn; 68% lo hàng kém chất lượng, 65% lo hàng không đúng mô tả. |
| EV-05 | PwC, Voice of the Consumer Survey 2024 – Vietnam highlights | Trong mẫu 515 người tại Việt Nam, 67% sử dụng điện thoại để mua sắm thường xuyên; đây là căn cứ về kênh, không trực tiếp chứng minh core pain. |

Các số liệu trên được dẫn lại từ CI-01, không phải kết quả khảo sát của nhóm. Không suy ra x/N chính xác từ tỷ lệ đã làm tròn hoặc từ cỡ mẫu toàn nghiên cứu. Nguồn gốc và giới hạn xem CI-01, mục Evidence và Evidence registry.

## 2. Số chính

- Đào data: output đã lưu trong [data-mining.ipynb](data-mining.ipynb), phần “Pain Mining”, ghi **13/181 review (7,18%)** có nhãn YES. Notebook quét 2.000.000 review, giữ lại 7.173 review cho các sản phẩm ứng viên, tối đa 20 review/sản phẩm; lấy mẫu 200 review với seed 42 rồi loại 19 review ngoài scope. Hash mẫu đã lưu khớp `e512e1d484cb6d94d6fbbf796d4e06cf3d014f00fc5cb8a6f7eba19e78ea09cd` trong data-mining.md. Mỗi review đếm tối đa một lần; tỷ lệ này không phải tỷ lệ người mua. Đã đối chiếu code/output và chạy count_pain.py trên CSV đầu vào; chưa chạy lại toàn bộ notebook.
- Phỏng vấn: 3/3 người kể khó khăn cụ thể khi tìm tai nghe (n nhỏ, không ghi %). Chưa hỏi tần suất trong 30 ngày. Cả ba là sinh viên; chưa có người mua chuột hoặc bàn phím.
- Khảo sát: 21 phản hồi, 20 người đúng trải nghiệm mục tiêu (8 tai nghe, 6 chuột, 6 bàn phím). Trong 20 người này, 16 chọn khó khăn về review, 14 chọn quá nhiều sản phẩm, 12 khó so sánh, 12 không biết mẫu phù hợp, 10 khó cân đối tính năng và ngân sách, 8 khó hiểu thông số, 8 khó tin/xác minh tư vấn, 7 phải tìm lại khi đổi tiêu chí. Đây là câu nhiều lựa chọn nên các số không cộng thành 20. 14/20 đánh giá mức ảnh hưởng 4–5; 6/20 vẫn phân vân, 6/20 tiếp tục tìm hoặc trì hoãn, 2/20 từ bỏ mua. Mẫu tự chọn, chưa kiểm tra trùng người hoặc quan hệ với nhóm.
- Bằng chứng thứ cấp: EV-01–04 hỗ trợ bối cảnh nghiên cứu trước mua, khó khăn tìm sản phẩm, vai trò review và lo ngại thông tin không đáng tin. EV-05 hỗ trợ lựa chọn kênh giao diện.

Đối tượng cần kiểm chứng: người tiêu dùng phổ thông ngoài nhóm đã tìm hiểu hoặc mua tai nghe, chuột hoặc bàn phím. Nếu phỏng vấn người có vai trò khác, thống kê riêng theo vai trò.

Phân bố nhãn theo output cuối notebook (tên ngành hàng lấy từ `smartbuy_category`):

| Ngành hàng | YES | NO | OUT_SCOPE | Mẫu số đúng scope (YES + NO) |
|---|---|---|---|---|
| Tai nghe | 8 | 123 | 13 | 131 |
| Bàn phím | 4 | 21 | 4 | 25 |
| Chuột | 1 | 24 | 2 | 25 |
| Tổng | 13 | 168 | 19 | 181 |

Notebook kiểm tra ID không trùng và khớp mẫu, nhãn thuộc YES/NO/OUT_SCOPE, có lý do và mã người chấm, trích dẫn YES nguyên văn và tối đa 20 từ. Các kiểm tra này xác minh cấu trúc dữ liệu; người dùng đã xác nhận duyệt nội dung nhãn. Để chạy lại, mở notebook trên Colab, cố định revision `2b6d039ed471f2ba5fd2acb718bf33b0a7e5598e`, chạy các bước tạo `review_pool` và mẫu, rồi tải CSV đã gán nhãn vào cell cuối. Notebook đã cố định revision trên. Để kiểm phép đếm từ CSV hiện có, chạy `python evidence/count_pain.py` tại thư mục gốc repo. Lệnh này đã chạy thành công, kiểm 200 ID duy nhất, hash, nhãn, lý do, reviewer và các trích dẫn YES rồi tính 13/181 = 7,18%.

| | Vai | Gặp pain? | Số lần / 1 tháng qua | Lần gần nhất mất | Đang xoay xở bằng |
|---|---|---|---|---|---|
| P1 | Sinh viên tìm tai nghe | Có: quá tải thông tin, khó chọn mẫu phù hợp | Chưa hỏi | Ước lượng 1–2 giờ cho cả quá trình | Shopee, TikTok, review, so sánh giá; dùng AI so sánh |
| P2 | Sinh viên mua tai nghe | Có: khó tìm chất lượng tốt trong tầm giá | Chưa hỏi | 2 tuần theo lịch; chưa rõ số giờ thực tìm | Lọc theo giá, đọc review; mua ở shop KOL tin tưởng |
| P3 | Sinh viên tìm tai nghe Bluetooth | Có: review trái chiều, mất công so sánh | Chưa hỏi | 2–3 ngày, mỗi ngày 30–60 phút; tổng 60–180 phút là suy ra | Shopee, TikTok, YouTube, bình luận người mua |

### Pain registry (căn cứ cho metric spec)

| ID | Pain point | Tác động người dùng | Bằng chứng / giới hạn |
|---|---|---|---|
| PAIN-01 | Không hiểu thuật ngữ, thông số | Khó chọn tiêu chí phù hợp | Khảo sát 8/20 chọn; P1 thấy thông số rườm rà |
| PAIN-02 | Quá nhiều sản phẩm tương tự | Mất công thu hẹp lựa chọn | Khảo sát 14/20 chọn; P1 choáng ngợp nhiều nguồn |
| PAIN-03 | Thông tin khó so sánh | Mất thời gian đối chiếu | Khảo sát 12/20 chọn; P3 kể tình huống hai mẫu giá gần nhau nhưng review trái chiều |
| PAIN-04 | Review nhiều, phân tán, trái chiều | Phải tìm thêm nhiều nơi | Khảo sát 16/20 chọn; P3, Q03/Q05 |
| PAIN-05 | Không biết sản phẩm hợp với mình | Khó ra quyết định | Khảo sát 12/20 chọn; P1, Q03 |
| PAIN-06 | Khó cân đối nhu cầu và ngân sách | Chưa hài lòng về giá | Khảo sát 10/20 chọn; P2, Q03/Q05 |
| PAIN-07 | Thiếu tin tưởng tư vấn | Cần kiểm tra lại nhiều nguồn | Khảo sát 8/20 chọn; phỏng vấn chưa xác nhận trực tiếp |
| PAIN-08 | Đổi tiêu chí phải tìm lại | Lặp công việc | Khảo sát 7/20 chọn; phỏng vấn chưa kể tình huống cụ thể |

## 3. ≥5 trích dẫn hoặc ví dụ nguyên văn (có nguồn, bỏ tên)

Đào data có 5 trích dẫn kèm ID review và ASIN tại [data-mining.md §4](data-mining.md#4-5-ví-dụ-cụ-thể-mã-dòng--mã-đã-ẩn-danh-không-đoán-ai-là-ai). Ví dụ: “I didn't know volume control on a keyboard was optional.” — ASIN `B087679W1N`, review `224544c71e53405b27ea9e5fd973bb9b644618daacc0415c37b6f1d55a32437c`. Đây là dấu hiệu thiếu thông tin khi lựa chọn; chưa đủ để xác nhận toàn bộ 13 nhãn pain. Notebook định nghĩa P01 là thiếu/khó hiểu thông tin, P02 là kỳ vọng sai do thông tin trước mua, P03 là mua nhầm vì thông tin tương thích, P04 là khó so sánh/chọn, P05 là mô tả gây hiểu nhầm. Các mã này không phải mã người phỏng vấn và không đồng nhất với PAIN-01–PAIN-08 trong registry.

Sáu trích dẫn nguyên văn từ ba biên bản phỏng vấn, đã ẩn danh:

1. “Trong lúc tìm kiếm sản phẩm phù hợp tôi bị choáng ngợp bởi nhiều nguồn thông tin và thông số rờm rà của mỗi sản phẩm từ đó khó đưa ra quyết định vì không biết mình thật sự phù hợp với sản phẩm nào” — P1, Q03.
2. “Tôi dùng AI để so sánh các sản phẩm với nhau từ đó tìm ra được sản phẩm phù hợp với mục đích sử dụng của mình” — P1, Q05.
3. “Phần khó nhất là tìm sản phẩm có chất lượng đảm bảo nhất trong phân khúc giá hợp lý, việc này khiến mình phải liên tục tìm hiểu, xem đánh giá và đọc review. Vô cùng mất thời gian” — P2, Q03.
4. “Mình quyết định tìm đến shop uy tín của kol mình hay theo dõi để mua, nhưng cũng không ưng ý lắm về giá” — P2, Q05.
5. “Mình mất khá nhiều thời gian ở bước so sánh sản phẩm vì mỗi người review một kiểu. Có hai mẫu tai nghe giá gần bằng nhau nhưng đánh giá về chất lượng âm thanh và pin lại trái ngược nhau. Mình phải tìm thêm review từ nhiều nguồn mới quyết định được.” — P3, Q03.
6. “Mình xem thêm review trên YouTube và đọc bình luận của những người đã mua. Cách này cũng khá hiệu quả, giúp mình dễ quyết định hơn nhưng hơi mất thời gian vì phải tìm thông tin ở nhiều nơi.” — P3, Q05.

Ví dụ nguyên văn từ câu trả lời mở của khảo sát (số hàng trên tab được liên kết ở mục 1):

- “Quan trọng nhất vẫn là trải nghiệm trực tiếp, mà cái bàn phím tôi định mua thì không có nơi cho trải nghiệm trực tiếp.” — hàng 7.
- “Mình thấy quá nhiều ý kiến không biết nên mua hay không” — hàng 16.
- “lười đọc đánh giá mà lại cần đánh giá để biết đáng mua không” — hàng 19.

Năm phát hiện sau là **diễn giải số liệu thứ cấp**, không phải lời trích nguyên văn:

1. 62% cân nhắc mua đồ công nghệ trong vài ngày hoặc ít nhất một tuần — EV-01, tr. 30, Q25–Q26.
2. Tỷ lệ từ bỏ tác vụ tìm sản phẩm 67–90% với danh sách chưa tốt, so với 17–33% với công cụ tối ưu hơn — EV-02, nghiên cứu Product Lists UX.
3. 93% người trả lời cho biết rating/review ảnh hưởng đến quyết định mua — EV-03, khảo sát 2023.
4. 56% ít tin điểm sao đơn thuần hơn điểm sao có review văn bản — EV-03, khảo sát 2023.
5. 65% lo nhận hàng không đúng mô tả — EV-04, bảng 2–3.

Các phát hiện thứ cấp trên chỉ là bối cảnh bổ trợ, không tính vào sáu trích dẫn phỏng vấn.

## 4. Các nguồn có khớp nhau không

Nghiên cứu thứ cấp tương đối nhất quán về sự tồn tại của giai đoạn nghiên cứu trước mua, vai trò của review, khó khăn trong tìm kiếm và nhu cầu về độ tin cậy thông tin. EV-01/02 hỗ trợ vấn đề tìm hiểu và thu hẹp lựa chọn; EV-03/04 hỗ trợ nhu cầu bằng chứng và thông tin đáng tin cậy.

P1 xác nhận quá tải thông tin; P2 khó cân đối chất lượng và giá; P3 gặp review trái chiều và phải tìm nhiều nguồn. Khảo sát cũng ghi nhận 14/20 chọn quá nhiều sản phẩm, 10/20 khó cân đối và 16/20 khó khăn về review. Đây là sự khớp giữa lời kể và lựa chọn trên phiếu, chưa phải kiểm chứng độc lập trên mẫu đại diện. EV-03 khảo sát người Mỹ; EV-01 xét ngành Electronics & Tech rộng hơn. P1 đã dùng AI, P2 tin shop của KOL, P3 thấy việc xem thêm review khá hiệu quả dù tốn thời gian. Khảo sát có 7/20 chọn phải tìm lại khi đổi tiêu chí, nhưng phỏng vấn chưa có tình huống cụ thể.

Đào data bổ sung dấu hiệu về khoảng cách giữa thông tin/kỳ vọng trước mua và trải nghiệm sau mua: chưa biết tính năng là tùy chọn, quảng cáo click êm không khớp thực tế, hoặc phải thử nhiều mẫu theo diễn giải của nguồn. Điều này có liên hệ với khó chọn sản phẩm phù hợp và nhu cầu kiểm chứng thông tin trong phỏng vấn/khảo sát. Tuy nhiên, các trích dẫn ngắn về nam châm hoặc click êm có thể chỉ phản ánh thất vọng sau mua; cần đọc thêm ngữ cảnh và rà nhãn trước khi coi là pain nghiên cứu trước mua.

Không cộng 181 review với 20 người khảo sát hoặc 3 người phỏng vấn. Tỷ lệ 7,18% review được gán nhãn và các tỷ lệ lựa chọn trên khảo sát có đơn vị, cách chọn mẫu, câu hỏi khác nhau; không dùng chênh lệch này để kết luận các nguồn mâu thuẫn. Mẫu review theo prefix, giới hạn 20 review mỗi sản phẩm cũng không đại diện mọi khách hàng.

## 5. Kết luận

Giả thuyết nghiệp vụ theo CI-01: người tiêu dùng phổ thông khó chuyển thông tin sản phẩm, thông số và review thành lựa chọn phù hợp với nhu cầu và ngân sách khi nghiên cứu trước mua tai nghe, chuột hoặc bàn phím.

Đánh giá: **pain được hỗ trợ bởi ba cuộc phỏng vấn và 20 phiếu khảo sát đúng trải nghiệm mục tiêu**. Khảo sát đã có cả tai nghe, chuột và bàn phím, nhưng chưa xác nhận người trả lời đều ngoài nhóm hoặc các phiếu là người khác nhau. `evidence/hypothesis.md` được bổ sung sau thu thập dữ liệu ngày 28/11/2026; không có ngưỡng đặt trước được ghi nhận cho dữ liệu hiện có, nên không thể kết luận đạt hay trượt theo một giả thuyết đã đăng ký trước. Tiêu chí đề xuất trong file chỉ dành cho vòng kiểm chứng mới, không áp dụng hồi tố. Không suy rộng các tỷ lệ sang toàn bộ người tiêu dùng.

Kết quả đào data 13/181 review đã được đếm lại trực tiếp từ CSV nhãn trong repo, khớp output notebook và hash mẫu. Đây là xác minh phép tổng hợp từ nhãn có sẵn, chưa phải chạy lại toàn bộ bước thu thập từ Amazon. Người dùng đã xác nhận duyệt toàn bộ bảng nhãn. Notebook đã cố định revision; phép đếm từ bảng nhãn được tái lập bằng count_pain.py. Việc đánh dấu đạt ở bảng nguồn áp dụng cho tiêu chí hiển thị trong summary, chưa thay thế đánh giá theo toàn bộ rubric của BTC. CSV công khai đã rút gọn còn ID, nhãn, loại pain, trích dẫn ngắn, lý do và mã người duyệt; bản gốc raw-* chỉ giữ cục bộ và được Git bỏ qua.

Điều vẫn chưa biết: tần suất pain riêng (khác số lần tìm mua) trong một tháng, thời điểm trải nghiệm của P1/P3, thời gian thực tìm kiếm của P2, thời gian riêng tại bước khó, tính độc lập của 21 phiếu, độ tin cậy của nhãn review và sự khác biệt có ý nghĩa giữa ba ngành hàng.

Pain được hỗ trợ rõ nhất: PAIN-02/03/04/05/06. PAIN-01/07/08 có người chọn trong khảo sát nhưng thiếu tình huống phỏng vấn cụ thể; cần kiểm chứng sâu thêm.

## Lịch hẹn (dùng cho CP2 — chỉ ghi vai và giờ, không tên)

| Vai | Giờ hẹn | Đã xong? |
|---|---|---|
| Sinh viên mua tai nghe (P1) | 18:00 27/11/2026 | Có |
| Sinh viên mua tai nghe (P2) | 18:12 27/11/2026 | Có |
| Sinh viên mua tai nghe (P3) | 18:25 27/11/2026 | Có |
