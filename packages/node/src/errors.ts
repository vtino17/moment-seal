export type MomentNodeErrorCode =
  | "CONCURRENCY_CONFLICT"
  | "DATABASE_QUERY_INVALID"
  | "HTTP_ETAG_INVALID"
  | "HTTP_GUARD_INVALID"
  | "KEY_INVALID"
  | "RECEIPT_SIGNATURE_INVALID"
  | "SIGNED_ENVELOPE_INVALID";

export class MomentNodeError extends Error {
  readonly code: MomentNodeErrorCode;
  readonly cause?: unknown;

  constructor(code: MomentNodeErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = "MomentNodeError";
    this.code = code;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
