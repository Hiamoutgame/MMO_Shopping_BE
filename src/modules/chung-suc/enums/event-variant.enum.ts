// Các biến thể sự kiện chung sức thường gặp. CUSTOM dùng khi mùa mới có luật khác.
export enum EventVariant {
  XAP_XINH = 'XAP_XINH',
  DOT_PHAO = 'DOT_PHAO',
  TINH_HOA = 'TINH_HOA',
  BAN_BI = 'BAN_BI',
  CUSTOM = 'CUSTOM',
}

// Luật của một sự kiện. null = không giới hạn.
export interface EventRules {
  // Số lượt một tài khoản hỗ trợ được đi giúp, theo ngày và toàn sự kiện.
  helperLimitPerDay: number | null;
  helperLimitTotal: number | null;
  // Số lượt một mã mời (chủ mã) nhận được, theo ngày và toàn sự kiện.
  ownerLimitPerDay: number | null;
  ownerLimitTotal: number | null;
  // Điểm tối đa một mã tích được (VD Xập Xình: 1000).
  pointsCap: number | null;
  // true: các giới hạn "theo ngày" reset lúc 00:00 giờ Việt Nam.
  dailyReset: boolean;
}

export interface EventVariantPreset extends EventRules {
  variant: EventVariant;
  label: string;
  description: string;
}

// Giá trị mặc định khi admin chọn biến thể; admin vẫn sửa được từng trường.
export const EVENT_VARIANT_PRESETS: Record<EventVariant, EventVariantPreset> = {
  [EventVariant.XAP_XINH]: {
    variant: EventVariant.XAP_XINH,
    label: 'Chung Sức Xập Xình',
    description:
      'Mỗi tài khoản giúp 1 lần cho cả sự kiện. Acc quay lại cho nhiều điểm hơn acc thường.',
    helperLimitPerDay: null,
    helperLimitTotal: 1,
    ownerLimitPerDay: null,
    ownerLimitTotal: null,
    pointsCap: 1000,
    dailyReset: false,
  },
  [EventVariant.DOT_PHAO]: {
    variant: EventVariant.DOT_PHAO,
    label: 'Chung Sức Đốt Pháo',
    description: 'Mỗi lượt giúp cộng lượt đốt pháo. Reset 00:00 mỗi ngày.',
    helperLimitPerDay: 2,
    helperLimitTotal: null,
    ownerLimitPerDay: 10,
    ownerLimitTotal: null,
    pointsCap: null,
    dailyReset: true,
  },
  [EventVariant.TINH_HOA]: {
    variant: EventVariant.TINH_HOA,
    label: 'Tinh Hoa Hội Tụ',
    description: 'Mốc thưởng 300 / 800 / 2500 tinh hoa. Reset 00:00 mỗi ngày.',
    helperLimitPerDay: 2,
    helperLimitTotal: null,
    ownerLimitPerDay: 3,
    ownerLimitTotal: null,
    pointsCap: 2500,
    dailyReset: true,
  },
  [EventVariant.BAN_BI]: {
    variant: EventVariant.BAN_BI,
    label: 'Bắn Bi Trúng Quà',
    description:
      'Mỗi lượt giúp đổi thành lượt bắn bi. Tối đa 4 lượt cho 1 mã trong cả sự kiện.',
    helperLimitPerDay: 3,
    helperLimitTotal: null,
    ownerLimitPerDay: null,
    ownerLimitTotal: 4,
    pointsCap: null,
    dailyReset: true,
  },
  [EventVariant.CUSTOM]: {
    variant: EventVariant.CUSTOM,
    label: 'Tuỳ chỉnh',
    description: 'Tự nhập toàn bộ luật cho mùa sự kiện mới.',
    helperLimitPerDay: null,
    helperLimitTotal: null,
    ownerLimitPerDay: null,
    ownerLimitTotal: null,
    pointsCap: null,
    dailyReset: false,
  },
};
