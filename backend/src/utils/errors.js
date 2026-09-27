export class AppError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = message => new AppError(400, message, 'INVALID_REQUEST');
export const unauthorized = message => new AppError(401, message, 'UNAUTHENTICATED');
