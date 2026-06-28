# Sphyre

Sphyre is a proof-of-concept Self-Sovereign Identity (SSI) platform for privacy-preserving digital credential issuance, storage, presentation, and verification. The system integrates post-quantum cryptography, selective disclosure, zero-knowledge proofs, adaptive consent, off-chain encrypted credential storage, and on-chain trust anchoring.

This repository is the public monorepo for the implementation artifacts supporting the Sphyre research prototype.

## Overview

Sphyre follows the SSI trust-triangle model:

- **Issuers** define credential schemas, process credential requests, and issue verifiable credentials.
- **Holders** receive credentials, manage consent, and present selected claims to verifiers.
- **Verifiers** create presentation requests and validate submitted proofs.
- **Fortro Engine** coordinates backend services, credential workflows, cryptographic operations, IPFS integration, and blockchain anchoring.
- **Fortro Contract** provides smart contracts for registry, consent, schema, credential, and meta-transaction support.

The prototype is designed around a three-layer architecture:

1. **Application layer**: issuer dashboard, holder wallet, and verifier portal.
2. **Middleware layer**: Rust backend services, credential logic, cryptographic proof handling, and API orchestration.
3. **Trust anchor layer**: EVM smart contracts on Base Sepolia, with credential payloads stored off-chain.

## Research Features

Sphyre implements and evaluates the following mechanisms:

- **Post-quantum identity and payload protection**
  - Dilithium-based DID signing flow.
  - Kyber-768 KEM for protecting encrypted credential payloads.
  - AES-GCM for symmetric payload encryption.

- **Selective disclosure and zero-knowledge proofs**
  - BBS+ signatures for selective attribute disclosure.
  - Bulletproofs for numerical predicate proofs.
  - Holder-side presentation minimization.

- **Adaptive consent**
  - Consent grant, revoke, and validation flows.
  - Consent-aware presentation and verifier workflows.
  - Metadata minimization for auditable access.

- **Blockchain anchoring**
  - Credential, schema, and consent registry contracts.
  - EIP-2771 meta-transaction support.
  - Base Sepolia deployment scripts.

- **Off-chain storage**
  - IPFS-backed credential payload storage.
  - Encrypted payload retrieval through backend services.

## Repository Structure

```text
.
|-- fortro-engine/          # Rust Axum backend and cryptographic service layer
|-- fortro-contract/    # Solidity/Hardhat smart contracts
|-- sphyre-issuers/         # Issuer dashboard frontend
|-- sphyre-holder/             # Holder wallet frontend
`-- sphyre-verifier/        # Verifier portal frontend
```

Component mapping:

| Component | Folder |
| --- | --- |
| Backend | `fortro-engine/` |
| Smart contracts | `fortro-contract/` |
| Issuer | `sphyre-issuers/` |
| Holder | `sphyre-holder/` |
| Verifier | `sphyre-verifier/` |

## Technology Stack

| Layer | Technologies |
| --- | --- |
| Backend | Rust, Axum, Tokio, MongoDB, IPFS, Ethers/Web3 |
| Cryptography | Dilithium, Kyber-768, BBS+, Bulletproofs, AES-GCM |
| Smart contracts | Solidity, Hardhat, OpenZeppelin, EIP-2771 |
| Frontend | React, Next.js, Tailwind CSS |
| Storage | MongoDB metadata, IPFS encrypted payloads |
| Chain | Base Sepolia testnet |

## Documentation

Full technical documentation is available at [docs.sphyre.tech](https://docs.sphyre.tech).

## Quick Start

The project is split into independently runnable services. Install dependencies in each component before running it.

### 1. Fortro Engine

```bash
cd fortro-engine
cargo test
cargo run
```

Required environment variables include:

```env
MONGODB_URI=
IPFS_API_URL=
ETHEREUM_RPC_URL=
JWT_SECRET=
JWT_EXPIRATION=86400
WALLET_PRIVATE_KEY=
MASTER_ENCRYPTION_KEY=
BLOCKCHAIN_DEPLOYER_PRIVATE_KEY=
```

Optional environment variables include contract addresses, relayer settings, CORS origins, and encryption keys for metadata fields.

### 2. Fortro Contract

```bash
cd fortro-contract/hardhat
npm install
npm run compile
npm test
```

### 3. Issuer Dashboard

```bash
cd sphyre-issuers
npm install
npm start
```

For production builds:

```bash
npm run build
```

### 4. Holder Wallet

```bash
cd sphyre-holder
npm install
npm run dev
```

For production builds:

```bash
npm run build
npm start
```

### 5. Verifier Portal

```bash
cd sphyre-verifier
npm install
npm run dev
```

For production builds:

```bash
npm run build
npm start
```

## Security and Secret Management

This repository is intended for public research dissemination. The following rules are enforced for publication readiness:

- Runtime secrets must be supplied through environment variables.
- `.env` files, private keys, generated artifacts, and dependency directories must not be committed.
- Example files may contain placeholders only.
- Blockchain addresses and contract bytecode are not secrets.

Sensitive values include, but are not limited to:

- JWT signing secrets.
- Wallet and deployer private keys.
- Relayer private keys.
- API keys.
- Master encryption keys.
- Database credentials.

## Academic Context

This repository supports the implementation artifacts for:

> A Post-Quantum Self-Sovereign Identity System with Adaptive Consent and Zero-Knowledge Proofs

The system is a research prototype. It is suitable for academic evaluation, reproducibility review, and architecture-level experimentation. Production deployment requires additional hardening, formal security review, governance design, key recovery mechanisms, scalability testing, and interoperability testing with external W3C-compliant SSI wallets.

## Citation

If this repository supports your research, please cite the associated paper once published. Until formal proceedings metadata is available, cite the project as:

```bibtex
@misc{sphyre2026,
  title        = {Sphyre: A Post-Quantum Self-Sovereign Identity System with Adaptive Consent and Zero-Knowledge Proofs},
  author       = {Ziyaadaturrahman, Naufal and Prasetyo, Anang},
  year         = {2026},
  howpublished = {\url{https://github.com/blckdfly/sphyre}}
}
```