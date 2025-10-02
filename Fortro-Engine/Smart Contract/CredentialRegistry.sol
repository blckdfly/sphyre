// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AccessControl.sol";

contract CredentialRegistry is AccessControl {
    struct Credential {
        bool isRegistered;
        bool isRevoked;
        uint256 registeredAt;
        uint256 revokedAt;
        address registeredBy;
        address revokedBy;
        string metadataURI; // IPFS URI for credential metadata
    }

    mapping(bytes32 => Credential) private _credentials;

    event CredentialRegistered(
        bytes32 indexed credentialId,
        string indexed did,
        address indexed registeredBy,
        uint256 timestamp
    );

    event CredentialRevoked(
        bytes32 indexed credentialId,
        string indexed did,
        address indexed revokedBy,
        uint256 timestamp
    );

    function _generateCredentialId(string memory did, string memory credentialHash)
    internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(did, credentialHash));
    }

    function registerCredential(
        string memory did,
        string memory credentialHash,
        string memory metadataURI
    ) public onlyRole(ISSUER_ROLE) returns (bytes32) {
        require(bytes(did).length > 0, "Empty DID");
        require(bytes(credentialHash).length > 0, "Empty hash");

        bytes32 credentialId = _generateCredentialId(did, credentialHash);
        require(!_credentials[credentialId].isRegistered, "Already registered");

        _credentials[credentialId] = Credential({
            isRegistered: true,
            isRevoked: false,
            registeredAt: block.timestamp,
            revokedAt: 0,
            registeredBy: msg.sender,
            revokedBy: address(0),
            metadataURI: metadataURI
        });

        emit CredentialRegistered(credentialId, did, msg.sender, block.timestamp);
        return credentialId;
    }

    function revokeCredential(string memory did, string memory credentialHash)
    public onlyRole(ISSUER_ROLE) returns (bool) {
        bytes32 credentialId = _generateCredentialId(did, credentialHash);
        require(_credentials[credentialId].isRegistered, "Not registered");
        require(!_credentials[credentialId].isRevoked, "Already revoked");

        // Only the issuer or verifier can revoke
        require(
            _credentials[credentialId].registeredBy == msg.sender ||
            hasRole(VERIFIER_ROLE, msg.sender),
            "Unauthorized"
        );

        _credentials[credentialId].isRevoked = true;
        _credentials[credentialId].revokedAt = block.timestamp;
        _credentials[credentialId].revokedBy = msg.sender;

        emit CredentialRevoked(credentialId, did, msg.sender, block.timestamp);
        return true;
    }

    function isCredentialValid(string memory did, string memory credentialHash)
    public view returns (bool) {
        bytes32 credentialId = _generateCredentialId(did, credentialHash);
        return _credentials[credentialId].isRegistered &&
            !_credentials[credentialId].isRevoked;
    }

    function getCredentialInfo(string memory did, string memory credentialHash)
    public view returns (
        bool isRegistered,
        bool isRevoked,
        uint256 registeredAt,
        uint256 revokedAt,
        address registeredBy,
        address revokedBy,
        string memory metadataURI
    ) {
        bytes32 credentialId = _generateCredentialId(did, credentialHash);
        Credential memory credential = _credentials[credentialId];

        return (
            credential.isRegistered,
            credential.isRevoked,
            credential.registeredAt,
            credential.revokedAt,
            credential.registeredBy,
            credential.revokedBy,
            credential.metadataURI
        );
    }
}
