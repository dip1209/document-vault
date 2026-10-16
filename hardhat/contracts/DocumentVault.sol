// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract DocumentVault {
    struct Document {
        bytes32 documentId;
        address owner;
        string metadataURI;
        uint256 registeredAt;
        bool exists;
    }

    /// documentId => document record
    mapping(bytes32 => Document) private documents;

    /// documentId => grantee => has access
    mapping(bytes32 => mapping(address => bool)) private access;

    /// documentId => grantee => granted by owner
    mapping(bytes32 => mapping(address => address)) private grantedBy;

    /// owner => document ids
    mapping(address => bytes32[]) private documentIds;

    /// documentId => grantee addresses (enumerable access list)
    mapping(bytes32 => address[]) private grantees;

    /// documentId => grantee => index in grantees list, or 0 when absent
    mapping(bytes32 => mapping(address => uint256)) private granteeIndex;

    event DocumentRegistered(
        bytes32 indexed documentId,
        address indexed owner,
        string metadataURI
    );
    event AccessGranted(bytes32 indexed documentId, address indexed grantee, address indexed grantedBy);
    event AccessRevoked(bytes32 indexed documentId, address indexed grantee, address indexed revokedBy);
    event DocumentTransferred(bytes32 indexed documentId, address indexed previousOwner, address indexed newOwner);

    error DocumentAlreadyExists(bytes32 documentId);
    error DocumentNotFound(bytes32 documentId);
    error NotDocumentOwner(bytes32 documentId, address caller);
    error InvalidAddress();
    error EmptyMetadataURI();
    error InvalidRecipient(bytes32 documentId, address recipient);
    error AccessNotGranted(bytes32 documentId, address grantee);

    modifier onlyOwnerOf(bytes32 documentId) {
        Document storage doc = documents[documentId];
        if (!doc.exists) revert DocumentNotFound(documentId);
        if (doc.owner != msg.sender) revert NotDocumentOwner(documentId, msg.sender);
        _;
    }

    /// @notice Registers ownership of a document under the caller's address.
    function registerDocument(bytes32 documentId, string calldata metadataURI) external {
        if (documentId == bytes32(0)) revert InvalidAddress();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (documents[documentId].exists) revert DocumentAlreadyExists(documentId);

        documents[documentId] = Document({
            documentId: documentId,
            owner: msg.sender,
            metadataURI: metadataURI,
            registeredAt: block.timestamp,
            exists: true
        });
        documentIds[msg.sender].push(documentId);
        access[documentId][msg.sender] = true;

        emit DocumentRegistered(documentId, msg.sender, metadataURI);
    }

    /// @notice Grants a grantee permission to access a document. Owner only.
    function grantAccess(bytes32 documentId, address grantee) external onlyOwnerOf(documentId) {
        if (grantee == address(0)) revert InvalidAddress();
        if (grantee == documents[documentId].owner) revert InvalidRecipient(documentId, grantee);

        if (!access[documentId][grantee]) {
            access[documentId][grantee] = true;
            grantedBy[documentId][grantee] = msg.sender;

            grantees[documentId].push(grantee);
            granteeIndex[documentId][grantee] = grantees[documentId].length;

            emit AccessGranted(documentId, grantee, msg.sender);
        }
    }

    /// @notice Revokes a grantee's permission. Owner or the grantee themself may revoke.
    function revokeAccess(bytes32 documentId, address grantee) external {
        Document storage doc = documents[documentId];
        if (!doc.exists) revert DocumentNotFound(documentId);

        bool isOwner = doc.owner == msg.sender;
        bool isGrantee = msg.sender == grantee;
        if (!isOwner && !isGrantee) revert NotDocumentOwner(documentId, msg.sender);
        if (grantee == doc.owner) revert InvalidRecipient(documentId, grantee);
        if (!access[documentId][grantee]) revert AccessNotGranted(documentId, grantee);

        delete access[documentId][grantee];
        delete grantedBy[documentId][grantee];

        _removeGrantee(documentId, grantee);

        emit AccessRevoked(documentId, grantee, msg.sender);
    }

    /// @notice Returns whether an account has access to a document. Owner always has access.
    function checkAccess(bytes32 documentId, address account) public view returns (bool) {
        Document storage doc = documents[documentId];
        if (!doc.exists) return false;
        if (doc.owner == account) return true;
        return access[documentId][account];
    }

    /// @notice Convenience view returning access for a single document via the grantee mapping.
    function hasAccess(bytes32 documentId, address grantee) external view returns (bool) {
        return checkAccess(documentId, grantee);
    }

    function getDocument(bytes32 documentId) external view returns (Document memory) {
        Document storage doc = documents[documentId];
        if (!doc.exists) revert DocumentNotFound(documentId);
        return doc;
    }

    function documentOwner(bytes32 documentId) external view returns (address) {
        Document storage doc = documents[documentId];
        if (!doc.exists) revert DocumentNotFound(documentId);
        return doc.owner;
    }

    function metadataOf(bytes32 documentId) external view returns (string memory) {
        Document storage doc = documents[documentId];
        if (!doc.exists) revert DocumentNotFound(documentId);
        return doc.metadataURI;
    }

    /// @notice Returns the document ids registered by an owner.
    function documentsOf(address owner) external view returns (bytes32[] memory) {
        return documentIds[owner];
    }

    /// @notice Returns the grantees who currently hold access to a document.
    function granteesOf(bytes32 documentId) external view returns (address[] memory) {
        if (!documents[documentId].exists) revert DocumentNotFound(documentId);
        return grantees[documentId];
    }

    function _removeGrantee(bytes32 documentId, address grantee) private {
        address[] storage list = grantees[documentId];
        uint256 index = granteeIndex[documentId][grantee];
        if (index == 0) return;

        uint256 lastIndex = list.length - 1;
        if (index != lastIndex + 1) {
            address moved = list[lastIndex];
            list[index - 1] = moved;
            granteeIndex[documentId][moved] = index;
        }

        list.pop();
        delete granteeIndex[documentId][grantee];
    }

    /// @notice Transfers document ownership. Current owner only.
    /// Grants made by the previous owner are revoked; the new owner must grant access explicitly.
    function transferOwnership(bytes32 documentId, address newOwner) external onlyOwnerOf(documentId) {
        if (newOwner == address(0)) revert InvalidAddress();

        bytes32[] storage ids = documentIds[msg.sender];
        uint256 length = ids.length;
        for (uint256 i = 0; i < length; i++) {
            if (ids[i] == documentId) {
                ids[i] = ids[length - 1];
                ids.pop();
                break;
            }
        }

        _clearGrants(documentId);
        delete access[documentId][msg.sender];

        documents[documentId].owner = newOwner;
        documentIds[newOwner].push(documentId);
        access[documentId][newOwner] = true;

        emit DocumentTransferred(documentId, msg.sender, newOwner);
    }

    /// @dev Drops every grant on a document. Not a loop-over-all-mapping: the enumerable
    /// grantee list makes the work proportional to the number of live grants.
    function _clearGrants(bytes32 documentId) private {
        address[] storage list = grantees[documentId];
        for (uint256 i = 0; i < list.length; i++) {
            address grantee = list[i];
            delete access[documentId][grantee];
            delete grantedBy[documentId][grantee];
            delete granteeIndex[documentId][grantee];
        }
        delete grantees[documentId];
    }
}