/**
 * Legatus 内部エラー型. service-schema.md §7.3 のエラーコードに揃える.
 */

export type LegatusErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_signed_in"
  | "user_not_found"
  | "quota_exceeded"
  | "upstream_error"
  | "internal_error";

export class LegatusError extends Error {
  constructor(
    public readonly code: LegatusErrorCode,
    message: string,
    public readonly from?: string,
  ) {
    super(message);
    this.name = "LegatusError";
  }

  toJSON(): { code: LegatusErrorCode; message: string; from?: string } {
    return { code: this.code, message: this.message, from: this.from };
  }
}

export function httpStatusFor(code: LegatusErrorCode): number {
  switch (code) {
    case "bad_request":      return 400;
    case "unauthorized":     return 401;
    case "forbidden":        return 403;
    case "not_signed_in":    return 401;
    case "user_not_found":   return 404;
    case "quota_exceeded":   return 429;
    case "upstream_error":   return 502;
    case "internal_error":   return 500;
  }
}
