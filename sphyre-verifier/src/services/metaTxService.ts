import { ethers } from 'ethers';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

interface ForwardRequest {
  from: string;
  to: string;
  value: string;
  gas: string;
  nonce: string;
  data: string;
}

interface DomainData {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

interface PrepareMetaTxResponse {
  success: boolean;
  forwardRequest: ForwardRequest;
  domain: DomainData;
}

interface MetaTxResult {
  success: boolean;
  tx_hash?: string;
  error?: string;
}

interface BlockchainStatus {
  metaTransactionsEnabled?: boolean;
  forwarderAddress?: string;
  registryAddress?: string;
}

interface WindowWithEthereum extends Window {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };
}

class VerifierMetaTxService {
  async getNonce(verifierAddress: string): Promise<string> {
    const response = await fetch(`${API_BASE}/api/blockchain/nonce/${verifierAddress}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get nonce: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.nonce;
  }

  async prepareMetaTx(
    from: string,
    to: string,
    data: string,
    value: string = '0',
    gas: string = '200000'
  ): Promise<PrepareMetaTxResponse> {
    const response = await fetch(`${API_BASE}/api/blockchain/meta-transaction/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, data, value, gas }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to prepare meta-transaction');
    }

    return await response.json();
  }

  async signWithMetaMask(forwardRequest: ForwardRequest, domain: DomainData): Promise<string> {
    if (typeof window === 'undefined' || !(window as WindowWithEthereum).ethereum) {
      throw new Error('MetaMask not found');
    }

    const ethereum = (window as WindowWithEthereum).ethereum!;

    try {
      await ethereum.request({ method: 'eth_requestAccounts' });
      const accounts = await ethereum.request({ method: 'eth_accounts' }) as string[];
      const from = accounts[0];

      if (from.toLowerCase() !== forwardRequest.from.toLowerCase()) {
        throw new Error('MetaMask account does not match verifier address');
      }

      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          ForwardRequest: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'gas', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'data', type: 'bytes' },
          ],
        },
        domain,
        primaryType: 'ForwardRequest',
        message: forwardRequest,
      };

      const signature = await ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [from, JSON.stringify(typedData)],
      }) as string;

      return signature;
    } catch (error) {
      const err = error as Error;
      console.error('MetaMask signing error:', error);
      throw new Error(err.message || 'Failed to sign with MetaMask');
    }
  }

  async executeMetaTx(
    from: string,
    to: string,
    data: string,
    signature: string,
    value: string = '0',
    gas: string = '200000'
  ): Promise<MetaTxResult> {
    const response = await fetch(`${API_BASE}/api/blockchain/meta-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, data, value, gas, signature }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to execute meta-transaction');
    }

    return await response.json();
  }

  async sendGaslessTransaction(
    from: string,
    to: string,
    data: string,
    value: string = '0',
    gas: string = '200000'
  ): Promise<MetaTxResult> {
    try {
      console.log('Preparing meta-transaction...');
      const prepared = await this.prepareMetaTx(from, to, data, value, gas);

      if (!prepared.success) {
        throw new Error('Failed to prepare meta-transaction');
      }

      console.log('Signing with MetaMask...');
      const signature = await this.signWithMetaMask(
        prepared.forwardRequest,
        prepared.domain
      );

      console.log('Executing meta-transaction...');
      const result = await this.executeMetaTx(from, to, data, signature, value, gas);

      return result;
    } catch (error) {
      console.error('Gasless transaction error:', error);
      throw error;
    }
  }

  async logVerification(
    verifierAddress: string,
    presentationHash: string,
    holderDID: string,
    verified: boolean
  ): Promise<MetaTxResult> {
    const statusResponse = await fetch(`${API_BASE}/api/blockchain/status`);
    const status = await statusResponse.json();
    
    const registryAddress = status.registryAddress;
    if (!registryAddress) {
      throw new Error('Registry address not configured');
    }

    const iface = new ethers.Interface([
      'function logVerification(string presentationHash, string holderDID, bool verified)',
    ]);

    const data = iface.encodeFunctionData('logVerification', [
      presentationHash,
      holderDID,
      verified,
    ]);

    return await this.sendGaslessTransaction(
      verifierAddress,
      registryAddress,
      data
    );
  }

  async isMetaTxEnabled(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/api/blockchain/status`);
      const status = await response.json();
      return status.metaTransactionsEnabled === true && status.forwarderAddress;
    } catch (error) {
      console.error('Failed to check meta-tx status:', error);
      return false;
    }
  }

  async getBlockchainStatus(): Promise<BlockchainStatus> {
    const response = await fetch(`${API_BASE}/api/blockchain/status`);
    
    if (!response.ok) {
      throw new Error('Failed to get blockchain status');
    }
    
    return await response.json();
  }
}

// Export singleton instance
const verifierMetaTxService = new VerifierMetaTxService();
export default verifierMetaTxService;
