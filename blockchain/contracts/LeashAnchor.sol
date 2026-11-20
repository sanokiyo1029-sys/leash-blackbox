// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title LeashAnchor
/// @notice Append-only registry of Merkle commitments over security-event batches.
///
/// Each batch commits to a contiguous range of event sequence numbers
/// [firstSeq, lastSeq], the Merkle root of their leaf hashes, and the head of
/// the off-chain SHA-256 hash chain after the last event. The contract has no
/// update or delete path: once a batch is anchored, its commitment is fixed for
/// as long as the chain exists. Sequence continuity is enforced on-chain, so a
/// gap or overlap in committed ranges cannot be introduced after the fact.
contract LeashAnchor {
    struct Batch {
        bytes32 merkleRoot;
        bytes32 chainHead;
        bytes32 manifestHash;
        uint64 firstSeq;
        uint64 lastSeq;
        uint32 eventCount;
        uint64 anchoredAt;
        uint64 blockNumber;
        address submitter;
    }

    /// A dispute commits only the SHA-256 of an off-chain evidence package (e.g. a witnessed session the host never
    /// reported). The package itself, which names users and addresses, never goes on-chain.
    struct Dispute {
        bytes32 digest;
        uint64 committedAt;
        uint64 blockNumber;
        uint64 anchoredBatches; // batches anchored when the dispute was committed: ties it to that evidence state
        address submitter;
    }

    address public owner;
    mapping(address => bool) public isAnchorer;
    Batch[] private _batches;
    Dispute[] private _disputes;

    event BatchAnchored(
        uint256 indexed batchId,
        bytes32 indexed merkleRoot,
        bytes32 chainHead,
        bytes32 manifestHash,
        uint64 firstSeq,
        uint64 lastSeq,
        uint32 eventCount,
        address indexed submitter
    );
    event DisputeCommitted(uint256 indexed disputeId, bytes32 indexed digest, uint64 anchoredBatches, address indexed submitter);
    event AnchorerUpdated(address indexed account, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotAnchorer();
    error ZeroRoot();
    error InvalidRange();
    error CountMismatch();
    error SequenceGap(uint64 expectedFirstSeq, uint64 providedFirstSeq);
    error UnknownBatch(uint256 batchId);
    error ZeroAddress();
    error ZeroDigest();
    error UnknownDispute(uint256 disputeId);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAnchorer() {
        if (!isAnchorer[msg.sender]) revert NotAnchorer();
        _;
    }

    constructor() {
        owner = msg.sender;
        isAnchorer[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AnchorerUpdated(msg.sender, true);
    }

    function setAnchorer(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        isAnchorer[account] = allowed;
        emit AnchorerUpdated(account, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Commit a batch. Sequence numbers start at 1 and must be contiguous
    /// across batches.
    function anchorBatch(
        bytes32 merkleRoot,
        bytes32 chainHead,
        bytes32 manifestHash,
        uint64 firstSeq,
        uint64 lastSeq,
        uint32 eventCount
    ) external onlyAnchorer returns (uint256 batchId) {
        if (merkleRoot == bytes32(0)) revert ZeroRoot();
        if (firstSeq == 0 || lastSeq < firstSeq) revert InvalidRange();
        if (uint256(lastSeq) - uint256(firstSeq) + 1 != uint256(eventCount)) revert CountMismatch();

        uint64 expected = _batches.length == 0 ? 1 : _batches[_batches.length - 1].lastSeq + 1;
        if (firstSeq != expected) revert SequenceGap(expected, firstSeq);

        batchId = _batches.length;
        _batches.push(
            Batch({
                merkleRoot: merkleRoot,
                chainHead: chainHead,
                manifestHash: manifestHash,
                firstSeq: firstSeq,
                lastSeq: lastSeq,
                eventCount: eventCount,
                anchoredAt: uint64(block.timestamp),
                blockNumber: uint64(block.number),
                submitter: msg.sender
            })
        );
        emit BatchAnchored(batchId, merkleRoot, chainHead, manifestHash, firstSeq, lastSeq, eventCount, msg.sender);
    }

    function batchCount() external view returns (uint256) {
        return _batches.length;
    }

    function getBatch(uint256 batchId) external view returns (Batch memory) {
        if (batchId >= _batches.length) revert UnknownBatch(batchId);
        return _batches[batchId];
    }

    /// @notice Commit the digest of an off-chain dispute package. Append-only: there is no update or delete path.
    function commitDispute(bytes32 digest) external onlyAnchorer returns (uint256 disputeId) {
        if (digest == bytes32(0)) revert ZeroDigest();
        disputeId = _disputes.length;
        uint64 anchored = uint64(_batches.length);
        _disputes.push(
            Dispute({
                digest: digest,
                committedAt: uint64(block.timestamp),
                blockNumber: uint64(block.number),
                anchoredBatches: anchored,
                submitter: msg.sender
            })
        );
        emit DisputeCommitted(disputeId, digest, anchored, msg.sender);
    }

    function disputeCount() external view returns (uint256) {
        return _disputes.length;
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        if (disputeId >= _disputes.length) revert UnknownDispute(disputeId);
        return _disputes[disputeId];
    }

    /// @notice Highest committed sequence number (0 when nothing is anchored).
    function lastAnchoredSeq() external view returns (uint64) {
        return _batches.length == 0 ? 0 : _batches[_batches.length - 1].lastSeq;
    }
}
