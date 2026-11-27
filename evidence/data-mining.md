# Đào data — cách đếm và kết quả

> Điền ở guide bước 1.2. Ôn lại: ngày 2, ngày 6 · lab ngày 2, lab ngày 6.
> Không đào data thì xoá file này. Script / công thức đếm để trong repo (vd `evidence/count.py` hoặc ghi công thức Sheets ngay dưới), người khác chạy lại phải ra cùng số.
> Repo chỉ chứa số đã tổng hợp và vài dòng ví dụ — không chép lại nguyên file data.

## 1. Cách đếm — viết TRƯỚC khi chạy

- Data dùng: Amazon Reviews 2023, Electronics, revision `2b6d039ed471f2ba5fd2acb718bf33b0a7e5598e`; nguồn: https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023. Khoảng ngày review và ngày thu thập chưa được ghi trong tài liệu nguồn.
- Tập đầu vào: 7.173 review giữ lại bằng cách quét prefix, tối đa 20 review mỗi sản phẩm. Lấy mẫu cố định 200 review, seed `42`. SHA256 danh sách ID: `e512e1d484cb6d94d6fbbf796d4e06cf3d014f00fc5cb8a6f7eba19e78ea09cd`.
- Đếm review có căn cứ trực tiếp về khó khăn nghiên cứu/chọn trước mua. Quy tắc chỉ gán YES khi có bằng chứng trực tiếp, không đếm lỗi sau mua đơn thuần. Mỗi review đếm tối đa một lần. Người dùng đã xác nhận duyệt toàn bộ 200 dòng; cột reviewer ghi mã nguoi_dung_da_duyet.
- **Mẫu số:** 181 review đúng scope, sau khi loại 19 review ngoài scope khỏi mẫu 200. Đây là số review, không phải số người mua. Notebook quy định kiểm tra ngành hàng qua title/category và loại phụ kiện, combo.
- Script / công thức: [data-mining.ipynb](data-mining.ipynb), phần Pain Mining, đọc [pain_annotation_labeled.csv](pain_annotation_labeled.csv). `N = 200 - 19 = 181`; `x = số review đúng scope có nhãn YES = 13`; `100 × 13 / 181 = 7,18%` (làm tròn hai chữ số).

Kết quả ban đầu dẫn từ `E:\Downloads\data-mining.md`, sau đó đối chiếu notebook và đếm lại CSV nhãn: 200 ID duy nhất; 13 YES, 168 NO, 19 OUT_SCOPE; hash của danh sách ID đã sắp xếp khớp mẫu. Tất cả dòng có lý do và mã reviewer; 13 trích dẫn YES nằm trong text/title, không quá 20 từ, có pain_type hợp lệ. Chưa xác minh tính đúng đắn ngữ nghĩa của từng nhãn hoặc chạy lại toàn bộ quy trình thu thập. Notebook đã cố định revision đã ghi ở trên. Chưa có bằng chứng quy tắc đã được viết trước khi chạy.

### Chạy lại phép đếm

Từ thư mục gốc repo, chạy lệnh dùng thư viện chuẩn Python:

```text
python evidence/count_pain.py
```

Đã chạy và nhận `YES=13, NO=168, OUT_SCOPE=19`, `Pain: 13/181 = 7.18%`; hash khớp mẫu. Script kiểm ID, nhãn, lý do, reviewer và trích dẫn rồi tính tỷ lệ từ CSV. Đây là tái lập phép tổng hợp, không phải chạy lại thu thập dữ liệu.

Để tái lập từ Amazon, mở `evidence/data-mining.ipynb` trên Colab, chạy tuần tự với revision đã cố định, đến cell cuối tải `evidence/pain_annotation_labeled.csv` lên. Đối chiếu hash mẫu và số đếm với kết quả trên. Notebook vẫn giữ output của lượt chạy đã cung cấp; chưa chạy mới toàn bộ trong lần cập nhật này.

## 2. Đọc trước, đếm sau

Nguồn chưa ghi số dòng đã đọc trước hoặc từ điển cột; không suy ra số này từ mẫu 200 review. Các kiểu nội dung trong năm ví dụ được cung cấp là:
- Kỳ vọng về tính năng/quảng cáo khác với trải nghiệm thực tế.
- Chưa biết một tính năng là tùy chọn khi chọn sản phẩm.
- Thử và trả nhiều mẫu trước khi tìm được mẫu phù hợp, theo diễn giải của nguồn.

Đây là nhận xét từ ví dụ, không phải nhật ký quan sát trước khi đếm.

## 3. Kết quả

| Đếm gì | x / N | % | Ghi chú |
|---|---|---|---|
| Review ngoài scope | 19/200 | 9,50% | Mẫu số là toàn bộ mẫu cố định |
| Review đúng scope | 181/200 | 90,50% | Tập dùng để tính tỷ lệ pain |
| Review được gán nhãn có pain trực tiếp | 13/181 | 7,18% | Đã đếm lại CSV; người dùng xác nhận duyệt nhãn |

