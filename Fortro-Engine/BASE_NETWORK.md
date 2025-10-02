# Base Network Integration Guide

This document provides additional information about the Base Network integration in Fortro-Engine.

## What is Base Network?

[Base Network](https://base.org) is an Ethereum Layer 2 (L2) solution developed by Coinbase. It's built on the Optimism stack and offers several advantages:

- **Lower transaction costs**: Significantly reduced gas fees compared to Ethereum Mainnet
- **Faster transactions**: Quicker confirmation times for better user experience
- **Ethereum security**: Inherits security from Ethereum Mainnet
- **Ethereum compatibility**: Works with existing Ethereum tools and infrastructure

## Network Details

### Base Mainnet
- **RPC URL**: `https://mainnet.base.org`
- **Chain ID**: 8453
- **Explorer**: [https://basescan.org](https://basescan.org)

### Base Sepolia Testnet
- **RPC URL**: `https://sepolia.base.org`
- **Chain ID**: 84532 (previously 84531)
- **Explorer**: [https://sepolia.basescan.org](https://sepolia.basescan.org)

## Configuration

Fortro-Engine is configured to use Base Network by default. The RPC URL is set in the `.env` file:

```
ETHEREUM_RPC_URL=https://sepolia.base.org
```

For production environments, it's recommended to use Base Mainnet:

```
ETHEREUM_RPC_URL=https://mainnet.base.org
```

After deploying the SSIRegistry to your chosen Base network, set the deployed address in your environment:

```
REGISTRY_ADDRESS=0xYourDeployedRegistryAddress
```

Then verify by calling GET /health and confirming:
- blockchain.registry_address shows your address
- blockchain.registry_accessible is true
- blockchain.chain_id matches the expected Base chain ID (8453 Mainnet, 84532 Sepolia)

## Testing the Connection

To verify that Fortro-Engine is properly connected to Base Network, run the verification script:

```
./verify_base_connection.bat
```

This script will connect to Base Network and display information about the connection, including the chain ID, latest block number, and gas price.

## Deploying Smart Contracts

To test smart contract deployment on Base Network, run the deployment script:

```
./deploy_test_contract.bat
```

This script will deploy a simple storage contract to Base Network and interact with it. Note that you'll need to have a funded wallet to deploy contracts. You can add your private key to the `.env` file:

```
TEST_PRIVATE_KEY=your_private_key_here
```

For Base Sepolia Testnet, you can get testnet ETH from the [Base Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet).

## Base Network Considerations

### Gas Optimization

Base Network has lower gas costs than Ethereum Mainnet, but gas optimization is still important for efficient operation. Consider implementing the following optimizations:

- Batch transactions when possible
- Use calldata instead of memory for function parameters
- Minimize storage operations
- Use events for data that doesn't need to be stored on-chain

### Transaction Finality

Base Network has faster transaction finality than Ethereum Mainnet, but it's still important to wait for transactions to be confirmed before considering them final. The `wait_for_transaction` method in the `EthereumClient` can be used to wait for a transaction to be confirmed.

### Contract Deployment

When deploying contracts to Base Network, make sure to use the correct chain ID:

- Base Sepolia Testnet: 84532 (previously 84531)
- Base Mainnet: 8453

The `deploy_registry` method in the `EthereumClient` automatically uses the correct chain ID based on the RPC URL.

## Additional Resources

- [Base Network Documentation](https://docs.base.org)
- [Base Network GitHub](https://github.com/base-org)
- [Optimism Documentation](https://community.optimism.io/docs/developers/build/differences/)
- [Ethers.rs Documentation](https://docs.rs/ethers/latest/ethers/)