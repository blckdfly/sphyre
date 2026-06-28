'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Trash2, FileText, Link as LinkIcon, Copy, Check } from "lucide-react";
import apiService from "@/services/apiService";
import walletService from "@/services/walletService";
import PinModal from "@/components/ui/PinModal";

interface CredentialAttribute {
  name: string;
  value: string;
}

interface EvidenceAttachment {
  label: string;
  filename: string;
  ipfsHash: string;
  gatewayUrl?: string;
  contentType?: string;
  size?: number;
}

interface CredentialDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  credential: {
    id?: string;
    title: string;
    issuer: string;
    issuerDid?: string;
    attributes: CredentialAttribute[];
    issuedDate?: string;
    expiryDate?: string;
    jwt?: string;
    status?: string;
    ipfsHash?: string;
    ipfsGatewayUrl?: string;
    blockchainTxHash?: string;
    signatureType?: string;
    bbsSignature?: string;
    evidenceAttachments?: EvidenceAttachment[];
    evidenceRequired?: string[];
    evidenceStatus?: string | null;
    extensions?: string[];
  } | null;
}

const truncateMiddle = (value: string, maxLength = 36) => {
  if (!value) return "";
  if (value.length <= maxLength) return value;

  const sliceLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, sliceLength)}...${value.slice(-sliceLength)}`;
};

const CredentialDetailModal: React.FC<CredentialDetailModalProps> = ({ isOpen, onClose, credential }) => {
  const [revoking, setRevoking] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [copiedField, setCopiedField] = useState<'issuerDid' | 'credentialId' | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const performRevoke = async () => {
    if (!credential?.id) return;

    try {
      setRevoking(true);
      const userDID = walletService.getCurrentDID();

      if (!userDID) {
        alert("Error: Could not retrieve your DID");
        return;
      }

      console.log("Revoking credential:", {
        credential_id: credential.id,
        holder_did: userDID
      });

      const response = await apiService.revokeCredential(userDID, credential.id);

      console.log("Response:", response);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedResponse = response as any;

      if (typedResponse.success) {
        alert(`Credential Revoked Successfully!`);
        onClose();
      } else {
        alert("Failed to revoke credential: " + (typedResponse.message || "Unknown error"));
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to revoke credential: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setRevoking(false);
    }
  };

  const handlePinSubmit = async (pin: string) => {
    const isValid = await walletService.verifyPin(pin);
    if (!isValid) {
      throw new Error("Incorrect PIN");
    }
    setShowPinModal(false);
    await performRevoke();
  };

  const handleRevokeCredential = () => {
    if (!credential?.id) return;
    setShowPinModal(true);
  };

  const handleCopyField = (value: string | undefined, field: 'issuerDid' | 'credentialId') => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      setCopiedField(field);
      copyTimeoutRef.current = setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const formatFileSize = (size?: number) => {
    if (!size || size <= 0) return null;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const { providedEvidence, missingEvidence } = useMemo(() => {
    const attachments = credential?.evidenceAttachments || [];
    const required = credential?.evidenceRequired || [];

    const normalizedProvided = attachments.map((attachment) => ({
      ...attachment,
      gatewayUrl: attachment.gatewayUrl,
    }));

    const missing = required.filter(
      (label) => !attachments.some((att) => att.label.toLowerCase() === label.toLowerCase())
    );

    return {
      providedEvidence: normalizedProvided,
      missingEvidence: missing,
    };
  }, [credential?.evidenceAttachments, credential?.evidenceRequired]);

  if (!isOpen || !credential) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-dark-500">{credential.title}</h2>
            <p className="text-sm text-dark-300 mt-1">{credential.issuer}</p>
            {credential.issuerDid && (
              <div className="mt-2 flex items-center gap-2 text-xs text-dark-200">
                <span className="text-dark-300 whitespace-nowrap">Issuer DID:</span>
                <div className="flex-1 min-w-0">
                  <span
                    className="block w-full truncate font-mono text-dark-500 px-2 py-1 rounded-lg"
                    title={credential.issuerDid}
                  >
                    {truncateMiddle(credential.issuerDid, 42)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyField(credential.issuerDid, 'issuerDid')}
                  className="p-1.5 rounded-lg transition-colors hover:bg-light-200 flex items-center justify-center"
                >
                  {copiedField === 'issuerDid' ? (
                    <Check size={14} className="text-dark-300" />
                  ) : (
                    <Copy size={14} className="text-dark-300" />
                  )}
                </button>
              </div>
            )}
            {credential.id && (
              <div className="mt-2 flex items-center gap-2 text-xs text-dark-200">
                <span className="text-dark-300 whitespace-nowrap">Credential ID:</span>
                <div className="flex-1 min-w-0">
                  <span
                    className="block w-full truncate font-mono text-dark-500 px-2 py-1 rounded-lg"
                    title={credential.id}
                  >
                    {truncateMiddle(credential.id, 42)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyField(credential.id, 'credentialId')}
                  className="p-1.5 rounded-lg transition-colors hover:bg-light-200 flex items-center justify-center"
                >
                  {copiedField === 'credentialId' ? (
                    <Check size={14} className="text-dark-300" />
                  ) : (
                    <Copy size={14} className="text-dark-300" />
                  )}
                </button>
              </div>
            )}
            {(credential.signatureType || credential.bbsSignature) && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                {credential.signatureType === 'bbs+' || credential.bbsSignature ? 'BBS+ Privacy Signature' : `Signature Type: ${credential.signatureType}`}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900">Verified Credential</p>
              <p className="text-xs text-green-700">This credential has been verified on the blockchain</p>
            </div>
          </div>

          {(credential.ipfsHash || credential.ipfsGatewayUrl) && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0L1.75 6v12L12 24l10.25-6V6L12 0zm0 2.236L20.114 7.236 12 12.236 3.886 7.236 12 2.236zM3.75 8.75l7.5 4.5v8.5l-7.5-4.5V8.75zm16.5 0v8.5l-7.5 4.5v-8.5l7.5-4.5z" />
                </svg>
                <p className="text-sm font-medium text-blue-900">Stored on IPFS</p>
              </div>
              <div className="space-y-2">
                {credential.ipfsHash && (
                  <div className="space-y-1">
                    <p className="text-xs text-primary-600">Content Hash</p>
                    <p className="text-xs font-mono text-blue-900 break-all">{credential.ipfsHash}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(credential.ipfsHash || '')}
                      className="text-[10px] text-primary-500 hover:text-blue-800 underline"
                    >
                      Copy hash
                    </button>
                  </div>
                )}
                {credential.ipfsGatewayUrl && (
                  <a
                    href={credential.ipfsGatewayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-500 hover:text-blue-800 underline inline-block mt-1"
                  >
                    View on IPFS Gateway
                  </a>
                )}
              </div>
            </div>
          )}

          {(providedEvidence.length > 0 || missingEvidence.length > 0 || (credential.extensions && credential.extensions.length > 0)) && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-dark-500">Supporting Evidence</h3>
                {credential.evidenceStatus && (
                  <span className="text-xs px-2 py-1 rounded-full bg-light-200 text-dark-400">
                    Status: {credential.evidenceStatus}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {providedEvidence.map((attachment) => (
                  <div
                    key={`${attachment.label}-${attachment.ipfsHash}`}
                    className="flex items-center justify-between gap-4 bg-light-100 border border-light-200 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-primary-500 mt-1" />
                      <div>
                        <p className="text-sm font-semibold text-dark-500">{attachment.label}</p>
                        <p className="text-xs text-dark-300">{attachment.filename || "Unnamed file"}</p>
                        <div className="text-xs text-dark-300 mt-1 space-x-2">
                          {attachment.contentType && <span>{attachment.contentType}</span>}
                          {formatFileSize(attachment.size) && (
                            <span>{formatFileSize(attachment.size)}</span>
                          )}
                        </div>
                        {attachment.ipfsHash && (
                          <p className="text-[10px] text-dark-300 mt-1 break-all">
                            Hash: {attachment.ipfsHash}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {attachment.gatewayUrl ? (
                        <a
                          href={attachment.gatewayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100"
                        >
                          <LinkIcon className="w-4 h-4" />
                          Open
                        </a>
                      ) : attachment.ipfsHash ? (
                        <a
                          href={`https://gateway.sphyre.tech/ipfs/${attachment.ipfsHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100"
                        >
                          <LinkIcon className="w-4 h-4" />
                          IPFS
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {missingEvidence.length > 0 && (
                <div className="mt-4 p-3 border border-amber-200 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-700 font-semibold mb-2">Missing required evidence</p>
                  <ul className="list-disc list-inside space-y-1 text-xs text-amber-700">
                    {missingEvidence.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </div>
              )}

              {credential.extensions && credential.extensions.length > 0 && (
                <div className="mt-4 p-3 border border-indigo-200 bg-indigo-50 rounded-lg">
                  <p className="text-xs text-indigo-800 font-semibold mb-2">Extensions included</p>
                  <ul className="space-y-1 text-xs text-indigo-700">
                    {credential.extensions.map((ext) => (
                      <li key={ext}>• {ext}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {credential.blockchainTxHash && (
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-sm font-medium text-purple-900">Blockchain Anchored</p>
              </div>
              <div>
                <p className="text-xs text-purple-700">Transaction Hash</p>
                <p className="text-xs font-mono text-purple-900 break-all">{credential.blockchainTxHash}</p>
                <a
                  href={`https://sepolia.basescan.org/tx/${credential.blockchainTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-600 hover:text-purple-800 underline inline-block mt-1"
                >
                  View on Block Explorer
                </a>
              </div>
            </div>
          )}

          {(credential.issuedDate || credential.expiryDate) && (
            <div className="mb-6 grid grid-cols-2 gap-4">
              {credential.issuedDate && (
                <div>
                  <p className="text-xs text-dark-300 mb-1">Issued Date</p>
                  <p className="text-sm font-medium text-dark-500">{credential.issuedDate}</p>
                </div>
              )}
              {credential.expiryDate && (
                <div>
                  <p className="text-xs text-dark-300 mb-1">Expiry Date</p>
                  <p className="text-sm font-medium text-dark-500">{credential.expiryDate}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-dark-500 mb-3">Credential Attributes</h3>
            <div className="space-y-3">
              {credential.attributes.map((attr, index) => (
                <div
                  key={index}
                  className="p-3 bg-light-100 rounded-lg border border-gray-100"
                >
                  <p className="text-xs text-dark-300 mb-1">{attr.name}</p>
                  <p className="text-sm font-medium text-dark-500">{attr.value}</p>
                </div>
              ))}
            </div>

            {credential.extensions && credential.extensions.length === 0 && (
              <p className="mt-3 text-xs text-dark-300">
                No optional extensions were included with this credential.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 space-y-3">
          <button
            onClick={handleRevokeCredential}
            disabled={revoking}
            className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 rounded-xl py-3 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={18} />
            {revoking ? 'Revoking Credential...' : 'Revoke Credential'}
          </button>
          <button
            onClick={onClose}
            className="w-full bg-light-200 text-dark-500 py-3 rounded-full font-medium hover:bg-light-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
      <PinModal
        isOpen={showPinModal}
        title="Authorize Revocation"
        description={"Are you sure you want to revoke this credential? This action cannot be undone and will be recorded on the blockchain. Enter your wallet PIN to continue."}
        confirmText={revoking ? 'Processing...' : 'Authorize'}
        onSubmit={handlePinSubmit}
        onCancel={() => setShowPinModal(false)}
      />
    </div>
  );
};

export default CredentialDetailModal;
