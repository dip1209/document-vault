import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .refine(
      (value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
      "MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string",
    ),
  PINATA_JWT: z
    .string()
    .min(1, "PINATA_JWT is required")
    .refine((value) => value.split(".").length === 3, "PINATA_JWT must be a Pinata JWT"),
  PINATA_GATEWAY: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

/**
 * Reads and validates server environment variables.
 *
 * @param vars - Injectable values, defaults to process.env. Passing values in
 *   keeps this function pure and testable without mutating globals.
 */
export function getEnv(vars: Record<string, string | undefined> = process.env): ServerEnv {
  const source = Object.fromEntries(
    Object.entries(vars).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim() !== "",
    ),
  );
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment configuration -> ${details}`);
  }

  return parsed.data;
}

/**
 * Returns the memoized env, validating once per process. Route handlers in dev
 * re-import modules on every change, so the cache avoids re-parsing on each call.
 */
export function getCachedEnv(): ServerEnv {
  cached ??= getEnv();
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}