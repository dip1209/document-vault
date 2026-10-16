import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";

/**
 * Resolves the `@/*` path alias for plain `node --test` runs.
 *
 * Next.js resolves this alias itself via tsconfig paths; Node has no such
 * concept, so tests that import src/lib modules directly need this hook.
 * Source files use extensionless imports (bundler moduleResolution), so the
 * hook also appends `.ts`/`.tsx` when the target has no extension.
 */
const SRC_DIR = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "src");
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs"];

function withExtension(target) {
  for (const extension of EXTENSIONS) {
    const candidate = target + extension;
    if (existsSync(candidate)) return candidate;
  }
  return target;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = withExtension(resolvePath(SRC_DIR, specifier.slice(2)));
      return nextResolve(pathToFileURL(target).href, context);
    }
    return nextResolve(specifier, context);
  },
});