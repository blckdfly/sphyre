// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ISSIRegistry
 * @dev Interface for the Self-Sovereign Identity (SSI) Registry
 */
interface ISSIRegistry {
    /**
     * @dev Register a credential in the registry
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return success True if the operation was successful
     */
    function registerCredential(string memory did, string memory credentialHash) external returns (bool);

    /**
     * @dev Revoke a credential in the registry
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return success True if the operation was successful
     */
    function revokeCredential(string memory did, string memory credentialHash) external returns (bool);

    /**
     * @dev Check if a credential is registered
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return isRegistered True if the credential is registered
     */
    function isCredentialRegistered(string memory did, string memory credentialHash) external view returns (bool);

    /**
     * @dev Check if a credential is revoked
     * @param did The DID of the credential subject
     * @param credentialHash The hash of the credential
     * @return isRevoked True if the credential is revoked
     */
    function isCredentialRevoked(string memory did, string memory credentialHash) external view returns (bool);

    /**
     * @dev Register a schema in the registry
     * @param schemaId The ID of the schema
     * @param schemaHash The hash of the schema
     * @return success True if the operation was successful
     */
    function registerSchema(string memory schemaId, string memory schemaHash) external returns (bool);

    /**
     * @dev Get the hash of a schema
     * @param schemaId The ID of the schema
     * @return schemaHash The hash of the schema
     */
    function getSchemaHash(string memory schemaId) external view returns (string memory);

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
    ) external returns (bool);

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
    ) external returns (bool);

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
    ) external view returns (bool);
}
