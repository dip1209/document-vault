import { PinataSDK, PinataError } from "pinata";

import { ApiError } from "@/lib/api-error";
import { getCachedEnv } from "@/lib/env";

export type IpfsUploadResult = {
  cid: string;
  size: number;
  pinataFileId?: string;
  mimeType: string;
  name: string;
};

let client: PinataSDK | undefined;

/**
 * Pinata's SDK reads credentials at construction time, so the client is built once
 * and reused. It must stay lazy: constructing it eagerly would throw at import time
 * on any route that does not upload.
 */
function getPinataClient(): PinataSDK {
  if (client) return client;

  const { PINATA_JWT, PINATA_GATEWAY } = getCachedEnv();

  client = new PinataSDK({
    pinataJwt: PINATA_JWT,
    ...(PINATA_GATEWAY ? { pinataGateway: PINATA_GATEWAY } : {}),
  });

  return client;
}

/**
 * Pins a file to IPFS and returns its CID.
 *
 * Pinata wraps the result in a thenable `UploadBuilder`, so awaiting the call
 * performs the actual upload.
 */
export async function uploadPdfToIpfs(
  file: { filename: string; bytes: Uint8Array; size: number },
  keyvalues: Record<string, string> = {},
): Promise<IpfsUploadResult> {
  const pinata = getPinataClient();

  const pinataFile = new File([file.bytes as BlobPart], file.filename, {
    type: "application/pdf",
  });

  try {
    const upload = await pinata.upload.public.file(pinataFile).name(file.filename).keyvalues(keyvalues);

    if (!upload?.cid) {
      throw ApiError.dependency("Pinata did not return a CID for the uploaded file");
    }

    return {
      cid: upload.cid,
      size: upload.size ?? file.size,
      pinataFileId: upload.id,
      mimeType: upload.mime_type ?? "application/pdf",
      name: upload.name ?? file.filename,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof PinataError) {
      throw ApiError.dependency(`Pinata rejected the upload: ${error.message}`);
    }

    throw ApiError.dependency(`IPFS upload failed: ${(error as Error).message}`);
  }
}

/** Convenience wrapper returning a gateway URL rather than a bare CID. */
export function gatewayUrl(cid: string): string | undefined {
  const { PINATA_GATEWAY } = getCachedEnv();
  return PINATA_GATEWAY ? `${PINATA_GATEWAY.replace(/\/+$/, "")}/ipfs/${cid}` : undefined;
}