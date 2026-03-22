export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(resource: string): AppError {
  return new AppError(404, `${resource} not found`);
}

export function forbidden(message = 'Access denied'): AppError {
  return new AppError(403, message);
}

export function badRequest(message: string): AppError {
  return new AppError(400, message);
}
