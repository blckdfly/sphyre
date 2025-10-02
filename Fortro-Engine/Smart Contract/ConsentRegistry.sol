// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AccessControl.sol";

/**
 * @title ConsentRegistry
 * @dev Contract for managing consent records in the Self-Sovereign Identity (SSI) system
 */
contract ConsentRegistry is AccessControl {
    enum AccessLevel { ReadOnly, ReadWrite, FullAccess, OneTime }

    struct ConsentRecord {
        bool isRegistered;
        bool isRevoked;
        uint256 registeredAt;
        uint256 revokedAt;
        address registeredBy;
        address revokedBy;
        uint256 expiresAt;
        string purpose;
        string dataCategories;
        AccessLevel accessLevel;
    }

    mapping(bytes32 => ConsentRecord) private _consents;

    event ConsentGranted(
        string indexed userDid,
        string indexed verifierDid,
        string purpose,
        address indexed registeredBy,
        uint256 timestamp
    );

    event ConsentRevoked(
        string indexed userDid,
        string indexed verifierDid,
        string purpose,
        address indexed revokedBy,
        uint256 timestamp
    );

    function _generateConsentKey(
        string memory userDid,
        string memory verifierDid,
        string memory purpose
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(userDid, verifierDid, purpose));
    }

    function grantConsent(
        string memory userDid,
        string memory verifierDid,
        string memory purpose,
        string memory dataCategories,
        AccessLevel accessLevel,
        uint256 expiresAt
    ) public returns (bool) {
        require(bytes(userDid).length > 0, "Empty user DID");
        require(bytes(verifierDid).length > 0, "Empty verifier DID");
        require(bytes(purpose).length > 0, "Empty purpose");

        bytes32 key = _generateConsentKey(userDid, verifierDid, purpose);

        if (_consents[key].isRegistered && _consents[key].isRevoked) {
            // Reactivate revoked consent
            _consents[key].isRevoked = false;
            _consents[key].revokedAt = 0;
            _consents[key].revokedBy = address(0);
        }

        _consents[key].isRegistered = true;
        _consents[key].registeredAt = block.timestamp;
        _consents[key].registeredBy = msg.sender;
        _consents[key].expiresAt = expiresAt;
        _consents[key].purpose = purpose;
        _consents[key].dataCategories = dataCategories;
        _consents[key].accessLevel = accessLevel;

        emit ConsentGranted(userDid, verifierDid, purpose, msg.sender, block.timestamp);
        return true;
    }

    function revokeConsent(
        string memory userDid,
        string memory verifierDid,
        string memory purpose
    ) public returns (bool) {
        bytes32 key = _generateConsentKey(userDid, verifierDid, purpose);
        require(_consents[key].isRegistered, "Consent not found");
        require(!_consents[key].isRevoked, "Already revoked");

        _consents[key].isRevoked = true;
        _consents[key].revokedAt = block.timestamp;
        _consents[key].revokedBy = msg.sender;

        emit ConsentRevoked(userDid, verifierDid, purpose, msg.sender, block.timestamp);
        return true;
    }

    function isConsentValid(
        string memory userDid,
        string memory verifierDid,
        string memory purpose
    ) public view returns (bool) {
        bytes32 key = _generateConsentKey(userDid, verifierDid, purpose);

        if (!_consents[key].isRegistered || _consents[key].isRevoked) {
            return false;
        }

        if (_consents[key].expiresAt > 0 && block.timestamp > _consents[key].expiresAt) {
            return false;
        }

        return true;
    }
}