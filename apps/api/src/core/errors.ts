export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public field: string | null = null) { super(message); }
}
export const invalidCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi tidak valid.');
export const invalidSession = () => new ApiError(401, 'SESSION_INVALID', 'Silakan masuk kembali.');
export const invalidToken = () => new ApiError(400, 'TOKEN_INVALID_OR_EXPIRED', 'Tautan tidak valid atau kedaluwarsa. Minta tautan baru.');
