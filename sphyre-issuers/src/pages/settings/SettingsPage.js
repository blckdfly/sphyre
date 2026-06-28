import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { issuerApi } from '../../services/api';
import { ClipboardCopyIcon, CheckIcon } from '@heroicons/react/outline';

const SettingsPage = () => {
  const [issuerData, setIssuerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedDID, setCopiedDID] = useState(false);
  const [copiedCid, setCopiedCid] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);
  const [issuerDID, setIssuerDID] = useState('');

  useEffect(() => {
    loadIssuerData();
    const did = localStorage.getItem('issuerDID') || '';
    setIssuerDID(did);
  }, []);

  const loadIssuerData = async () => {
    try {
      setLoading(true);
      const issuerDid = localStorage.getItem('issuerDID');
      const storedInfoRaw = localStorage.getItem('issuerInfo');
      let storedInfo = null;

      if (storedInfoRaw) {
        try {
          storedInfo = JSON.parse(storedInfoRaw);
        } catch (parseError) {
          console.warn('Failed to parse issuerInfo from storage:', parseError);
        }
      }

      if (!issuerDid) {
        console.warn('No issuer DID found');
        if (storedInfo) {
          setIssuerData(storedInfo);
        }
        return;
      }

      const response = await issuerApi.getIssuerInfo(issuerDid);
      if (response.success && response.data) {
        const fetchedIssuer = response.data.issuer || response.data;
        const mergedIssuer = storedInfo
          ? {
            ...storedInfo,
            ...fetchedIssuer,
            domain: fetchedIssuer?.domain || storedInfo?.domain,
            domain_verified: fetchedIssuer?.domain_verified ?? storedInfo?.domain_verified,
            name: fetchedIssuer?.name || fetchedIssuer?.organization || storedInfo?.name,
            organization: fetchedIssuer?.organization || storedInfo?.organization,
          }
          : fetchedIssuer;

        setIssuerData(mergedIssuer);
      } else if (storedInfo) {
        setIssuerData(storedInfo);
      }
    } catch (error) {
      console.error('Failed to load issuer data:', error);
      const storedInfoRaw = localStorage.getItem('issuerInfo');
      if (storedInfoRaw) {
        try {
          setIssuerData(JSON.parse(storedInfoRaw));
        } catch (parseError) {
          console.warn('Failed to parse issuerInfo after error:', parseError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDID = () => {
    if (!issuerDID) return;
    navigator.clipboard.writeText(issuerDID);
    setCopiedDID(true);
    setTimeout(() => setCopiedDID(false), 2000);
  };

  const handleCopyCid = () => {
    if (!issuerData?.did_doc_cid) return;
    navigator.clipboard.writeText(issuerData.did_doc_cid);
    setCopiedCid(true);
    setTimeout(() => setCopiedCid(false), 2000);
  };

  const normalizeTxHash = (hash) => {
    if (!hash) return '';
    return hash.startsWith('0x') ? hash : `0x${hash}`;
  };

  const handleCopyTx = () => {
    if (!issuerData?.blockchain_tx_hash) return;
    navigator.clipboard.writeText(normalizeTxHash(issuerData.blockchain_tx_hash));
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  const ipfsGatewayUrl = issuerData?.did_doc_gateway_url || (issuerData?.did_doc_cid ? `https://gateway.sphyre.tech/ipfs/${issuerData.did_doc_cid}` : null);
  const explorerUrl = issuerData?.blockchain_tx_hash ? `https://sepolia.basescan.org/tx/${normalizeTxHash(issuerData.blockchain_tx_hash)}` : null;

  if (loading) {
    return (
      <Layout title="Settings">
        <div className="flex items-center justify-center h-64">
          <p className="text-dark-300">Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Settings">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-light-100">Issuer Identity</h1>
          <p className="mt-2 text-dark-300 text-sm max-w-2xl">
            Review the verified organization details associated with this issuer account. These values are sourced from domain verification and recent activity.
          </p>
        </div>

        <div className="space-y-8">
          <section className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="block text-xs font-semibold tracking-wide text-dark-300 uppercase">Decentralized Identifier (DID)</span>
                <p className="mt-2 text-sm font-mono text-light-200 break-all">
                  {issuerDID || 'No DID found'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyDID}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
              >
                {copiedDID ? <CheckIcon className="h-4 w-4" /> : <ClipboardCopyIcon className="h-4 w-4" />}
                {copiedDID ? 'Copied' : 'Copy DID'}
              </button>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-dark-100 to-transparent" />
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="block text-xs font-semibold tracking-wide text-dark-300 uppercase">Organization Name</span>
              <div className="px-4 py-3 bg-dark-900 text-light-100 rounded-xl border border-dark-700/60 shadow-sm">
                {issuerData?.name || issuerData?.organization || 'Not set'}
              </div>
            </div>
            <div className="space-y-2">
              <span className="block text-xs font-semibold tracking-wide text-dark-300 uppercase">Verified Domain</span>
              <div className="px-4 py-3 bg-dark-900 text-light-100 rounded-xl border border-dark-700/60 shadow-sm flex items-center gap-3">
                <span>{issuerData?.domain || 'Not verified'}</span>
                {issuerData?.domain_verified && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-500/15 text-success-400">
                    Verified
                  </span>
                )}
              </div>
            </div>
          </section>

          {issuerData?.created_at && (
            <section className="space-y-2">
              <span className="block text-xs font-semibold tracking-wide text-dark-300 uppercase">Created</span>
              <div className="px-4 py-3 bg-dark-900 text-light-100 rounded-xl border border-dark-700/60 shadow-sm">
                {new Date(issuerData.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </section>
          )}

          {issuerData?.did_doc_cid && (
            <section className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold tracking-wide text-dark-300 uppercase flex items-center gap-2">
                  DID Document (IPFS)
                </span>
                <div className="flex items-center gap-2">
                  {ipfsGatewayUrl && (
                    <a
                      href={ipfsGatewayUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-dark-800 text-light-100 border border-dark-600 hover:bg-dark-700"
                    >
                      View
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyCid}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-dark-800 text-light-100 border border-dark-600 hover:bg-dark-700"
                  >
                    {copiedCid ? <CheckIcon className="h-4 w-4" /> : <ClipboardCopyIcon className="h-4 w-4" />}
                    {copiedCid ? 'Copied' : 'Copy CID'}
                  </button>
                </div>
              </div>
              <div className="px-4 py-3 bg-dark-900 text-light-100 rounded-xl border border-dark-700/60 shadow-sm">
                <p className="text-xs font-mono break-all">{issuerData.did_doc_cid}</p>
              </div>
            </section>
          )}

          {issuerData?.blockchain_registered !== undefined && (
            <section className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold tracking-wide text-dark-300 uppercase flex items-center gap-2">
                  Blockchain Registration
                </span>
                {issuerData.blockchain_registered ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-500/15 text-white">
                    Registered
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning-500/15 text-warning-400">
                    Pending
                  </span>
                )}
              </div>
              {issuerData.blockchain_tx_hash ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[200px] px-4 py-3 bg-dark-900 text-light-100 rounded-xl border border-dark-700/60 shadow-sm">
                    <p className="text-xs font-mono break-all">{issuerData.blockchain_tx_hash}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {explorerUrl && (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-dark-800 text-light-100 border border-dark-600 hover:bg-dark-700"
                      >
                        View TX
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleCopyTx}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-dark-800 text-light-100 border border-dark-600 hover:bg-dark-700"
                    >
                      {copiedTx ? <CheckIcon className="h-4 w-4" /> : <ClipboardCopyIcon className="h-4 w-4" />}
                      {copiedTx ? 'Copied' : 'Copy TX'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-dark-300">
                  No blockchain transaction recorded yet.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default SettingsPage;