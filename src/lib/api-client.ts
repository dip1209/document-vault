/**
 * Unwraps a JSON API response, throwing a readable Error for non-2xx statuses.
 *
 * Shared by every client that talks to the app's route handlers so error
 * messages surface uniformly in the UI.
 */
export async function unwrap<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorField =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { message?: string } }).error
        : undefined;
    throw new Error(errorField?.message ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}

/** Extracts the most readable message from an unknown thrown value. */
export function messageFromError(error: unknown): string {
  if (error instanceof Error) {
    const short = (error as { shortMessage?: string }).shortMessage;
    return short || error.message;
  }
  return String(error);
}
