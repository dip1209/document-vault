const FALLBACK_GATEWAY = "https://gateway.pinata.cloud";

/**
 * Base URL for opening CIDs in the browser.
 *
 * `NEXT_PUBLIC_*` variables are inlined into client bundles at build time, so
 * this helper works in client components as well as server code. Falls back to
 * Pinata's public gateway when nothing is configured.
 */
export function ipfsGatewayBase(): string {
  const configured = process.env.NEXT_PUBLIC_IPFS_GATEWAY?.trim();
  const base = configured && configured.length > 0 ? configured : FALLBACK_GATEWAY;
  return base.replace(/\/+$/, "");
}

export function ipfsGatewayUrl(cid: string): string {
  return `${ipfsGatewayBase()}/ipfs/${cid}`;
}
