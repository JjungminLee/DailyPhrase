export class AppError extends Error {
  constructor(type, message, status = 500) {
    super(message);
    this.type = type;
    this.status = status;
  }
}

export const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});
