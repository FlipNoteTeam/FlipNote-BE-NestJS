import { ApiResponse } from '../interfaces/api-response.interface';

/**
 * 성공 응답 생성 헬퍼 함수
 * @param data 응답 데이터
 * @param status HTTP 상태 코드 (기본값: 200)
 * @param message 응답 메시지 (기본값: null)
 * @returns ApiResponse 객체
 */
export function successResponse<T>(
  data: T,
  status = 200,
  message: string | null = null,
): ApiResponse<T> {
  return {
    status,
    code: null,
    message,
    data,
  };
}

/**
 * 에러 응답 생성 헬퍼 함수
 * @param code 에러 코드
 * @param message 에러 메시지
 * @param status HTTP 상태 코드 (기본값: 400)
 * @returns ApiResponse 객체
 */
export function errorResponse(
  code: string,
  message: string,
  status = 400,
): ApiResponse<null> {
  return {
    status,
    code,
    message,
    data: null,
  };
}

