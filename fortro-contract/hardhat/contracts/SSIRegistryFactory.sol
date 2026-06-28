// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SSIRegistry.sol";
import "./ERC2771Context.sol";

/**
 * @title SSIRegistryFactory
 * @dev Factory contract for deploying new SSI Registry instances
 * Now supports meta-transactions via ERC2771Context.
 */
contract SSIRegistryFactory is ERC2771Context {
    // Event emitted when a new registry is created
    event RegistryCreated(address indexed registry, string name, string description, address indexed owner);
    
    // Array to store all created registries
    address[] private _registries;
    
    /**
     * @dev Constructor
     * @param trustedForwarder_ The address of the trusted forwarder for meta-transactions
     */
    constructor(address trustedForwarder_) ERC2771Context(trustedForwarder_) {}
    
    /**
     * @dev Create a new SSI Registry
     * @param name The name of the registry
     * @param description A description of the registry
     * @return registry The address of the newly created registry
     */
    function createRegistry(string memory name, string memory description, address registryForwarder) public returns (address) {
        // Create a new registry with specified trusted forwarder (can be same as factory's or different)
        SSIRegistry registry = new SSIRegistry(name, description, registryForwarder);
        
        // Transfer ownership to the caller
        registry.transferOwnership(_msgSender());
        
        // Add the registry to the array
        _registries.push(address(registry));
        
        // Emit an event
        emit RegistryCreated(address(registry), name, description, _msgSender());
        
        return address(registry);
    }
    
    /**
     * @dev Get the number of registries created by this factory
     * @return count The number of registries
     */
    function getRegistryCount() public view returns (uint256) {
        return _registries.length;
    }
    
    /**
     * @dev Get a registry address by index
     * @param index The index of the registry
     * @return registry The address of the registry
     */
    function getRegistryByIndex(uint256 index) public view returns (address) {
        require(index < _registries.length, "SSIRegistryFactory: Index out of bounds");
        return _registries[index];
    }
    
    /**
     * @dev Get all registries created by this factory
     * @return registries An array of registry addresses
     */
    function getAllRegistries() public view returns (address[] memory) {
        return _registries;
    }
}