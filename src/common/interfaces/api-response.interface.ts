/**
 * 공통 API 응답 인터페이스
 */
export interface ApiResponse<T = unknown> {
  status: number;
  code: string | null;
  message: string | null;
  data: T;
}
