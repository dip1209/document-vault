export type ErrorPayload = {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Missing or invalid credentials"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static unsupportedMedia(message: string): ApiError {
    return new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", message);
  }

  static payloadTooLarge(message: string): ApiError {
    return new ApiError(413, "PAYLOAD_TOO_LARGE", message);
  }

  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(422, "UNPROCESSABLE_ENTITY", message, details);
  }

  static configuration(message: string): ApiError {
    return new ApiError(500, "CONFIGURATION_ERROR", message);
  }

  static dependency(message: string): ApiError {
    return new ApiError(502, "UPSTREAM_ERROR", message);
  }

  static internal(message = "Unexpected server error"): ApiError {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}

/**
 * Normalises an unknown throw into a status and JSON body.
 *
 * Returns a plain object rather than a NextResponse so this stays independent of
 * the Next.js server runtime and can be exercised by unit tests directly. Route
 * handlers wrap the result with `NextResponse.json(payload.body, { status })`.
 */
export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
    };
  }

  if (isDatabaseUnreachable(error)) {
    console.error("[api] database unreachable:", error);
    return {
      status: 503,
      body: {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message:
            "Cannot reach the database. If you use MongoDB Atlas, add this server's IP to the cluster's Network Access allowlist.",
        },
      },
    };
  }

  console.error("[api] unhandled error:", error);

  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } },
  };
}

/** Recognises driver-level connection failures (as opposed to a bad query). */
function isDatabaseUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "MongooseServerSelectionError" ||
    error.name === "MongoServerSelectionError" ||
    error.name === "MongoNetworkError" ||
    error.name === "MongoTimeoutError"
  );
}