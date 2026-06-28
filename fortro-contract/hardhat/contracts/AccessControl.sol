// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ERC2771Context.sol";

/**
 * @title SphyreAccessControl
 * @dev Contract module that allows children to implement role-based access control mechanisms.
 * Now supports meta-transactions via ERC2771Context.
 */
contract SphyreAccessControl is ERC2771Context {
    // Role => Address => Has role
    mapping(bytes32 => mapping(address => bool)) private _roles;
    
    // Owner of the contract
    address private _owner;
    
    // Role constants
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant HOLDER_ROLE = keccak256("HOLDER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    
    // Events
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event HolderRegistered(string indexed holderDid, uint256 timestamp);
    
    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     * @param trustedForwarder_ The address of the trusted forwarder for meta-transactions
     */
    constructor(address trustedForwarder_) ERC2771Context(trustedForwarder_) {
        _owner = _msgSender();
        _grantRole(ADMIN_ROLE, _msgSender());
        emit OwnershipTransferred(address(0), _msgSender());
    }
    
    /**
     * @dev Modifier that checks if the caller has a specific role.
     * Reverts if the caller doesn't have the role.
     */
    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "AccessControl: caller does not have the required role");
        _;
    }
    
    /**
     * @dev Modifier that checks if the caller is the owner.
     * Reverts if the caller is not the owner.
     */
    modifier onlyOwner() {
        require(_msgSender() == _owner, "AccessControl: caller is not the owner");
        _;
    }
    
    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }
    
    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "AccessControl: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
    
    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }
    
    /**
     * @dev Grants `role` to `account`.
     * Can only be called by an account with the admin role.
     */
    function grantRole(bytes32 role, address account) public onlyRole(ADMIN_ROLE) {
        _grantRole(role, account);
    }
    
    /**
     * @dev Revokes `role` from `account`.
     * Can only be called by an account with the admin role.
     */
    function revokeRole(bytes32 role, address account) public onlyRole(ADMIN_ROLE) {
        _revokeRole(role, account);
    }
    
    /**
     * @dev Grants `role` to `account`.
     * Internal function without access restriction.
     */
    function _grantRole(bytes32 role, address account) internal {
        if (!hasRole(role, account)) {
            _roles[role][account] = true;
            emit RoleGranted(role, account, _msgSender());
        }
    }
    
    /**
     * @dev Revokes `role` from `account`.
     * Internal function without access restriction.
     */
    function _revokeRole(bytes32 role, address account) internal {
        if (hasRole(role, account)) {
            _roles[role][account] = false;
            emit RoleRevoked(role, account, _msgSender());
        }
    }
    
    /**
     * @dev Sets the trusted forwarder address for meta-transactions
     * Can only be called by an admin
     * @param forwarder The address of the new trusted forwarder
     */
    function setTrustedForwarder(address forwarder) public onlyRole(ADMIN_ROLE) {
        _setTrustedForwarder(forwarder);
    }
}