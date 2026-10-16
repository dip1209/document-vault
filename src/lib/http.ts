import { NextResponse } from "next/server";

import { toErrorPayload } from "@/lib/api-error";

/**
 * Builds a JSON error response from any thrown value.
 *
 * Logs unexpected errors server-side while returning a generic message, so
 * internals (connection strings, stack traces) never reach the client.
 */
export function errorResponse(error: unknown): NextResponse {
  const payload = toErrorPayload(error);
  return NextResponse.json(payload.body, { status: payload.status });
}