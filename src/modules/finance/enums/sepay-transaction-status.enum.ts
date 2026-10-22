export enum SepayTransactionStatus {
  // Đã khớp lệnh nạp và cộng ví.
  MATCHED = 'MATCHED',
  // Tiền vào nhưng không khớp lệnh nạp nào; chờ admin xử lý.
  UNMATCHED = 'UNMATCHED',
  // Admin đã cộng ví thủ công cho giao dịch chưa khớp.
  RESOLVED = 'RESOLVED',
  // Không cần xử lý: tiền ra, hoặc admin đánh dấu bỏ qua.
  IGNORED = 'IGNORED',
}
