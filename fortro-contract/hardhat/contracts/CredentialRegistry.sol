// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AccessControl.sol";

/**
 * @title CredentialRegistry
 * @dev Contract for managing Self-Sovereign Identity (SSI) credentials
 */
abstract contract CredentialRegistry is SphyreAccessControl {
    // Credential structure
    struct Credential {
        bool isRegistered;
        bool isRevoked;
        uint256 registeredAt;
        uint256 revokedAt;
        address registeredBy;
        address revokedBy;
    }
    
    // Mapping from DID + credential hash to credential data
    mapping(bytes32 => Credential) private _credentials;
    
    // Events
    event CredentialRegistered(string indexed did, string credentialHash, address indexed registeredBy, uint256 timestamp);
    event CredentialRevoked(string indexed did, string credentialHash, address indexed revokedBy, uint256 timestamp);
    
    /**
     * @dev Generate a unique key for credential mappings
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return A unique bytes32 key
     */
    function _generateCredentialKey(string memory did, string memory credentialHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(did, credentialHash));
    }
    
    /**
     * @dev Register a credential in the registry
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return success True if the operation was successful
     */
    function registerCredential(string memory did, string memory credentialHash) public virtual onlyRole(ISSUER_ROLE) returns (bool) {
        require(bytes(did).length > 0, "CredentialRegistry: DID cannot be empty");
        require(bytes(credentialHash).length > 0, "CredentialRegistry: Credential hash cannot be empty");
        
        bytes32 key = _generateCredentialKey(did, credentialHash);
        
        // Check if the credential is already registered
        require(!_credentials[key].isRegistered, "CredentialRegistry: Credential already registered");
        
        // Register the credential
        _credentials[key] = Credential({
            isRegistered: true,
            isRevoked: false,
            registeredAt: block.timestamp,
            revokedAt: 0,
            registeredBy: _msgSender(),
            revokedBy: address(0)
        });
        
        emit CredentialRegistered(did, credentialHash, _msgSender(), block.timestamp);
        return true;
    }
    
    /**
     * @dev Revoke a credential in the registry
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return success True if the operation was successful
     */
    function revokeCredential(string memory did, string memory credentialHash) public virtual onlyRole(ISSUER_ROLE) returns (bool) {
        require(bytes(did).length > 0, "CredentialRegistry: DID cannot be empty");
        require(bytes(credentialHash).length > 0, "CredentialRegistry: Credential hash cannot be empty");
        
        bytes32 key = _generateCredentialKey(did, credentialHash);
        
        // Check if the credential is registered
        require(_credentials[key].isRegistered, "CredentialRegistry: Credential not registered");
        
        // Check if the credential is already revoked
        require(!_credentials[key].isRevoked, "CredentialRegistry: Credential already revoked");
        
        // Check if the caller is the issuer who registered the credential or an admin
        require(
            _credentials[key].registeredBy == _msgSender() || hasRole(ADMIN_ROLE, _msgSender()),
            "CredentialRegistry: Only the issuer or an admin can revoke the credential"
        );
        
        // Revoke the credential
        _credentials[key].isRevoked = true;
        _credentials[key].revokedAt = block.timestamp;
        _credentials[key].revokedBy = _msgSender();
        
        emit CredentialRevoked(did, credentialHash, _msgSender(), block.timestamp);
        return true;
    }
    
    /**
     * @dev Check if a credential is registered
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return isRegistered True if the credential is registered
     */
    function isCredentialRegistered(string memory did, string memory credentialHash) public view virtual returns (bool) {
        bytes32 key = _generateCredentialKey(did, credentialHash);
        return _credentials[key].isRegistered;
    }
    
    /**
     * @dev Check if a credential is revoked
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return isRevoked True if the credential is revoked
     */
    function isCredentialRevoked(string memory did, string memory credentialHash) public view virtual returns (bool) {
        bytes32 key = _generateCredentialKey(did, credentialHash);
        return _credentials[key].isRevoked;
    }
    
    /**
     * @dev Get detailed information about a credential
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return isRegistered True if the credential is registered
     * @return isRevoked True if the credential is revoked
     * @return registeredAt Timestamp when the credential was registered
     * @return revokedAt Timestamp when the credential was revoked (0 if not revoked)
     * @return registeredBy Address that registered the credential
     * @return revokedBy Address that revoked the credential (0x0 if not revoked)
     */
    function getCredentialInfo(string memory did, string memory credentialHash) public view returns (
        bool isRegistered,
        bool isRevoked,
        uint256 registeredAt,
        uint256 revokedAt,
        address registeredBy,
        address revokedBy
    ) {
        bytes32 key = _generateCredentialKey(did, credentialHash);
        Credential memory credential = _credentials[key];
        
        return (
            credential.isRegistered,
            credential.isRevoked,
            credential.registeredAt,
            credential.revokedAt,
            credential.registeredBy,
            credential.revokedBy
        );
    }
}