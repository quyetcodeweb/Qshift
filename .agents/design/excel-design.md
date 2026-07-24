# Quy chuẩn thiết kế Excel — bảng phân công theo ca

Tài liệu này mô tả format đã được đối chiếu từ hai mẫu trong `LichShinbe.xlsx`. Khi tạo hoặc xuất bảng lịch, ưu tiên giữ nguyên cấu trúc và phong cách dưới đây thay vì tự chọn layout mới.

## 1. Mục tiêu và khung bảng

- Tên bảng: `BẢNG PHÂN CÔNG - THEO CA`.
- Dùng 11 cột, từ `A:K`, theo thứ tự: **STT**, **ngày**, sau đó 3 nhóm ca (mỗi nhóm 3 cột).
- Ba nhóm ca luôn xuất hiện theo thứ tự:
  1. `CA SÁNG 7H - 12H` — cột `C:E`.
  2. `CA CHIỀU 12H - 17H` — cột `F:H`.
  3. `CA TỐI 17H - 23H` — cột `I:K`.
- Mỗi nhóm ca có 3 vị trí: `THU NGÂN` ở cột đầu, `PHỤC VỤ` trải trên 2 cột còn lại. Tên nhân viên được điền vào từng ô vị trí.

| Cột | Nội dung             | Rộng tham chiếu |
| --- | -------------------- | --------------- |
| A   | STT ngày trong tháng | ~5.78           |
| B   | Ngày                 | ~8.7            |
| C:E | Ca sáng              | ~13.78/cột      |
| F:H | Ca chiều             | ~13.78/cột      |
| I:K | Ca tối               | ~13.78/cột      |

## 2. Cấu trúc hàng và vùng gộp

Mỗi bảng lịch gồm phần đầu 3 hàng và dữ liệu bắt đầu từ hàng thứ 4.

1. **Hàng 1 — tiêu đề:** gộp `A1:K1`, đặt tên bảng in hoa, đậm, căn giữa cả ngang lẫn dọc.
2. **Hàng 2 — nhóm ca:** gộp `C2:E2`, `F2:H2`, `I2:K2`; từng vùng chứa tên ca và khung thời gian. Cột A/B ở hàng này để trống nhưng vẫn có viền để giữ lưới đầy đủ.
3. **Hàng 3 — vai trò:** nhập `THU NGÂN` tại `C`, `F`, `I`; nhập `PHỤC VỤ` tại `D`, `G`, `J`. Các cột `E`, `H`, `K` không có nhãn nhưng vẫn là vị trí phục vụ thứ hai trong mỗi ca.
4. **Từ hàng 4:** mỗi hàng là một ngày. Cột A là số ngày; cột B là ngày thực tế. Điền nhân viên theo đúng ô vị trí của 3 ca.

Mẫu 1 đặt **hai bảng giống nhau trên cùng sheet**: bảng đầu `A1:K18`, một hàng trống ngăn cách, rồi bảng tiếp theo bắt đầu tại `A21:K39`. Mẫu 2 có một bảng từ `A1:K19`. Nếu số ngày vượt chiều cao trang, lặp lại đủ 3 hàng header ở đầu mỗi bảng/trang mới.

## 3. Kiểu chữ, căn chỉnh và kích thước

- Font chung: Calibri; riêng vùng dữ liệu tên người dùng cỡ khoảng 11 pt. Header vai trò dùng Arial 10 pt trong mẫu gốc, có thể giữ Calibri nếu không cần khớp tuyệt đối nhưng phải cùng độ đậm/kích thước hiển thị.
- Tiêu đề lớn: Calibri 14 pt, **đậm**, căn giữa.
- Header ca và vai trò: Calibri 12 pt **đậm** / Arial 10 pt; căn giữa ngang, giữa dọc, bật xuống dòng.
- Toàn bộ dữ liệu lịch căn giữa ngang và dọc, bật `wrap text`.
- Chiều cao hàng: khoảng **28.05 pt** cho tiêu đề, header và dữ liệu; hàng cuối có thể khoảng 27.6 pt. Không để hàng dữ liệu quá thấp khiến tên bị chật.
- Định dạng ngày trong cột B: `dd/mm`. Với ngày cần biểu thị thứ, mẫu dùng chuỗi như `06/07(T2)` hoặc `13/07(T2)`; có thể dùng text để giữ đúng cách hiển thị này.

## 4. Màu nền, viền và ý nghĩa ô

- Tất cả vùng `A:K` của bảng dùng **viền đen medium** ở bốn cạnh ô; lưới phải kín, không có khoảng trắng không viền trong phạm vi bảng.
- Header và phần lớn dữ liệu dùng nền xám nhạt `#E7E6E6`.
- Header tiêu đề/hàng ca/hàng vai trò dùng chữ đậm màu đen trên nền xám nhạt.
- Ô có nhân viên đã phân công: nền trắng hoặc xám rất nhạt, chữ đen, căn giữa.
- Ô trống chủ ý: để trống, nhưng vẫn có viền và căn giữa như các ô khác.
- Ô chưa có người/đang chờ xếp lịch: dùng ký tự `?`. Trong mẫu 1, các ô này được phân biệt bằng nền trắng; giữ quy ước này để người xem nhận ra cần xử lý.
- Không dùng màu cảnh báo mạnh, gradient, thẻ bo góc, hoặc bảng kiểu dashboard. Đây là biểu mẫu vận hành để in/đọc nhanh.

## 5. Quy tắc dữ liệu

- Giữ chữ hoa cho tên rút gọn/tên nhân viên như mẫu (`TRÀ`, `HIỀN`, `T.THỦY`, `QUỲNH`...).
- Mỗi ca có tối đa 3 tên tương ứng với 1 thu ngân và 2 phục vụ; không gộp ô dữ liệu của nhân viên.
- Không tự chèn công thức, tổng hợp hoặc cột chú thích vào trong vùng `A:K` nếu không được yêu cầu.
- Khi một ngày không có đủ người, để trống vị trí hoặc dùng `?` theo dữ liệu đầu vào; không tự suy đoán nhân sự.

## 6. In/xuất file

- Khổ giấy: A4, **landscape**.
- Căn giữa nội dung theo chiều ngang khi in; ưu tiên vừa một bảng theo chiều rộng trang.
- Duy trì lề hẹp/tiêu chuẩn, không cắt mất viền cột A hoặc K.
- Khi sinh nhiều trang, lặp lại ba hàng header của bảng trên đầu từng trang để người đọc không mất ngữ cảnh.

## Checklist cho AI trước khi xuất

- [ ] Có đúng 11 cột `A:K` và ba nhóm ca `C:E`, `F:H`, `I:K`.
- [ ] Tiêu đề và ba header ca dùng đúng vùng gộp.
- [ ] Mọi ô trong vùng bảng có viền đen medium và căn giữa dọc.
- [ ] Dòng dữ liệu cao khoảng 28 pt; tên không bị cắt hoặc tràn.
- [ ] Cột ngày dùng `dd/mm` hoặc `dd/mm(Tx)`; không hiển thị số serial Excel.
- [ ] Ô `?`/trống vẫn giữ lưới và không làm lệch cột.
- [ ] File in A4 ngang, toàn bộ bề rộng bảng nằm trong trang.
