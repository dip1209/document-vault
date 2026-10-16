import { ApiError } from "@/lib/api-error";

/**
 * Direct Kubo (go-ipfs) HTTP API upload. Used when IPFS_PROVIDER is "kubo";
 * Pinata remains the default because it requires no self-hosted node.
 */
const KUBO_DEFAULT_API = "http://127.0.0.1:5001";

export type KuboUploadResult = {
  cid: string;
  size: number;
  name: string;
};

function kuboApiUrl(): string {
  const value = process.env.KUBO_API_URL?.trim();
  return (value && value.length > 0 ? value : KUBO_DEFAULT_API).replace(/\/+$/, "");
}

/**
 * Pins to a local Kubo node. Streamed with multipart/form-data rather than a raw
 * body so `pinataFile` keeps its filename, which is what determines the CID's
 * filename in IPFS metadata.
 */
export async function uploadPdfToKubo(file: {
  filename: string;
  bytes: Uint8Array;
  size: number;
}): Promise<KuboUploadResult> {
  const apiUrl = kuboApiUrl();

  const form = new FormData();
  form.append("file", new File([file.bytes as BlobPart], file.filename, { type: "application/pdf" }));

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/v0/pin/add?pin=true&cid-version=1`, {
      method: "POST",
      body: form,
      // Kubo writes to IPFS locally; no Pinata credentials apply here.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw ApiError.dependency(
      `Could not reach the Kubo API at ${apiUrl}: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw ApiError.dependency(
      `Kubo rejected the upload (${response.status}): ${detail.slice(0, 300) || response.statusText}`,
    );
  }

  const body = (await response.json()) as { Hash?: string; Name?: string; Size?: string };

  if (!body.Hash) {
    throw ApiError.dependency("Kubo did not return a content identifier");
  }

  return {
    cid: body.Hash,
    size: body.Size ? Number(body.Size) : file.size,
    name: body.Name ?? file.filename,
  };
}

export function gatewayUrlForCid(cid: string): string | undefined {
  const custom = process.env.KUBO_GATEWAY_URL?.trim();
  if (custom) return `${custom.replace(/\/+$/, "")}/ipfs/${cid}`;
  return `${kuboApiUrl()}/ipfs/${cid}`;
}

export function isKuboProvider(): boolean {
  return process.env.IPFS_PROVIDER?.trim().toLowerCase() === "kubo";
}