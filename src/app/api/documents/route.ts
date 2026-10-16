import { type QueryFilter } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api-error";
import { getCachedEnv } from "@/lib/env";
import { parseDeleteParams, parseListFilter } from "@/lib/document-query";
import { errorResponse } from "@/lib/http";
import { connectToDatabase } from "@/lib/mongodb";
import { DocumentMetadataModel, type DocumentMetadata } from "@/models/DocumentMetadata";
import { PDF_MIME_TYPE } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createDocumentSchema = z.object({
  documentTitle: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  cid: z.string().trim().min(1),
  ownerWalletAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 20-byte hex address"),
  uploadDate: z.coerce.date().optional(),
  fileSize: z.coerce.number().int().positive().optional(),
  pinataFileId: z.string().trim().optional(),
});

/**
 * Persists document metadata for a CID that was already pinned by
 * POST /api/ipfs/upload. Keeping this separate from the upload lets the client
 * retry a database write without re-uploading to IPFS.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    getCachedEnv();

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw ApiError.badRequest("Request body must be valid JSON");
    }

    const parsed = createDocumentSchema.safeParse(payload);
    if (!parsed.success) {
      throw ApiError.unprocessable("Request body failed validation", parsed.error.flatten());
    }

    const { MONGODB_URI } = getCachedEnv();
    await connectToDatabase(MONGODB_URI);

    const Model = DocumentMetadataModel();

    const document = await Model.create({
      documentTitle: parsed.data.documentTitle,
      description: parsed.data.description,
      cid: parsed.data.cid,
      ownerWalletAddress: parsed.data.ownerWalletAddress,
      uploadDate: parsed.data.uploadDate ?? new Date(),
      ...(parsed.data.fileSize === undefined ? {} : { fileSize: parsed.data.fileSize }),
      ...(parsed.data.pinataFileId === undefined ? {} : { pinataFileId: parsed.data.pinataFileId }),
    });

    return NextResponse.json(
      { document: { ...document.toObject(), mimeType: PDF_MIME_TYPE } },
      { status: 201 },
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return errorResponse(
        ApiError.badRequest("A document with this CID has already been saved"),
      );
    }
    return errorResponse(error);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

const MAX_DOCUMENTS_PER_RESPONSE = 200;

/** Matches an address exactly, ignoring EIP-55 checksum casing. */
function ownerCondition(owner: string): QueryFilter<DocumentMetadata> {
  return { ownerWalletAddress: { $regex: `^${owner}$`, $options: "i" } };
}

/**
 * Lists document metadata. Requires at least one filter (owner, cid, or cids)
 * so the endpoint can never dump the whole collection.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    getCachedEnv();

    const filter = parseListFilter(new URL(request.url).searchParams);

    const { MONGODB_URI } = getCachedEnv();
    await connectToDatabase(MONGODB_URI);

    const Model = DocumentMetadataModel();

    const conditions: QueryFilter<DocumentMetadata>[] = [];
    if (filter.cid) conditions.push({ cid: filter.cid });
    if (filter.cids.length > 0) conditions.push({ cid: { $in: filter.cids } });
    if (filter.owner) conditions.push(ownerCondition(filter.owner));

    const documents = await Model.find({ $and: conditions })
      .sort({ uploadDate: -1 })
      .limit(MAX_DOCUMENTS_PER_RESPONSE)
      .lean();

    return NextResponse.json({
      documents: documents.map((document) => ({ ...document, mimeType: PDF_MIME_TYPE })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Deletes a document's metadata record. Requires both cid and owner; the
 * owner must match the record (case-insensitively) or the request 404s. The
 * on-chain registration is intentionally untouched — this only removes
 * MongoDB metadata.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    getCachedEnv();

    const { cid, owner } = parseDeleteParams(new URL(request.url).searchParams);

    const { MONGODB_URI } = getCachedEnv();
    await connectToDatabase(MONGODB_URI);

    const Model = DocumentMetadataModel();

    const result = await Model.deleteOne({ $and: [{ cid }, ownerCondition(owner)] });
    if (result.deletedCount === 0) {
      throw ApiError.notFound("No document with this CID is owned by this wallet");
    }

    return NextResponse.json({ deleted: true, cid });
  } catch (error) {
    return errorResponse(error);
  }
}