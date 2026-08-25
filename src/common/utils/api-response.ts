export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message: string;
  errorCode: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function createApiResponse<T>(data: T, message = 'OK'): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    errorCode: null,
  };
}

export function createPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  message = 'OK',
): ApiResponse<PaginatedResult<T>> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    success: true,
    data: {
      items,
      total,
      page,
      pageSize,
      totalPages,
    },
    message,
    errorCode: null,
  };
}
