import React, { useState, useEffect } from 'react';
import issuerAuthService from '../../services/issuerAuthService';
import Layout from '../../components/layout/Layout';
import { CheckCircleIcon, XCircleIcon, ClockIcon, DocumentTextIcon } from '@heroicons/react/outline';
import { LinkIcon } from '@heroicons/react/solid';
import { issuerApi } from '../../services/api';
import { createProof, decryptData } from '../../utils/crypto';
import PinModal from '../../components/modals/PinModal';
import { DynamicField } from '../../components/DynamicField';
import { EvidenceAttachment } from '../../services/api';

const VerificationPage = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const issuerDid = localStorage.getItem('issuerDID') || '';
  const token = localStorage.getItem('token') || '';

  const formatEvidenceSize = (size) => {
    if (!size && size !== 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [templateData, setTemplateData] = useState(null);
  const [issuerData, setIssuerData] = useState({});
  const [issuerDataErrors, setIssuerDataErrors] = useState({});
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinAction, setPinAction] = useState(null);

  const verificationStats = [
    {
      label: 'Approved Verifications',
      value: requests.filter((r) => r.status === 'approved').length,
      icon: CheckCircleIcon,
      iconClass: 'bg-success-500/30 text-white',
    },
    {
      label: 'Rejected Verifications',
      value: requests.filter((r) => r.status === 'rejected').length,
      icon: XCircleIcon,
      iconClass: 'bg-error-500/30 text-white',
    },
    {
      label: 'Pending Verifications',
      value: requests.filter((r) => r.status === 'pending').length,
      icon: ClockIcon,
      iconClass: 'bg-warning-500/30 text-white',
    },
  ];

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError('');
      if (!issuerDid || !token) {
        setRequests([]);
        return;
      }
      const res = await issuerApi.getCredentialRequests(token, issuerDid);
      if (res && res.requests) {
        const mapped = res.requests.map((req) => ({
          id: req.id,
          user: req.user_did,
          credential: req.credential_type || 'Unknown',
          status: (req.status || '').toLowerCase(),
          requestedAt: req.created_at,
        }));
        setRequests(mapped);
      } else {
        setRequests([]);
      }
    } catch (e) {
      setError('Failed to load verification requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    if (templateData && templateData.fields) {
      const issuerFields = templateData.fields.filter(f => f.source === 'issuer_input');
      console.log('Checking issuer fields:', {
        total_fields: templateData.fields.length,
        issuer_fields: issuerFields.map(f => ({ name: f.name, required: f.required })),
        issuer_data: Object.keys(issuerData)
      });
      
      const errors = {};

      issuerFields.forEach(field => {
        if (!issuerData[field.name] || String(issuerData[field.name]).trim() === '') {
          console.warn(`Missing issuer field: ${field.name}`);
          errors[field.name] = `${field.name} is required`;
        }
      });
      
      console.log('All issuer fields validated and filled');
    } else {
      console.log('No template or fields to validate');
    }
    
    setIssuerDataErrors({});
    setPinAction({ type: 'approve', requestId, issuerData, evidence: detailData?.evidence || [] });
    setShowPinModal(true);
  };

  const handlePinSubmit = async (pin) => {
    if (!pinAction) return;

    try {
      setLoading(true);
      
      const authData = issuerAuthService.getAuthData();
      if (!authData || !authData.encryptedSeed) {
        throw new Error('Seed phrase not found. Please re-login.');
      }
      const encryptedSeed = authData.encryptedSeed;
      
      let seedPhrase;
      try {
        seedPhrase = decryptData(encryptedSeed, pin);
      } catch (e) {
        throw new Error('Invalid PIN. Please try again.');
      }
      
      if (pinAction.type === 'approve') {
        const challengeRes = await issuerApi.getRequestChallenge(token, issuerDid, pinAction.requestId);
        const nonce = challengeRes.nonce;
        
        const proof = createProof(nonce, seedPhrase, issuerDid);
        
        await issuerApi.approveCredentialRequest(token, issuerDid, pinAction.requestId, { 
          proof,
          issuer_data: pinAction.issuerData || {},
          evidence: pinAction.evidence || []
        });

        setDetailData(null);
        setTemplateData(null);
        setShowDetail(false);
      } else if (pinAction.type === 'reject') {
        const challengeRes = await issuerApi.getRequestChallenge(token, issuerDid, pinAction.requestId);
        const nonce = challengeRes.nonce;
        
        const proof = createProof(nonce, seedPhrase, issuerDid);
        
        await issuerApi.rejectCredentialRequest(token, issuerDid, pinAction.requestId, { 
          proof,
          reason: pinAction.reason 
        });
      }
      
      await loadRequests();
      setError('');
      setShowPinModal(false);
      setPinAction(null);
    } catch (e) {
      setShowPinModal(false);
      setPinAction(null);
      setError(e.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (requestId) => {
    const reason = window.prompt('Reason for rejection?') || '';
    if (reason === null) return;
    
    setPinAction({ type: 'reject', requestId, reason });
    setShowPinModal(true);
  };

  const handleRejectOld = async (requestId) => {
    const reason = window.prompt('Reason for rejection?') || '';
    
    try {
      setLoading(true);
      
      const authData = issuerAuthService.getAuthData();
      if (!authData || !authData.encryptedSeed) {
        setError('Seed phrase not found. Please re-login.');
        return;
      }
      const encryptedSeed = authData.encryptedSeed;
      
      const pin = window.prompt('Enter your PIN to reject this request:');
      if (!pin) {
        setLoading(false);
        return;
      }
      
      let seedPhrase;
      try {
        seedPhrase = decryptData(encryptedSeed, pin);
      } catch (e) {
        setError('Invalid PIN. Please try again.');
        setLoading(false);
        return;
      }
      
      const challengeRes = await issuerApi.getRequestChallenge(token, issuerDid, requestId);
      const nonce = challengeRes.nonce;
      
      const proof = createProof(nonce, seedPhrase, issuerDid);
      
      await issuerApi.rejectCredentialRequest(token, issuerDid, requestId, { proof, reason });
      
      await loadRequests();
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to reject request');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (requestId) => {
    try {
      const res = await issuerApi.getCredentialRequest(token, issuerDid, requestId);
      const request = res.request || res.data || res;
      console.log('Request loaded:', {
        id: request.id,
        template_id: request.template_id,
        status: request.status,
        request_data: request.request_data
      });
      setDetailData(request);
      
      // Reset issuer data
      setIssuerData({});
      setIssuerDataErrors({});
      
      // Fetch template to get field definitions
      if (request.template_id) {
        try {
          const templateRes = await issuerApi.getTemplate(token, issuerDid, request.template_id);
          const template = templateRes.template || templateRes.data || templateRes;
          
          console.log('Template loaded:', {
            id: template.id,
            name: template.name,
            fields_count: template.fields?.length || 0,
            issuer_input_fields: template.fields?.filter(f => f.source === 'issuer_input').map(f => f.name) || [],
            holder_input_fields: template.fields?.filter(f => f.source === 'holder_input').map(f => f.name) || []
          });
          
          setTemplateData(template);
        } catch (err) {
          console.warn('Failed to load template:', err);
          console.warn('Template ID:', request.template_id);
          setTemplateData(null);
        }
      } else {
        console.warn('No template_id in request');
        setTemplateData(null);
      }
      
      setShowDetail(true);
    } catch (e) {
      console.error('Failed to load request details:', e);
      setError(e.message || 'Failed to load request details');
    }
  };

  useEffect(() => {
    loadRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuerDid, token]);

  return (
    <Layout title="Verification Requests">
      <div className="space-y-6">
        {/* Header helper text */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <p className="text-sm text-light-400 max-w-2xl">
            Review incoming credential requests, fill in issuer fields, and use a PIN to securely approve or deny verification.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold border border-dark-500 bg-dark-800 text-light-100 hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-dark-900"
            >
              Verification Policies
            </button>
          </div>

        {/* Details Modal with Dynamic Fields */}
        {showDetail && detailData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 p-4">
            <div className="bg-light-50 border border-dark-100 rounded-2xl shadow-2xl shadow-black/20 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-light-50 border-b border-dark-100 p-6 z-10">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-dark-500">Request Details</h3>
                  <button onClick={() => setShowDetail(false)} className="text-dark-300 hover:text-dark-500 text-2xl">×</button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-light-50 border border-light-200 rounded-lg">
                  <div>
                    <div className="text-xs text-dark-300 mb-1">User DID</div>
                    <div className="text-sm font-mono text-dark-500 break-all">{detailData.user_did}</div>
                  </div>
                  <div>
                    <div className="text-xs text-dark-300 mb-1">Credential Type</div>
                    <div className="text-sm text-dark-500">{detailData.credential_type}</div>
                  </div>
                  <div>
                    <div className="text-xs text-dark-300 mb-1">Status</div>
                    <div className="text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        String(detailData.status).toLowerCase() === 'pending' ? 'bg-warning-500/15 text-warning-500' :
                        String(detailData.status).toLowerCase() === 'approved' ? 'bg-success-500/15 text-success-400' :
                        'bg-error-500/15 text-error-300'
                      }`}>
                        {String(detailData.status)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-dark-300 mb-1">Request ID</div>
                    <div className="text-sm font-mono text-dark-500">{detailData.id?.slice(0, 8)}...</div>
                  </div>
                </div>

                {templateData && templateData.fields ? (
                  <>
                    {/* Holder Data (Read-only) */}
                    {templateData.fields.filter(f => !f.source || f.source === 'holder_input').length > 0 && (
                      <div>
                        <h4 className="text-md font-semibold text-dark-500 mb-3 flex items-center">
                          <span className="bg-primary-500/15 text-primary-500 text-xs px-2 py-1 rounded mr-2">Holder Data</span>
                          Data submitted by holder
                        </h4>
                        <div className="space-y-3 p-4 bg-light-50 border border-light-200 rounded-lg">
                          {templateData.fields
                            .filter(f => !f.source || f.source === 'holder_input')
                            .map(field => (
                              <DynamicField
                                key={field.name}
                                field={field}
                                value={detailData.request_data?.[field.name]}
                                onChange={() => {}}
                                disabled={true}
                              />
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Issuer Fields (Editable) */}
                    {templateData.fields.filter(f => f.source === 'issuer_input').length > 0 && (
                      <div>
                        <h4 className="text-md font-semibold text-dark-500 mb-3 flex items-center">
                          <span className="bg-success-500/15 text-success-500 text-xs px-2 py-1 rounded mr-2">Issuer Fields</span>
                          Fields you need to fill before approval
                        </h4>
                        <div className="space-y-3 p-4 bg-light-50 border border-light-200 rounded-lg">
                          {templateData.fields
                            .filter(f => f.source === 'issuer_input')
                            .map(field => (
                              <DynamicField
                                key={field.name}
                                field={field}
                                value={issuerData[field.name]}
                                onChange={(value) => setIssuerData(prev => ({ ...prev, [field.name]: value }))}
                                disabled={String(detailData.status).toLowerCase() !== 'pending'}
                                error={issuerDataErrors[field.name]}
                              />
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  detailData.request_data && (
                    <div>
                      <h4 className="text-md font-semibold text-dark-500 mb-3">Request Data</h4>
                      <div className="bg-light-100 border border-light-200 rounded p-4">
                        {Object.entries(detailData.request_data).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm py-2 border-b border-light-300 last:border-0">
                            <span className="text-dark-300 font-medium">{k}</span>
                            <span className="text-dark-500">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}

                {(detailData?.evidence?.length || 0) > 0 && (
                  <div>
                    <h4 className="text-md font-semibold text-dark-500 mb-3 flex items-center gap-2">
                      <span className="bg-info-500/15 text-info-500 text-xs px-2 py-1 rounded">Supporting Evidence</span>
                      Documents provided by holder
                    </h4>
                    <div className="space-y-3 p-4 bg-light-100 border border-light-200 rounded-lg">
                      {detailData.evidence.map((attachment, idx) => (
                        <div
                          key={`${attachment.label || 'evidence'}-${attachment.ipfs_hash || idx}`}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-light-200 rounded-lg px-4 py-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-1 text-info-500">
                              <DocumentTextIcon className="w-5 h-5" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-dark-500">
                                {attachment.label || attachment.filename || 'Evidence file'}
                              </p>
                              <p className="text-xs text-dark-300 break-all">
                                {attachment.filename || 'Unnamed file'}
                                {attachment.size ? (
                                  <span className="ml-2 text-dark-300/80">
                                    {formatEvidenceSize(attachment.size)}
                                  </span>
                                ) : null}
                              </p>
                              {attachment.content_type && (
                                <p className="text-[11px] text-dark-300/80">
                                  {attachment.content_type}
                                </p>
                              )}
                              {attachment.ipfs_hash && (
                                <p className="text-[11px] text-info-500/80 break-all">
                                  Hash: {attachment.ipfs_hash}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {attachment.gateway_url ? (
                              <a
                                href={attachment.gateway_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border border-info-400 text-info-200 hover:bg-info-500/10 transition"
                              >
                                <LinkIcon className="w-3.5 h-3.5" />
                                Open
                              </a>
                            ) : attachment.ipfs_hash ? (
                              <a
                                href={`https://gateway.sphyre.tech/ipfs/${attachment.ipfs_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border border-info-400 text-info-200 hover:bg-info-500/10 transition"
                              >
                                <LinkIcon className="w-3.5 h-3.5" />
                                IPFS
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-error-500/10 border border-error-500/40 rounded-lg p-3 text-sm text-error-200">
                    {error}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="sticky bottom-0 bg-light-50 p-6 flex justify-end space-x-2">
                {String(detailData.status).toLowerCase() === 'pending' && (
                  <>
                    <button 
                      onClick={() => handleReject(detailData.id)} 
                      className="px-4 py-2 text-sm bg-error-500 text-white rounded-md hover:bg-error-600 transition"
                    >
                      Reject
                    </button>
                    <button 
                      onClick={() => handleApprove(detailData.id)} 
                      className="px-4 py-2 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600 transition"
                    >
                      Approve & Issue
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setShowDetail(false)} 
                  className="px-4 py-2 text-sm border border-dark-200 text-dark-400 rounded-md hover:bg-light-200 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {verificationStats.map(({ label, value, icon: Icon, iconClass }) => (
            <div key={label} className="bg-dark-800 border border-dark-700/80 overflow-hidden rounded-lg shadow-lg shadow-black/10">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center gap-4">
                  <div className={`flex-shrink-0 rounded-md p-3 ${iconClass}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-light-400 truncate">{label}</dt>
                      <dd>
                        <div className="text-lg font-semibold text-light-100">{value}</div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-dark-800 border border-dark-700/80 shadow-lg shadow-black/10 overflow-hidden sm:rounded-lg">
          {error && (
            <div className="px-4 py-4 text-sm text-error-300">{error}</div>
          )}
          {loading ? (
            <div className="px-4 py-6 text-sm text-light-300">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="px-4 py-6 text-sm text-light-300">No verification requests found.</div>
          ) : (
            <ul className="divide-y divide-dark-600">
              {requests.map((request) => (
                <li key={request.id}>
                  <div className="px-4 py-4 sm:px-6 hover:bg-dark-700/60 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <p className="text-sm font-semibold text-primary-200 truncate">
                          {request.user}
                        </p>
                        <p className="ml-2 flex-shrink-0 flex">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            request.status === 'approved' ? 'bg-success-500/15 text-success-400' :
                            request.status === 'rejected' ? 'bg-error-500/15 text-error-300' :
                            'bg-warning-500/15 text-warning-500'
                          }`}>
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </span>
                        </p>
                      </div>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className="text-sm text-light-400">
                          Requested {new Date(request.requestedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-light-400">
                          Credential: {request.credential}
                        </p>
                      </div>
                      <div className="mt-2 flex space-x-2 sm:mt-0">
                        <button
                          type="button"
                          onClick={() => handleViewDetails(request.id)}
                          className="inline-flex items-center px-2.5 py-1.5 border border-dark-600 text-xs font-medium rounded text-light-200 bg-dark-800 hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-dark-900"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        <div className="bg-dark-900/60 px-4 py-3 flex items-center justify-between border-t border-dark-700 sm:px-6 rounded-md">
          <p className="text-sm text-light-300">Total requests: {requests.length}</p>
        </div>
      </div>

      {/* PIN Modal */}
      <PinModal
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setPinAction(null);
        }}
        onSubmit={handlePinSubmit}
        title={pinAction?.type === 'approve' ? 'Approve Request' : 'Reject Request'}
        subtitle={pinAction?.type === 'approve' 
          ? 'Enter your PIN to approve this credential request' 
          : 'Enter your PIN to reject this credential request'}
      />
    </Layout>
  );
};

export default VerificationPage;