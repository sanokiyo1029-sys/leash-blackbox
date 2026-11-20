const { expect } = require("chai");
const { ethers } = require("hardhat");

const root = (n) => ethers.zeroPadValue(ethers.toBeHex(n), 32);

describe("LeashAnchor", function () {
  let anchor, owner, anchorer, outsider;

  beforeEach(async function () {
    [owner, anchorer, outsider] = await ethers.getSigners();
    anchor = await (await ethers.getContractFactory("LeashAnchor")).deploy();
    await anchor.waitForDeployment();
  });

  it("starts empty with the deployer as owner and anchorer", async function () {
    expect(await anchor.owner()).to.equal(owner.address);
    expect(await anchor.isAnchorer(owner.address)).to.equal(true);
    expect(await anchor.batchCount()).to.equal(0n);
    expect(await anchor.lastAnchoredSeq()).to.equal(0n);
  });

  it("anchors a batch, stores it, and emits BatchAnchored", async function () {
    const tx = await anchor.anchorBatch(root(1), root(2), root(3), 1, 10, 10);
    const receipt = await tx.wait();
    await expect(tx)
      .to.emit(anchor, "BatchAnchored")
      .withArgs(0n, root(1), root(2), root(3), 1n, 10n, 10n, owner.address);

    const b = await anchor.getBatch(0);
    expect(b.merkleRoot).to.equal(root(1));
    expect(b.chainHead).to.equal(root(2));
    expect(b.manifestHash).to.equal(root(3));
    expect(b.firstSeq).to.equal(1n);
    expect(b.lastSeq).to.equal(10n);
    expect(b.eventCount).to.equal(10n);
    expect(b.blockNumber).to.equal(BigInt(receipt.blockNumber));
    expect(b.submitter).to.equal(owner.address);
    expect(await anchor.lastAnchoredSeq()).to.equal(10n);
  });

  it("enforces contiguous sequence ranges across batches", async function () {
    await anchor.anchorBatch(root(1), root(2), root(3), 1, 5, 5);
    await expect(anchor.anchorBatch(root(4), root(5), root(6), 7, 9, 3))
      .to.be.revertedWithCustomError(anchor, "SequenceGap")
      .withArgs(6n, 7n);
    await expect(anchor.anchorBatch(root(4), root(5), root(6), 5, 9, 5))
      .to.be.revertedWithCustomError(anchor, "SequenceGap")
      .withArgs(6n, 5n);
    await anchor.anchorBatch(root(4), root(5), root(6), 6, 9, 4);
    expect(await anchor.batchCount()).to.equal(2n);
  });

  it("requires the first batch to start at sequence 1", async function () {
    await expect(anchor.anchorBatch(root(1), root(2), root(3), 2, 3, 2))
      .to.be.revertedWithCustomError(anchor, "SequenceGap")
      .withArgs(1n, 2n);
  });

  it("rejects malformed batches", async function () {
    await expect(anchor.anchorBatch(ethers.ZeroHash, root(2), root(3), 1, 1, 1))
      .to.be.revertedWithCustomError(anchor, "ZeroRoot");
    await expect(anchor.anchorBatch(root(1), root(2), root(3), 0, 1, 2))
      .to.be.revertedWithCustomError(anchor, "InvalidRange");
    await expect(anchor.anchorBatch(root(1), root(2), root(3), 5, 4, 0))
      .to.be.revertedWithCustomError(anchor, "InvalidRange");
    await expect(anchor.anchorBatch(root(1), root(2), root(3), 1, 4, 3))
      .to.be.revertedWithCustomError(anchor, "CountMismatch");
  });

  it("only lets authorised anchorers commit", async function () {
    await expect(anchor.connect(outsider).anchorBatch(root(1), root(2), root(3), 1, 1, 1))
      .to.be.revertedWithCustomError(anchor, "NotAnchorer");
    await expect(anchor.connect(outsider).setAnchorer(outsider.address, true))
      .to.be.revertedWithCustomError(anchor, "NotOwner");

    await expect(anchor.setAnchorer(anchorer.address, true))
      .to.emit(anchor, "AnchorerUpdated").withArgs(anchorer.address, true);
    await anchor.connect(anchorer).anchorBatch(root(1), root(2), root(3), 1, 1, 1);

    await anchor.setAnchorer(anchorer.address, false);
    await expect(anchor.connect(anchorer).anchorBatch(root(1), root(2), root(3), 2, 2, 1))
      .to.be.revertedWithCustomError(anchor, "NotAnchorer");
  });

  it("exposes no way to alter or remove an anchored batch", async function () {
    const mutators = anchor.interface.fragments
      .filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability))
      .map((f) => f.name)
      .sort();
    expect(mutators).to.deep.equal(["anchorBatch", "setAnchorer", "transferOwnership"]);

    await anchor.anchorBatch(root(1), root(2), root(3), 1, 3, 3);
    // Re-anchoring the same range is rejected rather than overwriting.
    await expect(anchor.anchorBatch(root(9), root(9), root(9), 1, 3, 3))
      .to.be.revertedWithCustomError(anchor, "SequenceGap");
    expect((await anchor.getBatch(0)).merkleRoot).to.equal(root(1));
  });

  it("reverts on unknown batch ids", async function () {
    await expect(anchor.getBatch(0)).to.be.revertedWithCustomError(anchor, "UnknownBatch").withArgs(0n);
  });

  it("supports ownership transfer by the owner only", async function () {
    await expect(anchor.connect(outsider).transferOwnership(outsider.address))
      .to.be.revertedWithCustomError(anchor, "NotOwner");
    await expect(anchor.transferOwnership(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(anchor, "ZeroAddress");
    await anchor.transferOwnership(anchorer.address);
    expect(await anchor.owner()).to.equal(anchorer.address);
  });
});
