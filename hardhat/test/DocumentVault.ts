import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { getAddress, keccak256, toHex, zeroAddress } from "viem";

const docId = (label: string) => keccak256(toHex(label));
const addr = (value: string) => getAddress(value);

describe("DocumentVault", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, grantee, stranger] = await viem.getWalletClients();

  const deploy = async () => viem.deployContract("DocumentVault");

  it("registers a document and assigns the caller as owner", async () => {
    const vault = await deploy();
    const id = docId("doc-1");

    await vault.write.registerDocument([id, "ipfs://doc1"], { account: owner.account });

    const doc = await vault.read.getDocument([id]);
    assert.equal(addr(doc.owner), addr(owner.account.address));
    assert.equal(doc.metadataURI, "ipfs://doc1");
    assert.equal(doc.exists, true);
    assert.ok(doc.registeredAt > 0n);
  });

  it("emits DocumentRegistered with the document id, owner and metadata", async () => {
    const vault = await deploy();
    const id = docId("doc-event");

    const hash = await vault.write.registerDocument([id, "ipfs://evt"], { account: owner.account });
    const receipt = await publicClient.getTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    const events = await publicClient.getContractEvents({
      address: vault.address,
      abi: vault.abi,
      eventName: "DocumentRegistered",
      args: { documentId: id },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(events.length, 1);
    const eventOwner = events[0].args.owner;
    assert.ok(eventOwner, "expected DocumentRegistered to carry an owner");
    assert.equal(addr(eventOwner), addr(owner.account.address));
    assert.equal(events[0].args.metadataURI, "ipfs://evt");
  });

  it("rejects registering the same document id twice", async () => {
    const vault = await deploy();
    const id = docId("dup");
    await vault.write.registerDocument([id, "ipfs://a"], { account: owner.account });

    await assert.rejects(
      vault.write.registerDocument([id, "ipfs://b"], { account: owner.account }),
      "expected duplicate registration to revert",
    );
  });

  it("rejects an empty metadata URI", async () => {
    const vault = await deploy();
    await assert.rejects(
      vault.write.registerDocument([docId("empty"), ""], { account: owner.account }),
      "expected empty metadata URI to revert",
    );
  });

  it("grants access to another wallet", async () => {
    const vault = await deploy();
    const id = docId("grant");
    await vault.write.registerDocument([id, "ipfs://g"], { account: owner.account });

    assert.equal(await vault.read.checkAccess([id, grantee.account.address]), false);

    await vault.write.grantAccess([id, grantee.account.address], { account: owner.account });

    assert.equal(await vault.read.checkAccess([id, grantee.account.address]), true);
    assert.equal(await vault.read.hasAccess([id, grantee.account.address]), true);
  });

  it("rejects a grant attempt from a non-owner", async () => {
    const vault = await deploy();
    const id = docId("grant-nonowner");
    await vault.write.registerDocument([id, "ipfs://gn"], { account: owner.account });

    await assert.rejects(
      vault.write.grantAccess([id, stranger.account.address], { account: stranger.account }),
      "expected non-owner grant to revert",
    );
  });

  it("rejects granting access to the owner", async () => {
    const vault = await deploy();
    const id = docId("grant-owner");
    await vault.write.registerDocument([id, "ipfs://go"], { account: owner.account });

    await assert.rejects(
      vault.write.grantAccess([id, owner.account.address], { account: owner.account }),
      "expected self-grant to revert",
    );
  });

  it("revokes access", async () => {
    const vault = await deploy();
    const id = docId("revoke");
    await vault.write.registerDocument([id, "ipfs://r"], { account: owner.account });
    await vault.write.grantAccess([id, grantee.account.address], { account: owner.account });

    await vault.write.revokeAccess([id, grantee.account.address], { account: owner.account });

    assert.equal(await vault.read.checkAccess([id, grantee.account.address]), false);
  });

  it("lets a grantee revoke their own access", async () => {
    const vault = await deploy();
    const id = docId("self-revoke");
    await vault.write.registerDocument([id, "ipfs://sr"], { account: owner.account });
    await vault.write.grantAccess([id, grantee.account.address], { account: owner.account });

    await vault.write.revokeAccess([id, grantee.account.address], { account: grantee.account });

    assert.equal(await vault.read.checkAccess([id, grantee.account.address]), false);
  });

  it("rejects a revoke attempt from a third party", async () => {
    const vault = await deploy();
    const id = docId("revoke-third");
    await vault.write.registerDocument([id, "ipfs://rt"], { account: owner.account });
    await vault.write.grantAccess([id, grantee.account.address], { account: owner.account });

    await assert.rejects(
      vault.write.revokeAccess([id, grantee.account.address], { account: stranger.account }),
      "expected third-party revoke to revert",
    );
  });

  it("rejects revoking access that was never granted", async () => {
    const vault = await deploy();
    const id = docId("revoke-none");
    await vault.write.registerDocument([id, "ipfs://rn"], { account: owner.account });

    await assert.rejects(
      vault.write.revokeAccess([id, stranger.account.address], { account: owner.account }),
      "expected revoke of missing grant to revert",
    );
  });

  it("checkAccess returns false for unknown documents and the zero address", async () => {
    const vault = await deploy();
    assert.equal(await vault.read.checkAccess([docId("nope"), stranger.account.address]), false);
    assert.equal(await vault.read.checkAccess([docId("nope"), zeroAddress]), false);
  });

  it("lists documents per owner and grantees per document", async () => {
    const vault = await deploy();
    const a = docId("list-a");
    const b = docId("list-b");

    await vault.write.registerDocument([a, "ipfs://a"], { account: owner.account });
    await vault.write.registerDocument([b, "ipfs://b"], { account: owner.account });
    await vault.write.grantAccess([a, grantee.account.address], { account: owner.account });

    const ids = await vault.read.documentsOf([owner.account.address]);
    assert.equal(ids.length, 2);

    const list = await vault.read.granteesOf([a]);
    assert.equal(list.length, 1);
    assert.equal(addr(list[0]), addr(grantee.account.address));
  });

  it("keeps the grantee list consistent across revoke and re-grant", async () => {
    const vault = await deploy();
    const id = docId("grantee-consistency");
    await vault.write.registerDocument([id, "ipfs://gc"], { account: owner.account });

    await vault.write.grantAccess([id, grantee.account.address], { account: owner.account });
    await vault.write.grantAccess([id, stranger.account.address], { account: owner.account });
    await vault.write.revokeAccess([id, grantee.account.address], { account: owner.account });

    let list = await vault.read.granteesOf([id]);
    assert.equal(list.length, 1);
    assert.equal(addr(list[0]), addr(stranger.account.address));

    await vault.write.grantAccess([id, grantee.account.address], { account: owner.account });

    list = await vault.read.granteesOf([id]);
    assert.equal(list.length, 2);
    assert.equal(await vault.read.checkAccess([id, grantee.account.address]), true);
    assert.equal(await vault.read.checkAccess([id, stranger.account.address]), true);

    await vault.write.revokeAccess([id, stranger.account.address], { account: owner.account });

    list = await vault.read.granteesOf([id]);
    assert.equal(list.length, 1);
    assert.equal(addr(list[0]), addr(grantee.account.address));
  });

  it("transfers ownership and clears the previous owner's grants", async () => {
    const vault = await deploy();
    const id = docId("transfer");
    await vault.write.registerDocument([id, "ipfs://t"], { account: owner.account });
    await vault.write.grantAccess([id, stranger.account.address], { account: owner.account });

    await vault.write.transferOwnership([id, grantee.account.address], { account: owner.account });

    assert.equal(addr(await vault.read.documentOwner([id])), addr(grantee.account.address));
    assert.equal(await vault.read.checkAccess([id, owner.account.address]), false);
    assert.equal(await vault.read.checkAccess([id, grantee.account.address]), true);
    assert.equal(await vault.read.checkAccess([id, stranger.account.address]), false);

    const grantees = await vault.read.granteesOf([id]);
    assert.equal(grantees.length, 0);

    const oldOwnerDocs = await vault.read.documentsOf([owner.account.address]);
    assert.equal(oldOwnerDocs.length, 0);

    const newOwnerDocs = await vault.read.documentsOf([grantee.account.address]);
    assert.equal(newOwnerDocs.length, 1);
    assert.equal(newOwnerDocs[0], id);
  });
});