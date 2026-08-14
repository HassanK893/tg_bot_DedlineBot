export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(messege: string, statusCode: number, code:string) {
    super(messege);
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequest extends AppError {
  constructor(
    message: string = "Некоректный запрос",
    code: string = "bad_request",
  ) {
    super(message, 400, code);
  }
}

export class Unauthorized extends AppError {
  constructor(
    message: string = "Ошибка аутентификации",
    code: string = "unauthorized",
  ) {
    super(message, 401, code);
  }
}

export class NotFound extends AppError {
  constructor(
    message: string = "Ресурс не найден",
    code: string = "not_found",
  ) {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string = "Ресурс уже существует",
    code: string = "conflict",
  ) {
    super(message, 409, code);
  }
}

export class TooManyRequests extends AppError {
  constructor(
    message: string = "Слишком много запроов ",
    code: string = "many_request",
  ) {
    super(message, 429, code);
  }
}
export class InternalServerError extends AppError {
  constructor(
    message: string = "Внутренняя ошибка сервера",
    code: string = "internal_error",
  ) {
    super(message, 500, code);
  }
}
