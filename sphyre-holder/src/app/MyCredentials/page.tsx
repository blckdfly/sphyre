'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search } from 'lucide-react';
import apiService from '@/services/apiService';
import CredentialDetailModal from '@/components/ui/CredentialDetailModal';
import walletService from '@/services/walletService';

interface CredentialDetail {
    id?: string;
    title: string;
    issuer: string;
    issuerDid?: string;
    issuedDate: string;
    expiryDate?: string;
    status?: string;
    credentialType?: string;
    attributes: {
        name: string;
        value: string;
    }[];
    ipfsHash?: string;
    ipfsGatewayUrl?: string;
    blockchainTxHash?: string;
    signatureType?: string;
    bbsSignature?: string;
    evidenceAttachments?: EvidenceAttachment[];
    evidenceRequired?: string[];
    evidenceStatus?: string | null;
}

interface EvidenceAttachment {
    label: string;
    filename: string;
    ipfsHash: string;
    gatewayUrl?: string;
    contentType?: string;
    size?: number;
}

interface RawEvidenceAttachment {
    label: string;
    filename: string;
    ipfs_hash: string;
    gateway_url?: string;
    content_type?: string;
    size?: number;
}

export default function MyCredentials() {
    const router = useRouter();
    const [credentials, setCredentials] = useState<CredentialDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCredential, setSelectedCredential] = useState<CredentialDetail | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    const normalizeStatus = (status?: string): string => {
        if (!status) {
            return 'unknown';
        }

        const normalized = status.toString().trim().toLowerCase();

        if (!normalized) {
            return 'unknown';
        }

        if (normalized.includes('revok')) {
            return 'revoked';
        }

        if (normalized.includes('expir')) {
            return 'expired';
        }

        if (
            normalized.includes('active') ||
            normalized.includes('valid') ||
            normalized.includes('issued') ||
            normalized.includes('verify') ||
            normalized.includes('approved')
        ) {
            return 'active';
        }

        return normalized;
    };

    const formatStatusLabel = (status?: string): string => {
        if (!status) {
            return 'Unknown';
        }

        return status
            .toString()
            .trim()
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Unknown';
    };

    const fetchCredentials = useCallback(async () => {
        try {
            setLoading(true);
            const userDID = walletService.getCurrentDID();
            
            console.log('Fetching credentials for DID:', userDID);
            
            if (userDID) {
                const response = await apiService.getCredentials(userDID);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const typedResponse = response as any;
                const backendData = typedResponse.data?.data || typedResponse.data;
                const isArray = Array.isArray(backendData);
                
                console.log('Response received:', {
                    success: response.success,
                    count: typedResponse.data?.count || backendData?.length || 0,
                    has_data: !!backendData,
                    is_array: isArray,
                    query_did: typedResponse.data?.query_did,
                    backend_data_length: isArray ? backendData.length : 0
                });
                
                if (response.success && backendData && Array.isArray(backendData)) {
                    console.log(`Processing ${backendData.length} credentials from backend`);
                    
                    interface CredentialData {
                        id: string;
                        credential_type?: string;
                        issuer_name?: string;
                        issuer_did?: string;
                        issuance_date: string;
                        expiration_date?: string;
                        status?: string;
                        credential_data?: Record<string, unknown>;
                    }
                    
                    // Helper to format issuer display
                    const formatIssuerDisplay = (issuer_name?: string, issuer_did?: string): string => {
                        if (issuer_name && issuer_name !== 'Unknown Issuer') {
                            return issuer_name;
                        }
                        if (issuer_did) {
                        
                            const parts = issuer_did.split(':');
                            if (parts.length >= 3) {
                                return `Issuer: ${parts.slice(-2).join(':')}`;
                            }
                            return issuer_did;
                        }
                        return 'Unknown Issuer';
                    };
                    
                    const formattedCredentials = (backendData as CredentialData[]).map((cred: CredentialData) => {
                        const issuerRaw = cred.issuer_name || (cred as { issuer?: string }).issuer;

                        return {
                        id: cred.id,
                        title: cred.credential_type || 'Unknown Credential',
                        issuer: formatIssuerDisplay(issuerRaw, cred.issuer_did),
                        issuerDid: cred.issuer_did,
                        issuedDate: new Date(cred.issuance_date).toLocaleDateString(),
                        expiryDate: cred.expiration_date ? new Date(cred.expiration_date).toLocaleDateString() : undefined,
                        status: cred.status ?? 'unknown',
                        credentialType: cred.credential_type || (cred as { type?: string }).type,
                        attributes: Object.entries(cred.credential_data || {}).map(([key, value]) => ({
                            name: key,
                            value: value?.toString() || '',
                        })),
                        ipfsHash: (cred as { ipfs_hash?: string }).ipfs_hash || undefined,
                        ipfsGatewayUrl: (cred as { ipfs_gateway_url?: string }).ipfs_gateway_url || undefined,
                        blockchainTxHash: (cred as { blockchain_tx_hash?: string }).blockchain_tx_hash || undefined,
                        signatureType: (cred as { signature_type?: string }).signature_type || undefined,
                        bbsSignature: (cred as { bbs_signature?: string }).bbs_signature || undefined,
                        evidenceAttachments: ((cred as { evidence_attachments?: RawEvidenceAttachment[] }).evidence_attachments || []).map((att) => ({
                            label: att.label,
                            filename: att.filename,
                            ipfsHash: att.ipfs_hash,
                            gatewayUrl: att.gateway_url,
                            contentType: att.content_type,
                            size: att.size,
                        })),
                        evidenceRequired: (cred as { evidence_required?: string[] }).evidence_required || [],
                        evidenceStatus: (cred as { evidence_status?: string | null }).evidence_status ?? null,
                        extensions: (cred as { extensions?: string[] }).extensions || [],
                        };
                    });
                    
                    console.log('Formatted credentials:', formattedCredentials.map(c => ({
                        id: c.id,
                        title: c.title,
                        issuer: c.issuer
                    })));
                    setCredentials(formattedCredentials);
                } else {
                    setCredentials([]);
                }
            } else {
                setCredentials([]);
            }
        } catch (error) {
            console.error('Error fetching credentials:', error);
            console.error('Error details:', error instanceof Error ? error.message : error);
            setCredentials([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCredentials();
    }, [fetchCredentials]);

    const handleBack = () => {
        router.push('/SSIWalletIdentity');
    };

    const filteredCredentials = credentials.filter(cred => {
        const matchesSearch = cred.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             cred.issuer.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
    });

    return (
        <>
            <div className="min-h-screen bg-light-50">
                {/* Header */}
                <div className="bg-light-50 shadow-sm">
                    <div className="px-4 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={handleBack}
                                    className="p-2 hover:bg-light-200 rounded-lg transition-colors"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <h1 className="text-xl font-semibold">My Credentials</h1>
                            </div>
                            <span className="text-sm text-dark-300">{credentials.length} total</span>
                        </div>
                    </div>
                </div>

                {/* Search and Filter Bar */}
                <div className="bg-white px-4 py-3">
                    <div className="flex space-x-2">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-200" size={20} />
                            <input
                                type="text"
                                placeholder="Search credentials..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-dark-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Credentials List */}
                <div className="px-4 py-4">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
                        </div>
                    ) : filteredCredentials.length > 0 ? (
                        <div className="space-y-3">
                            {filteredCredentials.map((credential) => {
                                const normalizedStatus = normalizeStatus(credential.status);
                                const statusLabel = formatStatusLabel(credential.status);

                                const statusClassMap: Record<string, string> = {
                                    active: 'bg-green-50 text-green-700 border-green-100',
                                    revoked: 'bg-red-50 text-red-700 border-red-100',
                                    expired: 'bg-orange-50 text-orange-700 border-orange-100',
                                };

                                const statusBadgeClass =
                                    statusClassMap[normalizedStatus] || 'bg-gray-50 text-gray-700 border-gray-100';

                                return (
                                    <div
                                        key={credential.id}
                                        onClick={() => {
                                            setSelectedCredential(credential);
                                            setShowDetailModal(true);
                                        }}
                                        className="rounded-2xl border border-dark-200 bg-white px-4 py-4 shadow-sm cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                                    >
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
                                            <div className="flex-1 space-y-1.5">
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-dark-300">
                                                    <span>Credential</span>
                                                    {credential.credentialType &&
                                                        credential.credentialType.trim().toLowerCase() !==
                                                            (credential.title || '').trim().toLowerCase() && (
                                                            <span className="px-2 py-0.5 rounded-full border border-dark-200 text-dark-500 bg-light-100 normal-case tracking-normal text-[10px]">
                                                                {credential.credentialType}
                                                            </span>
                                                        )}
                                                </div>
                                                <h3 className="text-base font-semibold text-dark-600">{credential.title}</h3>
                                                <p className="text-sm text-dark-300">{credential.issuer}</p>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                                    {credential.id && (
                                                        <span className="inline-flex items-center gap-2">
                                                            ID {credential.id}
                                                        </span>
                                                    )}
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full border ${statusBadgeClass}`}>
                                                            {statusLabel}
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12">
                            <p className="text-dark-300 font-medium">No credentials found</p>
                            {searchQuery && (
                                <p className="text-sm text-dark-200 mt-2">Try adjusting your search</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Credential Detail Modal */}
            {showDetailModal && selectedCredential && (
                <CredentialDetailModal
                    isOpen={showDetailModal}
                    credential={selectedCredential}
                    onClose={() => {
                        setShowDetailModal(false);
                        setSelectedCredential(null);
                    }}
                />
            )}
        </>
    );
}
