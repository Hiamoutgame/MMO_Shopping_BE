export enum ParticipantStatus {
  PENDING = 'PENDING',
  CHECKING = 'CHECKING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Yêu cầu còn "mở" thì mã mời của nó chưa được gửi lại trong cùng campaign.
export const OPEN_PARTICIPANT_STATUSES = [
  ParticipantStatus.PENDING,
  ParticipantStatus.CHECKING,
  ParticipantStatus.PROCESSING,
];
