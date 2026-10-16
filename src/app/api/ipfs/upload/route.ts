import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api-error";
import { getCachedEnv } from "@/lib/env";
import { errorResponse } from "@/lib/http";
import { gatewayUrlForCid, isKuboProvider, uploadPdfToKubo } from "@/lib/kubo";
import { validatePdfFile } from "@/lib/pdf";
import { gatewayUrl, uploadPdfToIpfs } from "@/lib/pinata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Accepts a single PDF, pins it to IPFS, and returns the CID.
 *
 * The provider comes from IPFS_PROVIDER: "pinata" (default) or "kubo".
 * Two body formats are accepted:
 *   - multipart/form-data with a `file` field
 *   - raw application/pdf bytes, with the name in an `x-file-name` header
 *
 * Nothing is written to MongoDB here. The CID comes back to the caller, which
 * then POSTs it to /api/documents to save the metadata.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    getCachedEnv();

    const contentType = request.headers.get("content-type") ?? "";
    let file: File;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const entry = form.get("file");

      if (entry === null) {
        throw ApiError.badRequest('Missing "file" field in multipart body');
      }
      if (typeof entry === "string") {
        throw ApiError.badRequest('"file" field must be a file, not a string');
      }

      file = entry;
    } else if (contentType.startsWith("application/pdf")) {
      const buffer = await request.arrayBuffer();
      const filename = request.headers.get("x-file-name") ?? "document.pdf";

      file = new File([buffer], filename, { type: "application/pdf" });
    } else {
      throw ApiError.unsupportedMedia(
        "Send multipart/form-data with a file field, or application/pdf as the raw body",
      );
    }

    const validated = await validatePdfFile(file);

    const useKubo = isKuboProvider();

    const result = useKubo
      ? await uploadPdfToKubo(validated)
      : await uploadPdfToIpfs(validated, {
          filename: validated.filename,
          size: String(validated.size),
        });

    return NextResponse.json(
      {
        cid: result.cid,
        size: result.size,
        name: result.name,
        provider: useKubo ? "kubo" : "pinata",
        mimeType: "application/pdf",
        ...(useKubo
          ? {}
          : { pinataFileId: (result as { pinataFileId?: string }).pinataFileId }),
        gatewayUrl: useKubo ? gatewayUrlForCid(result.cid) : gatewayUrl(result.cid),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}