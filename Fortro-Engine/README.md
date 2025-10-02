# Fortro-Engine

## Configuration

Fortro-Engine requires several environment variables to be set for proper operation. These can be provided either through system environment variables or through a `.env` file in the project root.

### Required Environment Variables

Create a `.env` file in the project root with the following variables:

```
MONGODB_URI=mongodb://localhost:27017/fortro
IPFS_API_URL=http://localhost:5001
ETHEREUM_RPC_URL=https://mainnet.base.org
PORT=3000
JWT_SECRET=your_secret_key_here
JWT_EXPIRATION=86400
ISSUER_DID=did:example:your_issuer_did
ISSUER_PRIVATE_KEY=your_private_key_here
# Optional: deployed SSIRegistry contract address (if omitted, features requiring the contract will error until set)
REGISTRY_ADDRESS=0xYourDeployedRegistryAddress
# Optional: comma-separated list of allowed origins for CORS
CORS_ALLOWED_ORIGINS=http://sphyre-app:3000,http://sphyre-verifier:3000,http://sphyre-issuers:80,http://sphyre-website:80
```

#### Variable Descriptions

- `MONGODB_URI`: Connection string for MongoDB
- `IPFS_API_URL`: URL for the IPFS API (Kubo implementation)
- `ETHEREUM_RPC_URL`: URL for the Ethereum RPC endpoint (default: Base Network Mainnet)
- `PORT`: Port for the HTTP server (default: 3000)
- `JWT_SECRET`: Secret key for JWT token generation
- `JWT_EXPIRATION`: JWT token expiration time in seconds (default: 86400 - 24 hours)
- `ISSUER_DID`: DID for the issuer
- `ISSUER_PRIVATE_KEY`: Private key for the issuer
- `CORS_ALLOWED_ORIGINS` (optional): Comma-separated list of allowed origins for Cross-Origin Resource Sharing. If set, only these origins can access the API from browsers. If unset or empty, the server allows any origin (development-friendly default). Example: `http://sphyre-app:3000,http://sphyre-verifier:3000,http://sphyre-issuers:80,http://sphyre-website:80`

### How to set REGISTRY_ADDRESS

If you see a log warning like:

"REGISTRY_ADDRESS not set. On-chain features that require the SSIRegistry will not work until configured."

set the deployed SSIRegistry contract address via environment variable. You can set it in several ways:

1) Using the .env file (recommended for local/dev):
- Edit the project’s `.env` and add:
  REGISTRY_ADDRESS=0xYourDeployedRegistryAddress
- Restart the service.

2) Windows PowerShell (temporary for current process):
- Before starting the app, run:
  $env:REGISTRY_ADDRESS = "0xYourDeployedRegistryAddress"
  cargo run

3) Linux/macOS shell (temporary for current process):
- Run:
  export REGISTRY_ADDRESS=0xYourDeployedRegistryAddress
  cargo run

4) Docker / docker-compose:
- In your compose service:
  environment:
    - REGISTRY_ADDRESS=0xYourDeployedRegistryAddress
- Or when running docker run:
  docker run -e REGISTRY_ADDRESS=0xYourDeployedRegistryAddress ...

Verification after setting:
- Call GET /health and check the blockchain section:
  - registry_address should show your address
  - registry_accessible should be true if the contract is reachable and the wallet can call its view functions
  - chain_id should match your target L2 (e.g., 8453 Base Mainnet, 84532 Base Sepolia)

Notes:
- Ensure the address points to a contract that matches the SSIRegistry interface used by the engine.
- Make sure your ISSUER_PRIVATE_KEY has the appropriate role on-chain (e.g., issuer/verifier) to perform writes.

### Base Network Integration

