export type MomentSealErrorCode =
  | "CANONICALIZATION_FAILED"
  | "COMPILATION_INPUT_MISMATCH"
  | "COMPILATION_TIMESTAMP_INVALID"
  | "INVALID_PLAN"
  | "INVALID_POLICY"
  | "RECEIPT_COMPILATION_MISMATCH"
  | "RECEIPT_NOT_CLEAN"
  | "RECEIPT_TIMELINE_INVALID";

export class MomentSealError extends Error {
  readonly code: MomentSealErrorCode;
  readonly cause?: unknown;

  constructor(code: MomentSealErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = "MomentSealError";
    this.code = code;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export const asMomentSealError = (code: MomentSealErrorCode, error: unknown): MomentSealError => error instanceof MomentSealError
  ? error
  : new MomentSealError(code, error instanceof Error ? error.message : String(error), { cause: error });
