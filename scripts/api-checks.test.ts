import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toHex } from "viem";

import { ApiError } from "../src/lib/api-error.ts";
import { getCachedEnv, getEnv, resetEnvCache } from "../src/lib/env.ts";
import {
  LOCAL_HARDHAT_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  SUPPORTED_VAULT_CHAINS,
  VAULT_ADDRESS_BY_CHAIN,
  cidFromMetadataUri,
  documentIdForCid,
  metadataUriForCid,
  vaultAddressFor,
} from "../src/lib/contract.ts";
import {
  parseDeleteParams,
  parseListFilter,
} from "../src/lib/document-query.ts";
import { ipfsGatewayBase, ipfsGatewayUrl } from "../src/lib/ipfs.ts";
import {
  MAX_PDF_BYTES,
  PDF_MIME_TYPE,
  hasPdfMagicBytes,
  hasPdfExtensionAndType,
  validatePdfFile,
} from "../src/lib/pdf.ts";

const MINIMAL_PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "ascii");

const VALID_ENV = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/document-vault",
  PINATA_JWT: "header.payload.signature",
};

function pdfFile(bytes: Uint8Array, name = "report.pdf", type = PDF_MIME_TYPE): File {
  return new File([bytes as BlobPart], name, { type });
}

async function expectApiError(
  action: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ApiError, `expected ApiError, received ${String(error)}`);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

