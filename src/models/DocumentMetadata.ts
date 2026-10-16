import { Schema, type InferSchemaType } from "mongoose";

import { getModel } from "@/lib/mongodb";
import { MAX_PDF_BYTES } from "@/lib/pdf";

/** EIP-55 / checksum-agnostic 20-byte hex address. */
const WALLET_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * A CIDv0 is base58btc (Qm...); CIDv1 is typically base32 (bafy...) or base58.
 * Kept intentionally broad: the goal is to reject obvious garbage, not to
 * reimplement a multibase decoder.
 */
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,}|z[a-zA-Z0-9]{20,})$/;

const documentMetadataSchema = new Schema(
  {
    documentTitle: {
      type: String,
      required: [true, "Document Title is required"],
      trim: true,
      minlength: [1, "Document Title must not be empty"],
      maxlength: [200, "Document Title must be at most 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [1, "Description must not be empty"],
      maxlength: [2000, "Description must be at most 2000 characters"],
    },
    cid: {
      type: String,
      required: [true, "CID is required"],
      unique: true,
      trim: true,
      validate: {
        validator: (value: string) => CID_PATTERN.test(value),
        message: (props: { value: string }) =>
          `"${props.value}" is not a valid IPFS content identifier`,
      },
    },
    ownerWalletAddress: {
      type: String,
      required: [true, "Owner Wallet Address is required"],
      trim: true,
      validate: {
        validator: (value: string) => WALLET_ADDRESS_PATTERN.test(value),
        message: (props: { value: string }) =>
          `"${props.value}" is not a valid wallet address`,
      },
    },
    uploadDate: {
      type: Date,
      required: [true, "Upload Date is required"],
      default: Date.now,
      index: true,
    },
    fileSize: {
      type: Number,
      min: [1, "File Size must be greater than 0"],
      max: [MAX_PDF_BYTES, `File Size must be at most ${MAX_PDF_BYTES} bytes`],
    },
    pinataFileId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "documentMetadata",
    versionKey: false,
  },
);

documentMetadataSchema.index({ ownerWalletAddress: 1, uploadDate: -1 });
documentMetadataSchema.index({ documentTitle: "text", description: "text" });

export type DocumentMetadata = InferSchemaType<typeof documentMetadataSchema>;

export function DocumentMetadataModel() {
  return getModel<DocumentMetadata>("DocumentMetadata", documentMetadataSchema);
}