Fortro-Engine is built on [Base Network](https://base.org), an Ethereum Layer 2 (L2) solution developed by Coinbase. Base Network offers several advantages:

- Lower transaction costs: Significantly reduced gas fees compared to Ethereum Mainnet
- Faster transactions: Quicker confirmation times for better user experience
- Ethereum security: Inherits security from Ethereum Mainnet
- Ethereum compatibility: Works with existing Ethereum tools and infrastructure

#### Base Network RPC Endpoints

The default configuration uses Base Network Mainnet. You can also use these alternative endpoints:

- Base Mainnet: `https://mainnet.base.org` (Chain ID: 8453)
- Base Sepolia Testnet: `https://sepolia.base.org` (Chain ID: 84532)

For production environments, it's recommended to use a dedicated RPC provider like Infura, Alchemy, or QuickNode for better reliability and performance.

For more detailed information about the Base Network integration, including testing and deployment guides, see [BASE_NETWORK.md](BASE_NETWORK.md).

When deploying to any Ethereum L2 (Base, Optimism, Arbitrum, etc.), verify connectivity by calling GET /health. The response now includes blockchain.chain_id so you can confirm the node is pointed at the intended L2 network (e.g., 8453 for Base Mainnet, 84532 for Base Sepolia).

### Running the Application

Once you have set up the environment variables, you can run the application with:

```
cargo run
```

For production use, build and run the optimized version:

```
cargo build --release
./target/release/fortro-engine
```

## Post-Quantum Cryptography

Fortro-Engine implements post-quantum cryptography to ensure long-term security against quantum computing threats. The implementation includes:

### Kyber

[Kyber](https://pq-crystals.org/kyber/) is a key encapsulation mechanism (KEM) that is resistant to attacks from quantum computers. Fortro-Engine uses Kyber for:

- Secure key exchange
- Encryption of sensitive data
- Protection of communication channels

### Dilithium

[Dilithium](https://pq-crystals.org/dilithium/) is a digital signature algorithm that provides post-quantum security. Fortro-Engine uses Dilithium for:

- Digital signatures for verifiable credentials
- Authentication
- Post-quantum secure JWT tokens

### Usage

The post-quantum cryptography features are implemented in the following modules:

- `src/utils/crypto.rs`: Core implementation of Kyber and Dilithium
- `src/utils/did.rs`: Integration with DID (Decentralized Identifiers)
- `src/utils/jwt.rs`: Post-quantum JWT implementation

To test the post-quantum cryptography implementation, run:

```
cargo run --bin test_crypto_module
```

This demo will prompt you to enter a message. It then performs:
1. Kyber KEM to derive a shared secret and AES-GCM encryption of your message
2. AES-GCM decryption to verify correctness
3. Dilithium signature creation and verification of the same message

It also prints Base64-encoded outputs for:
- Kyber KEM ciphertext
- AES-GCM payload (nonce + ciphertext)

## Development Setup

For local development, you'll need:

1. MongoDB running locally or accessible via network
2. IPFS node (Kubo implementation) running locally or accessible via network
   - Kubo (formerly go-ipfs) is the reference implementation of IPFS
   - The project is configured to work with Kubo's API
3. Either:
   - Base Network connection (recommended, no local setup required)
   - Ethereum node running locally or accessible via network (for testing without Base Network)

### Option 1: Using Base Network (Recommended)

For development with Base Network, simply set your `.env` file to use the Base Sepolia Testnet:

```
ETHEREUM_RPC_URL=https://sepolia.base.org
```

This allows you to develop against the actual Layer 2 network without running a local Ethereum node.

### Option 2: Local Ethereum Node

If you prefer to use a local Ethereum node for development, you can use Docker to set up these services locally. Example docker-compose.yml:

```yaml
version: '3'
services:
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  ipfs:
    image: ipfs/kubo:latest
    ports:
      - "4001:4001"
      - "5001:5001"
      - "8080:8080"
    volumes:
      - ipfs_data:/data/ipfs

  ethereum:
    image: ethereum/client-go:latest
    ports:
      - "8545:8545"
    command: --dev --http --http.addr 0.0.0.0 --http.api eth,net,web3,personal
    volumes:
      - ethereum_data:/root/.ethereum

volumes:
  mongodb_data:
  ipfs_data:
  ethereum_data:
```

Start the services with:

```
docker-compose up -d
```

Then update your `.env` file with the appropriate connection details.