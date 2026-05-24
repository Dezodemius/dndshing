export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
