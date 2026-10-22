/**
 * Vòng đời một giao dịch ngân hàng SePay báo về (webhook hoặc sync):
 * RECEIVED -> PROCESSED | IGNORED | NEEDS_REVIEW; NEEDS_REVIEW -> RESOLVED | IGNORED (admin).
 */
export enum PaymentWebhookEventStatus {
  RECEIVED = 'RECEIVED',
  PROCESSED = 'PROCESSED',
  IGNORED = 'IGNORED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  RESOLVED = 'RESOLVED',
}