Ghi dạng "x/N (y%)". "Nhiều bạn…" không phải số.

## 4. ≥5 ví dụ cụ thể (mã dòng / mã đã ẩn danh, không đoán ai là ai)

Các mã P01–P05 dưới đây là nhãn pain của nguồn, không phải người phỏng vấn P1–P3; chưa có bảng định nghĩa để ánh xạ sang PAIN-01–PAIN-08 trong summary.

| ID review | ASIN | Pain | Trích dẫn ngắn | Lý do |
|---|---|---|---|---|
| 069312b605b7117e278adefebe9ef92c9dcf2787f48a9d7a0596664d73cc8f61 | B08L3SJPTY | P05 | Promised magnets are weak and useless. | Người mua đối chiếu lời hứa về nam châm với trải nghiệm thực tế không hữu ích; đặc tính được giới thiệu trước mua không đúng kỳ vọng. |
| 0bb1bbe2236be151c8ec207d4c0372a44e851c1723803e2f8f0c34f6c24b1a6b | B0041YSRA6 | P02 | the noise-canceling feature is the main reason that I purchased this particular set of headphones, rather than cheaper models. | Chọn mẫu đắt hơn vì tính năng chống ồn được giới thiệu nhưng trải nghiệm cho thấy không hiệu quả; kỳ vọng về tính năng ảnh hưởng trực tiếp quyết định mua. |
| 2098c97b6a38a10685de9c717bd493239d0839fe8831c9a7775349471e1d1595 | B09KC8TP4H | P05 | Definitely advertised as a quiet click mouse and it is not | Quảng cáo chuột click êm nhưng người dùng xác nhận thực tế không như vậy; thông tin tính năng trước mua gây hiểu nhầm. |
| 224544c71e53405b27ea9e5fd973bb9b644618daacc0415c37b6f1d55a32437c | B087679W1N | P01 | I didn't know volume control on a keyboard was optional. | Người mua không biết phím điều chỉnh âm lượng là tính năng tùy chọn, sau mua phát hiện thiếu và muốn trả; lỗ hổng hiểu biết trước khi chọn. |
| 389115ee248bfbacf640f15e08c8442139b34665b8a7c5f0788baa09c6d0ef31 | B013ILR8ZC | P04 | Well, I finally found a good set of phones. | Người mua phải thử và trả nhiều mẫu Status, Sennheiser trước khi tìm được mẫu phù hợp; thể hiện khó chọn đúng sản phẩm, mất công mua thử. |

Các trích dẫn ngắn chưa chứa đầy đủ căn cứ cho phần diễn giải. Ví dụ nam châm và click êm có thể chỉ là thất vọng sau mua; ví dụ chống ồn và thử nhiều mẫu cần thêm ngữ cảnh để xác nhận khó khăn trước mua. Người dùng đã xác nhận duyệt bảng nhãn; giữ kết quả 13 YES. Các đoạn trích ngắn không thay thế toàn bộ ngữ cảnh review.

## 5. Giới hạn của data

- Mẫu từ tập review đã thu thập theo prefix, giới hạn 20 review mỗi sản phẩm; không đại diện mọi khách hàng. Tỷ lệ 7,18% là tỷ lệ review, không phải tỷ lệ người mua.
- Chưa xác minh số người viết duy nhất. Review sau mua không bao phủ người bỏ cuộc trước khi mua.
- Người dùng đã xác nhận duyệt cả 200 dòng. Chưa đo độ đồng thuận giữa các người chấm độc lập.
- Đã có notebook và CSV để kiểm phép tổng hợp từ nhãn, nhưng chưa chạy lại bước thu thập. Không suy ra thời gian mất hoặc tần suất gặp pain từ tỷ lệ này. CSV công khai đã rút gọn; bản gốc raw-* được Git bỏ qua. Khi cần kiểm trích dẫn với toàn văn, dùng bản gốc cục bộ hoặc chạy notebook để truy xuất lại dữ liệu.

→ Đối chiếu với [P1](interviews/P1.md) về quá tải thông tin, [P2](interviews/P2.md) về chất lượng và giá, [P3](interviews/P3.md) về review trái chiều; xem khảo sát trong [summary.md](summary.md). Không cộng số review với số người khảo sát hoặc so sánh trực tiếp tỷ lệ giữa các mẫu khác nhau.

**Trạng thái:** đã đối chiếu hash và đếm lại 13/181 từ CSV, có notebook và 5 ví dụ; người dùng đã xác nhận duyệt nhãn; đã cố định revision và chạy lại phép đếm bằng count_pain.py. Đạt các tiêu chí x/N, tỷ lệ, ≥5 ví dụ và cách đếm tái lập ghi trong summary; chưa kết luận thay cho toàn bộ rubric BTC.
