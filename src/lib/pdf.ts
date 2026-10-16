import { ApiError } from "@/lib/api-error";

/** The only MIME type this API accepts. */
export const PDF_MIME_TYPE = "application/pdf";

/** 25 MiB. Pinata's default per-file limit is 100 MiB; this keeps the route predictable. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * Every PDF starts with the header `%PDF-` followed by a version digit.
 * The spec also allows the header to appear within the first 1024 bytes to
 * tolerate binary-comment prefixes, so the search window is bounded.
 *
 * Plain bytes (not Buffer) so this module also runs in the browser, where the
 * Upload page reuses it for client-side validation.
 */
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const PDF_HEADER_SEARCH_WINDOW = 1024;

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** Extension and declared type must both agree on PDF. */
export function hasPdfExtensionAndType(file: { name: string; type: string }): boolean {
  return extensionOf(file.name) === "pdf" && file.type === PDF_MIME_TYPE;
}

/**
 * Content-based check. A caller can name a file `report.pdf` and set
 * `Content-Type: application/pdf` while the bytes are something else entirely;
 * this is the check that actually establishes the file is a PDF.
 */
export function hasPdfMagicBytes(head: Uint8Array): boolean {
  const limit = Math.min(head.length, PDF_HEADER_SEARCH_WINDOW) - PDF_HEADER.length;

  for (let start = 0; start <= limit; start++) {
    let matched = true;
    for (let offset = 0; offset < PDF_HEADER.length; offset++) {
      if (head[start + offset] !== PDF_HEADER[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }

  return false;
}

export type ValidatedPdf = {
  filename: string;
  bytes: Uint8Array;
  size: number;
};

/**
 * Enforces every PDF-only rule: size ceiling, extension, declared MIME type,
 * then magic bytes on the actual content.
 */
export async function validatePdfFile(file: File): Promise<ValidatedPdf> {
  if (file.size === 0) {
    throw ApiError.badRequest("Uploaded file is empty");
  }

  if (file.size > MAX_PDF_BYTES) {
    throw ApiError.payloadTooLarge(
      `File is ${file.size} bytes, which exceeds the ${MAX_PDF_BYTES} byte limit`,
    );
  }

  const filename = file.name || "document.pdf";

  if (extensionOf(filename) !== "pdf") {
    throw ApiError.unsupportedMedia("Only .pdf files are accepted");
  }

  if (file.type !== PDF_MIME_TYPE) {
    throw ApiError.unsupportedMedia(
      `Expected Content-Type ${PDF_MIME_TYPE}, received ${file.type || "none"}`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!hasPdfMagicBytes(bytes)) {
    throw ApiError.unsupportedMedia("File content is not a valid PDF");
  }

  return { filename, bytes, size: file.size };
}