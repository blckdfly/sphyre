// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AccessControl.sol";

/**
 * @title ConsentRegistry
 * @dev Contract for managing consent records in the Self-Sovereign Identity (SSI) system
 */
abstract contract ConsentRegistry is SphyreAccessControl {
    // Consent record structure
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
        uint8 accessLevel; // 0: ReadOnly, 1: ReadWrite, 2: FullAccess, 3: OneTime
    }
    
    // Mapping from user DID + verifier DID + purpose to consent record
    mapping(bytes32 => ConsentRecord) private _consents;
    
    // Events
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
    
    /**
     * @dev Generate a unique key for consent mappings
     * @param userDid The DID of the user granting consent
     * @param verifierDid The DID of the verifier receiving consent
     * @param purpose The purpose for which consent is granted
     * @return A unique bytes32 key
     */
    function _generateConsentKey(
        string memory userDid, 
        string memory verifierDid, 
        string memory purpose
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(userDid, verifierDid, purpose));
    }
    
    /**
     * @dev Grant consent
     * @param userDid The DID of the user granting consent
     * @param verifierDid The DID of the verifier receiving consent
     * @param purpose The purpose for which consent is granted
     * @param dataCategories The categories of data being shared (JSON string)
     * @param accessLevel The level of access granted (0: ReadOnly, 1: ReadWrite, 2: FullAccess, 3: OneTime)
     * @param expiresAt The timestamp when the consent expires (0 for no expiration)
     * @return success True if the operation was successful
     */
    function grantConsent(
        string memory userDid,
        string memory verifierDid,
        string memory purpose,
        string memory dataCategories,
        uint8 accessLevel,
        uint256 expiresAt
    ) public virtual returns (bool) {
        require(bytes(userDid).length > 0, "ConsentRegistry: User DID cannot be empty");
        require(bytes(verifierDid).length > 0, "ConsentRegistry: Verifier DID cannot be empty");
        require(bytes(purpose).length > 0, "ConsentRegistry: Purpose cannot be empty");
        require(accessLevel <= 3, "ConsentRegistry: Invalid access level");
        
        bytes32 key = _generateConsentKey(userDid, verifierDid, purpose);
        
        // Check if consent already exists
        if (_consents[key].isRegistered) {
            // If consent exists but is revoked, we can reactivate it
            if (_consents[key].isRevoked) {
                _consents[key].isRevoked = false;
                _consents[key].revokedAt = 0;
                _consents[key].revokedBy = address(0);
                _consents[key].registeredAt = block.timestamp;
                _consents[key].registeredBy = _msgSender();
                _consents[key].expiresAt = expiresAt;
                _consents[key].dataCategories = dataCategories;
                _consents[key].accessLevel = accessLevel;
            } else {
                // If consent exists and is not revoked, update it
                _consents[key].expiresAt = expiresAt;
                _consents[key].dataCategories = dataCategories;
                _consents[key].accessLevel = accessLevel;
            }
        } else {
            // Create a new consent record
            _consents[key] = ConsentRecord({
                isRegistered: true,
                isRevoked: false,
                registeredAt: block.timestamp,
                revokedAt: 0,
                registeredBy: _msgSender(),
                revokedBy: address(0),
                expiresAt: expiresAt,
                purpose: purpose,
                dataCategories: dataCategories,
                accessLevel: accessLevel
            });
        }
        
        emit ConsentGranted(userDid, verifierDid, purpose, _msgSender(), block.timestamp);
        return true;
    }
    
    /**
     * @dev Revoke consent
     * @param userDid The DID of the user who granted consent
     * @param verifierDid The DID of the verifier who received consent
     * @param purpose The purpose for which consent was granted
     * @return success True if the operation was successful
     */
    function revokeConsent(
        string memory userDid,
        string memory verifierDid,
        string memory purpose
    ) public virtual returns (bool) {
        require(bytes(userDid).length > 0, "ConsentRegistry: User DID cannot be empty");
        require(bytes(verifierDid).length > 0, "ConsentRegistry: Verifier DID cannot be empty");
        require(bytes(purpose).length > 0, "ConsentRegistry: Purpose cannot be empty");
        
        bytes32 key = _generateConsentKey(userDid, verifierDid, purpose);
        
        // Check if the consent is registered
        require(_consents[key].isRegistered, "ConsentRegistry: Consent not registered");
        
        // Check if the consent is already revoked
        require(!_consents[key].isRevoked, "ConsentRegistry: Consent already revoked");
        
        // Revoke the consent
        _consents[key].isRevoked = true;
        _consents[key].revokedAt = block.timestamp;
        _consents[key].revokedBy = _msgSender();
        
        emit ConsentRevoked(userDid, verifierDid, purpose, _msgSender(), block.timestamp);
        return true;
    }
    
    /**
     * @dev Check if consent is valid
     * @param userDid The DID of the user who granted consent
     * @param verifierDid The DID of the verifier who received consent
     * @param purpose The purpose for which consent was granted
     * @return isValid True if the consent is valid (registered, not revoked, and not expired)
     */
    function isConsentValid(
        string memory userDid,
        string memory verifierDid,
        string memory purpose
    ) public view virtual returns (bool) {
        bytes32 key = _generateConsentKey(userDid, verifierDid, purpose);
        
        // Check if the consent is registered and not revoked
        if (!_consents[key].isRegistered || _consents[key].isRevoked) {
            return false;
        }
        
        // Check if the consent is expired
        if (_consents[key].expiresAt > 0 && block.timestamp > _consents[key].expiresAt) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @dev Get detailed information about a consent record
     * @param userDid The DID of the user who granted consent
     * @param verifierDid The DID of the verifier who received consent
     * @param purpose The purpose for which consent was granted
     * @return isRegistered True if the consent is registered
     * @return isRevoked True if the consent is revoked
     * @return registeredAt Timestamp when the consent was registered
     * @return revokedAt Timestamp when the consent was revoked (0 if not revoked)
     * @return registeredBy Address that registered the consent
     * @return revokedBy Address that revoked the consent (0x0 if not revoked)
     * @return expiresAt Timestamp when the consent expires (0 for no expiration)
     * @return purpose The purpose for which consent was granted
     * @return dataCategories The categories of data being shared
     * @return accessLevel The level of access granted
     */
    function getConsentInfo(
        string memory userDid,
        string memory verifierDid,
        string memory purpose
    ) public view returns (
        bool isRegistered,
        bool isRevoked,
        uint256 registeredAt,
        uint256 revokedAt,
        address registeredBy,
        address revokedBy,
        uint256 expiresAt,
        string memory,
        string memory dataCategories,
        uint8 accessLevel
    ) {
        bytes32 key = _generateConsentKey(userDid, verifierDid, purpose);
        ConsentRecord memory consent = _consents[key];
        
        return (
            consent.isRegistered,
            consent.isRevoked,
            consent.registeredAt,
            consent.revokedAt,
            consent.registeredBy,
            consent.revokedBy,
            consent.expiresAt,
            consent.purpose,
            consent.dataCategories,
            consent.accessLevel
        );
    }
}