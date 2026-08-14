export type Errors =
  | "NotFound"
  | "BadRequest"
  | "ConflictError"
  | "InternalServerError";

export type ResponseErrorJsonMessage = {
  message: string;
  name: string;
  code?: string;
  statusCode: number;
};
