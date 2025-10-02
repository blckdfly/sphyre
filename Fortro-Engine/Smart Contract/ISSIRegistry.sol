// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ConsentRegistry.sol";

/**
 * @title ISSIRegistry
 * @dev Interface for the Self-Sovereign Identity (SSI) Registry
 */
interface ISSIRegistry {
    // Credential functions
    function registerCredential(string memory did, string memory credentialHash, string memory metadataURI) external returns (bytes32);
    function revokeCredential(string memory did, string memory credentialHash) external returns (bool);
    function isCredentialValid(string memory did, string memory credentialHash) external view returns (bool);

    // Schema functions
    function registerSchema(string memory schemaId, string memory schemaURI) external returns (bool);
    function getSchemaURI(string memory schemaId) external view returns (string memory);
    function isSchemaRegistered(string memory schemaId) external view returns (bool);

    // Consent functions
    function grantConsent(string memory userDid, string memory verifierDid, string memory purpose, string memory dataCategories, ConsentRegistry.AccessLevel accessLevel, uint256 expiresAt) external returns (bool);
    function revokeConsent(string memory userDid, string memory verifierDid, string memory purpose) external returns (bool);
    function isConsentValid(string memory userDid, string memory verifierDid, string memory purpose) external view returns (bool);

    // Role management
    function addIssuer(address issuer) external;
    function removeIssuer(address issuer) external;
    function isIssuer(address issuer) external view returns (bool);
    function addVerifier(address verifier) external;
    function removeVerifier(address verifier) external;
    function isVerifier(address verifier) external view returns (bool);
}