function withProcessEnv<T>(vars: Record<string, string>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("env", () => {
  it("accepts a complete configuration", () => {
    const parsed = getEnv({
      ...VALID_ENV,
      PINATA_GATEWAY: "https://example.gateway.pinata.cloud",
    });
    assert.equal(parsed.MONGODB_URI, VALID_ENV.MONGODB_URI);
    assert.equal(parsed.PINATA_JWT, VALID_ENV.PINATA_JWT);
    assert.equal(parsed.PINATA_GATEWAY, "https://example.gateway.pinata.cloud");
  });

  it("treats the gateway as optional", () => {
    assert.equal(getEnv(VALID_ENV).PINATA_GATEWAY, undefined);
  });

  it("rejects a missing connection string", () => {
    assert.throws(() => getEnv({ PINATA_JWT: VALID_ENV.PINATA_JWT }), /MONGODB_URI/);
  });

  it("rejects a non-mongodb connection string", () => {
    assert.throws(
      () => getEnv({ ...VALID_ENV, MONGODB_URI: "https://example.com" }),
      /MONGODB_URI/,
    );
  });

  it("rejects a malformed Pinata JWT", () => {
    assert.throws(() => getEnv({ ...VALID_ENV, PINATA_JWT: "not-a-jwt" }), /PINATA_JWT/);
  });

  it("reports every problem at once", () => {
    assert.throws(() => getEnv({}), /MONGODB_URI[\s\S]*PINATA_JWT/);
  });

  it("memoizes the parsed environment until reset", () => {
    resetEnvCache();
    withProcessEnv(VALID_ENV, () => {
      const first = getCachedEnv();
      assert.equal(getCachedEnv(), first, "expected the cached value to be reused");
    });

    resetEnvCache();
    withProcessEnv(VALID_ENV, () => {
      const afterReset = getCachedEnv();
      resetEnvCache();
      withProcessEnv(VALID_ENV, () => {
        assert.notEqual(getCachedEnv(), afterReset, "expected reset to clear the cache");
      });
    });

    resetEnvCache();
  });
});

describe("pdf validation", () => {
  it("detects the PDF magic bytes", () => {
    assert.equal(hasPdfMagicBytes(MINIMAL_PDF), true);
  });

  it("rejects content without the PDF header", () => {
    assert.equal(hasPdfMagicBytes(Buffer.from("PK\u0003\u0004 zip payload", "binary")), false);
    assert.equal(hasPdfMagicBytes(Buffer.from("%PDX-1.7", "ascii")), false);
  });

  it("tolerates leading bytes before the header", () => {
    const padded = Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), MINIMAL_PDF]);
    assert.equal(hasPdfMagicBytes(padded), true);
  });

  it("ignores a header that appears beyond the search window", () => {
    const late = Buffer.concat([Buffer.alloc(2048), MINIMAL_PDF]);
    assert.equal(hasPdfMagicBytes(late), false);
  });

  it("requires both a .pdf extension and the PDF mime type", () => {
    assert.equal(hasPdfExtensionAndType({ name: "a.pdf", type: PDF_MIME_TYPE }), true);
    assert.equal(hasPdfExtensionAndType({ name: "a.PDF", type: PDF_MIME_TYPE }), true);
    assert.equal(hasPdfExtensionAndType({ name: "a.txt", type: PDF_MIME_TYPE }), false);
    assert.equal(hasPdfExtensionAndType({ name: "a.pdf", type: "text/plain" }), false);
    assert.equal(hasPdfExtensionAndType({ name: "pdf", type: PDF_MIME_TYPE }), false);
  });

  it("accepts a valid PDF", async () => {
    const validated = await validatePdfFile(pdfFile(MINIMAL_PDF));
    assert.equal(validated.filename, "report.pdf");
    assert.equal(validated.size, MINIMAL_PDF.byteLength);
  });

  it("rejects a non-PDF extension", async () => {
    await expectApiError(
      () => validatePdfFile(pdfFile(MINIMAL_PDF, "notes.txt", "text/plain")),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  });

  it("rejects a double extension that does not end in .pdf", async () => {
    await expectApiError(
      () => validatePdfFile(pdfFile(MINIMAL_PDF, "invoice.pdf.exe", PDF_MIME_TYPE)),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  });

  it("rejects a spoofed content type", async () => {
    const renamed = new File([MINIMAL_PDF as BlobPart], "photo.pdf", { type: "image/png" });
    await expectApiError(() => validatePdfFile(renamed), 415, "UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects a .pdf name holding non-PDF bytes", async () => {
    await expectApiError(
      () => validatePdfFile(pdfFile(Buffer.from('{"evil":true}', "ascii"))),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  });

  it("rejects an empty file", async () => {
    await expectApiError(
      () => validatePdfFile(pdfFile(new Uint8Array(0))),
      400,
      "BAD_REQUEST",
    );
  });

  it("rejects a file over the size limit", async () => {
    const oversized = new File([new Uint8Array(MAX_PDF_BYTES + 1)], "big.pdf", {
      type: PDF_MIME_TYPE,
    });
    await expectApiError(() => validatePdfFile(oversized), 413, "PAYLOAD_TOO_LARGE");
  });

  it("defaults a nameless upload to document.pdf", async () => {
    const validated = await validatePdfFile(
      new File([MINIMAL_PDF as BlobPart], "", { type: PDF_MIME_TYPE }),
    );
    assert.equal(validated.filename, "document.pdf");
  });
});

describe("contract helpers", () => {
  const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

  it("derives the document id as keccak256 of the CID", () => {
    assert.equal(documentIdForCid(CID), keccak256(toHex(CID)));
  });

  it("derives a different id per CID", () => {
    assert.notEqual(documentIdForCid(CID), documentIdForCid(`${CID}-other`));
  });

  it("never produces bytes32(0)", () => {
    assert.notEqual(documentIdForCid(CID), `0x${"0".repeat(64)}`);
  });

  it("builds an ipfs:// metadata URI", () => {
    assert.equal(metadataUriForCid(CID), `ipfs://${CID}`);
  });

  it("always has a local Hardhat address configured", () => {
    const local = vaultAddressFor(LOCAL_HARDHAT_CHAIN_ID);
    assert.ok(local, "expected the 31337 deployment address");
    assert.equal(local, VAULT_ADDRESS_BY_CHAIN[LOCAL_HARDHAT_CHAIN_ID]);
  });

  it("returns undefined for unknown or missing chains", () => {
    assert.equal(vaultAddressFor(999999), undefined);
    assert.equal(vaultAddressFor(undefined), undefined);
  });

  it("only offers chains that have a configured address", () => {
    assert.ok(SUPPORTED_VAULT_CHAINS.some((chain) => chain.id === LOCAL_HARDHAT_CHAIN_ID));
    for (const chain of SUPPORTED_VAULT_CHAINS) {
      assert.ok(
        VAULT_ADDRESS_BY_CHAIN[chain.id],
        `chain ${chain.id} is offered without an address`,
      );
    }
    if (VAULT_ADDRESS_BY_CHAIN[SEPOLIA_CHAIN_ID]) {
      assert.ok(SUPPORTED_VAULT_CHAINS.some((chain) => chain.id === SEPOLIA_CHAIN_ID));
    }
  });

  it("round-trips a CID through the metadata URI", () => {
    assert.equal(cidFromMetadataUri(metadataUriForCid(CID)), CID);
  });

  it("accepts the alternate ipfs://ipfs/<cid> gateway form", () => {
    assert.equal(cidFromMetadataUri(`ipfs://ipfs/${CID}`), CID);
  });

  it("trims whitespace around the metadata URI", () => {
    assert.equal(cidFromMetadataUri(`  ipfs://${CID}  `), CID);
  });

  it("rejects URIs that do not carry a CID", () => {
    assert.equal(cidFromMetadataUri(""), undefined);
    assert.equal(cidFromMetadataUri("https://example.com/file.pdf"), undefined);
    assert.equal(cidFromMetadataUri("ipfs://"), undefined);
  });
});

describe("document query params", () => {
  const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

  function params(search: string): URLSearchParams {
    return new URLSearchParams(search);
  }

  it("requires at least one filter", async () => {
    await expectApiError(async () => parseListFilter(params("")), 400, "BAD_REQUEST");
    await expectApiError(async () => parseListFilter(params("foo=bar")), 400, "BAD_REQUEST");
  });

  it("parses an owner filter", () => {
    const filter = parseListFilter(params(`owner=${OWNER}`));
    assert.equal(filter.owner, OWNER);
    assert.deepEqual(filter.cids, []);
  });

  it("rejects a malformed owner", async () => {
    await expectApiError(async () => parseListFilter(params("owner=0xnothex")), 400, "BAD_REQUEST");
    await expectApiError(
      async () => parseListFilter(params(`owner=${OWNER}extra`)),
      400,
      "BAD_REQUEST",
    );
  });

  it("parses a single cid filter", () => {
    const filter = parseListFilter(params(`cid=${CID}`));
    assert.equal(filter.cid, CID);
  });

  it("splits, trims, and de-duplicates the cids filter", () => {
    const other = `${CID}x`;
    const filter = parseListFilter(params(`cids=${encodeURIComponent(`${CID}, ${other} ,${CID}`)}`));
    assert.deepEqual(filter.cids, [CID, other]);
  });

  it("combines owner and cids filters", () => {
    const filter = parseListFilter(params(`owner=${OWNER}&cids=${CID}`));
    assert.equal(filter.owner, OWNER);
    assert.deepEqual(filter.cids, [CID]);
  });

  it("caps the number of cids per request", async () => {
    const many = Array.from({ length: 101 }, (_, index) => `cid-${index}`).join(",");
    await expectApiError(async () => parseListFilter(params(`cids=${many}`)), 400, "BAD_REQUEST");
  });

  it("requires both cid and owner for deletion", async () => {
    await expectApiError(
      async () => parseDeleteParams(params(`cid=${CID}`)),
      400,
      "BAD_REQUEST",
    );
    await expectApiError(async () => parseDeleteParams(params(`owner=${OWNER}`)), 400, "BAD_REQUEST");
    await expectApiError(async () => parseDeleteParams(params("")), 400, "BAD_REQUEST");
  });

  it("parses a valid delete request", () => {
    const parsed = parseDeleteParams(params(`cid=${CID}&owner=${OWNER}`));
    assert.deepEqual(parsed, { cid: CID, owner: OWNER });
  });

  it("rejects deletion with a malformed owner", async () => {
    await expectApiError(
      async () => parseDeleteParams(params(`cid=${CID}&owner=0x123`)),
      400,
      "BAD_REQUEST",
    );
  });
});

describe("ipfs gateway helper", () => {
  it("falls back to the public Pinata gateway", () => {
    resetEnvCache();
    const url = withProcessEnv({ NEXT_PUBLIC_IPFS_GATEWAY: "" }, () =>
      ipfsGatewayUrl("QmTest"),
    );
    assert.equal(url, "https://gateway.pinata.cloud/ipfs/QmTest");
  });

  it("uses a configured gateway and strips trailing slashes", () => {
    const url = withProcessEnv({ NEXT_PUBLIC_IPFS_GATEWAY: "https://gw.example.com/" }, () =>
      ipfsGatewayUrl("QmTest"),
    );
    assert.equal(url, "https://gw.example.com/ipfs/QmTest");
    withProcessEnv({ NEXT_PUBLIC_IPFS_GATEWAY: "https://gw.example.com" }, () => {
      assert.equal(ipfsGatewayBase(), "https://gw.example.com");
    });
  });
});