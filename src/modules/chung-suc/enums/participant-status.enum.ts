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

// Trạng thái admin được chuyển tới, theo trạng thái hiện tại. Hủy (CANCELLED)
// là thao tác của khách; SUCCESS/PARTIAL_SUCCESS/FAILED là trạng thái cuối.
// Đổi trạng thái chưa tạo đơn hay trừ ví: chính sách tính tiền còn chờ chốt
// (docs/business/chung-suc.md, mục 7).
export const ADMIN_STATUS_TRANSITIONS: Partial<
  Record<ParticipantStatus, ParticipantStatus[]>
> = {
  [ParticipantStatus.PENDING]: [
    ParticipantStatus.CHECKING,
    ParticipantStatus.PROCESSING,
    ParticipantStatus.FAILED,
  ],
  [ParticipantStatus.CHECKING]: [
    ParticipantStatus.PROCESSING,
    ParticipantStatus.FAILED,
  ],
  [ParticipantStatus.PROCESSING]: [
    ParticipantStatus.SUCCESS,
    ParticipantStatus.PARTIAL_SUCCESS,
    ParticipantStatus.FAILED,
  ],
};
