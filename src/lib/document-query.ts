import { ApiError } from "@/lib/api-error";

const OWNER_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const MAX_CID_LENGTH = 128;
const MAX_CIDS_PER_QUERY = 100;

export type DocumentListFilter = {
  owner?: string;
  cid?: string;
  cids: string[];
};

export type DocumentDeleteParams = {
  cid: string;
  owner: string;
};

function parseOwner(value: string): string {
  const owner = value.trim();
  if (!OWNER_ADDRESS_PATTERN.test(owner)) {
    throw ApiError.badRequest("owner must be a 20-byte hex address (0x + 40 hex characters)");
  }
  return owner;
}

function parseCid(value: string, label: string): string {
  const cid = value.trim();
  if (cid.length === 0 || cid.length > MAX_CID_LENGTH) {
    throw ApiError.badRequest(`${label} must be between 1 and ${MAX_CID_LENGTH} characters`);
  }
  return cid;
}

/**
 * Parses the GET /api/documents query string. At least one filter is required
 * so the endpoint can never be used to dump the whole collection.
 */
export function parseListFilter(params: URLSearchParams): DocumentListFilter {
  const owner = params.get("owner");
  const cid = params.get("cid");
  const cids = params.get("cids");

  if (!owner?.trim() && !cid?.trim() && !cids?.trim()) {
    throw ApiError.badRequest("Provide at least one of: owner, cid, cids");
  }

  const filter: DocumentListFilter = { cids: [] };

  if (owner?.trim()) filter.owner = parseOwner(owner);
  if (cid?.trim()) filter.cid = parseCid(cid, "cid");

  if (cids?.trim()) {
    const entries = cids
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (entries.length === 0) {
      throw ApiError.badRequest("cids must contain at least one CID");
    }
    if (entries.length > MAX_CIDS_PER_QUERY) {
      throw ApiError.badRequest(`cids accepts at most ${MAX_CIDS_PER_QUERY} values`);
    }
    filter.cids = [...new Set(entries.map((entry) => parseCid(entry, "cids entry")))];
  }

  return filter;
}

/** Parses the DELETE /api/documents query string; both values are required. */
export function parseDeleteParams(params: URLSearchParams): DocumentDeleteParams {
  const cid = params.get("cid");
  const owner = params.get("owner");

  if (!cid?.trim() || !owner?.trim()) {
    throw ApiError.badRequest("cid and owner query parameters are required");
  }

  return { cid: parseCid(cid, "cid"), owner: parseOwner(owner) };
}
