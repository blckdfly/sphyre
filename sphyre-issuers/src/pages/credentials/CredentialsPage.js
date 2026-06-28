import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { PlusIcon, DocumentDuplicateIcon, DocumentSearchIcon, EyeIcon, XCircleIcon, CheckCircleIcon } from '@heroicons/react/outline';
import IssueCredentialModal from '../../components/modals/IssueCredentialModal';
import TemplateModal from '../../components/modals/TemplateModal';
import SchemaModal from '../../components/modals/SchemaModal';
import { issuerApi } from '../../services/api';

const CredentialsPage = () => {
  const [credentials, setCredentials] = useState([]);
  const [offers, setOffers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('credentials');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Modal states
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [initError, setInitError] = useState('');

  const issuerDid = localStorage.getItem('issuerDID') || '';
  const token = localStorage.getItem('token') || '';

  useEffect(() => {
    try {
      console.log('Initializing...');
      console.log('issuerDID:', issuerDid ? 'Found' : 'Not found');

      if (issuerDid) {
        loadData();
      } else {
        console.warn('No issuerDID found in localStorage');
        setError('No issuer found. Please complete onboarding first.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Initialization error:', err);
      setInitError(err.message || 'Failed to initialize credentials page');
      setLoading(false);
    }
  }, [issuerDid]);

  const loadData = async () => {
    try {
      console.log('Loading data...');
      setLoading(true);
      setError('');

      const [credentialsRes, offersRes, templatesRes, schemasRes] = await Promise.allSettled([
        issuerApi.listIssuedCredentials(token, issuerDid),
        issuerApi.listOffers(token, issuerDid),
        issuerApi.listTemplates(token, issuerDid),
        issuerApi.listSchemas(token, issuerDid)
      ]);

      if (credentialsRes.status === 'fulfilled' && credentialsRes.value) {
        const data = credentialsRes.value.data || credentialsRes.value.credentials || credentialsRes.value;
        console.log('Credentials loaded:', Array.isArray(data) ? data.length : 0);

        // Map backend fields to frontend format
        const mappedCredentials = (Array.isArray(data) ? data : []).map(cred => ({
          id: cred.id,
          holderDid: cred.owner_did || cred.subject_did || 'Unknown',
          templateId: cred.credential_type || 'Unknown',
          issuedAt: cred.created_at,
          expiresAt: cred.expires_at,
          status: typeof cred.status === 'string' ? cred.status :
            (cred.status?.Active ? 'Active' : cred.status?.Revoked ? 'Revoked' : 'Unknown'),
          signature_type: cred.signature_type,
          bbs_signature: cred.bbs_signature,
          ipfs_hash: cred.ipfs_hash,
          ipfs_gateway_url: cred.ipfs_gateway_url || cred.ipfsGatewayUrl,
          metadata_uri: cred.metadata_uri,
          blockchain_tx_hash: cred.blockchain_tx_hash,
          credential_type: cred.credential_type,
          evidence_attachments: cred.evidence_attachments || cred.evidenceAttachments,
          schema_id: cred.schema_id,
        }));

        console.log('Mapped credentials:', mappedCredentials.length);
        setCredentials(mappedCredentials);
      } else {
        console.warn('Failed to load credentials:', credentialsRes.reason);
      }

      // Handle offers
      if (offersRes.status === 'fulfilled' && offersRes.value) {
        const data = offersRes.value.data || offersRes.value.offers || offersRes.value;
        console.log('Offers loaded:', Array.isArray(data) ? data.length : 0);
        setOffers(Array.isArray(data) ? data : []);
      } else {
        console.warn('Failed to load offers:', offersRes.reason);
      }

      // Handle templates
      if (templatesRes.status === 'fulfilled' && templatesRes.value) {
        const data = templatesRes.value.data || templatesRes.value.templates || templatesRes.value;
        console.log('Templates loaded:', Array.isArray(data) ? data.length : 0);
        setTemplates(Array.isArray(data) ? data : []);
      } else {
        console.warn('Failed to load templates:', templatesRes.reason);
        setTemplates([]);
      }

      // Handle schemas
      if (schemasRes.status === 'fulfilled' && schemasRes.value) {
        const data = schemasRes.value.data || schemasRes.value.schemas || schemasRes.value;
        console.log('Schemas loaded:', Array.isArray(data) ? data.length : 0);
        setSchemas(Array.isArray(data) ? data : []);
      } else {
        console.warn('Failed to load schemas:', schemasRes.reason);
        setSchemas([]);
      }

    } catch (err) {
      console.error('Load data error:', err);
      setError('Failed to load data. Some features may not work properly.');
      setCredentials([]);
      setTemplates([]);
      setSchemas([]);
    } finally {
      console.log('Data loading complete');
      setLoading(false);
    }
  };

  const toDate = (dt) => {
    if (!dt) return null;
    if (typeof dt === 'string' || typeof dt === 'number') return new Date(dt);
    if (dt && typeof dt === 'object' && ('$date' in dt)) return new Date(dt.$date);
    return null;
  };

  const handleRevokeCredential = async (credentialId) => {
    if (!window.confirm('Are you sure you want to revoke this credential?')) return;

    try {
      await issuerApi.revokeCredential(token, issuerDid, credentialId);
      loadData();
    } catch (err) {
      window.alert('Failed to revoke credential: ' + err.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-success-500/30 text-white border border-success-500/40';
      case 'revoked':
        return 'bg-error-500/30 text-white border border-error-500/40';
      case 'expired':
        return 'bg-warning-500/30 text-white border border-warning-500/40';
      default:
        return 'bg-dark-700 text-white border border-dark-600';
    }
  };

  const filteredCredentials = credentials.filter(cred => {
    const matchesSearch = cred.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cred.holderDid?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (initError) {
    return (
      <Layout title="Credentials Management">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-md w-full bg-dark-800 border border-dark-600 rounded-2xl p-8 shadow-xl shadow-black/20">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-error-500/10 border border-error-500/40 rounded-full flex items-center justify-center mx-auto">
                <XCircleIcon className="w-8 h-8 text-error-500" />
              </div>
              <h1 className="text-2xl font-semibold text-light-50">Initialization Error</h1>
              <p className="text-error-200">{initError}</p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-primary-500 hover:bg-primary-600 focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-dark-900 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="Credentials Management">
        <div className="flex items-center justify-center min-h-[60vh] text-light-200">
          <div className="text-center space-y-2">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mb-4"></div>
            <p className="text-light-100">Loading credentials...</p>
            <p className="text-sm text-light-300 mt-2">Please wait...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Credentials Management">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <p className="text-sm text-light-400 max-w-xl">
            Manage your issued credentials, offers, templates, and schemas in one place.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowIssueModal(true)}
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold text-white bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-dark-900"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              Issue New Credential
            </button>
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold border border-dark-500 bg-dark-800 text-light-100 hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-dark-900"
            >
              <DocumentDuplicateIcon className="-ml-1 mr-2 h-5 w-5 text-light-300" aria-hidden="true" />
              Manage Templates
            </button>
            <button
              type="button"
              onClick={() => setShowSchemaModal(true)}
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold border border-dark-500 bg-dark-800 text-light-100 hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-dark-900"
            >
              <DocumentSearchIcon className="-ml-1 mr-2 h-5 w-5 text-light-300" aria-hidden="true" />
              Manage Schemas
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-error-500/10 border border-error-500/40 text-error-200 px-4 py-3 rounded-lg">
            <p className="font-semibold uppercase tracking-wide text-xs">Error</p>
            <p>{error}</p>
          </div>
        )}

        <div>
          <div className="border-b border-dark-700">
            <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
              {[
                { key: 'credentials', label: 'Credentials', count: credentials.length },
                { key: 'offers', label: 'Offers', count: offers.length },
                { key: 'templates', label: 'Templates', count: templates.length },
                { key: 'schemas', label: 'Schemas', count: schemas.length }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`${activeTab === tab.key
                    ? 'border-primary-400 text-light-50'
                    : 'border-transparent text-light-400 hover:text-light-200 hover:border-dark-600'
                    } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.key
                    ? 'bg-primary-500/20 text-light-50'
                    : 'bg-dark-700 text-light-300'
                    }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {activeTab === 'credentials' && (
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
            <div className="max-w-lg w-full lg:max-w-xs">
              <label htmlFor="search" className="sr-only">
                Search
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DocumentSearchIcon className="h-5 w-5 text-light-400" aria-hidden="true" />
                </div>
                <input
                  id="search"
                  name="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-dark-600 rounded-md leading-5 bg-dark-800 text-light-100 placeholder-light-400 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400 sm:text-sm"
                  placeholder="Search by ID or holder DID"
                  type="search"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'credentials' && (loading ? (
          <div className="text-center py-8 text-light-300">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            <p className="mt-2">Loading credentials...</p>
          </div>
        ) : (
          <div className="bg-dark-800 border border-dark-700/80 shadow-lg shadow-black/10 overflow-hidden sm:rounded-lg">
            {filteredCredentials.length === 0 ? (
              <div className="text-center py-12 text-light-300">
                <DocumentSearchIcon className="mx-auto h-12 w-12 text-light-400" />
                <h3 className="mt-2 text-sm font-semibold text-light-200">No credentials found</h3>
                <p className="mt-1 text-sm text-light-400">
                  {credentials.length === 0 ? 'Get started by issuing your first credential.' : 'Try adjusting your search or filters.'}
                </p>
                {credentials.length === 0 && (
                  <div className="mt-6">
                    <button
                      onClick={() => setShowIssueModal(true)}
                      className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-500 hover:bg-primary-600"
                    >
                      <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                      Issue New Credential
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-dark-600">
                {filteredCredentials.map((credential) => (
                  <li key={credential.id}>
                    <div className="px-4 py-4 sm:px-6 hover:bg-dark-700/60 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-primary-200 truncate">
                              Credential #{credential.id?.slice(-8) || 'Unknown'}
                            </p>
                            <div className="ml-2 flex items-center space-x-2">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(credential.status)}`}>
                                {credential.status || 'Unknown'}
                              </span>
                              {(credential.signature_type === 'bbs+' || credential.bbs_signature) && (
                                <span
                                  className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-primary-500/30 text-white border border-primary-500/40"
                                  title="Privacy-enhanced with BBS+ signatures and unlinkable presentations"
                                >
                                  BBS+
                                </span>
                              )}
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => {
                                    setSelectedCredential(credential);
                                    setShowCredentialModal(true);
                                  }}
                                  className="text-primary-300 hover:text-primary-100"
                                  title="View Details"
                                >
                                  <EyeIcon className="h-4 w-4" />
                                </button>
                                {credential.status?.toLowerCase() === 'active' && (
                                  <button
                                    onClick={() => handleRevokeCredential(credential.id)}
                                    className="text-red-500 hover:text-red-300"
                                    title="Revoke Credential"
                                  >
                                    <XCircleIcon className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 sm:flex sm:justify-between">
                            <div className="sm:flex">
                              <p className="flex items-center text-sm text-light-400">
                                Holder DID: {credential.holderDid ? `${credential.holderDid.slice(0, 20)}...` : 'Unknown'}
                              </p>
                              <p className="mt-2 flex items-center text-sm text-light-400 sm:mt-0 sm:ml-6">
                                Template: {credential.templateId || 'Unknown'}
                              </p>
                            </div>
                            <div className="mt-2 flex items-center text-sm text-light-400 sm:mt-0">
                              Issued: {toDate(credential.issuedAt)?.toLocaleString() || 'Unknown'}
                            </div>
                          </div>
                          {credential.expiresAt && (
                            <div className="mt-1 text-xs text-light-400">
                              Expires: {new Date(credential.expiresAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Offers Tab */}
        {activeTab === 'offers' && (loading ? (
          <div className="text-center py-8 text-light-300">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            <p className="mt-2">Loading offers...</p>
          </div>
        ) : (
          <div className="bg-dark-800 border border-dark-700/80 shadow-lg shadow-black/10 overflow-hidden sm:rounded-lg">
            {offers.length === 0 ? (
              <div className="text-center py-12 text-light-300">
                <DocumentSearchIcon className="mx-auto h-12 w-12 text-light-400" />
                <h3 className="mt-2 text-sm font-semibold text-light-200">No offers found</h3>
                <p className="mt-1 text-sm">
                  Create a credential offer to get started.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowIssueModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-500 hover:bg-primary-600"
                  >
                    <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                    Create Offer
                  </button>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-dark-600">
                {offers.map((offer) => (
                  <li key={offer.id}>
                    <div className="px-4 py-4 sm:px-6 hover:bg-dark-700/60 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-sm font-semibold text-light-100">
                              {offer.credential_type || 'Unknown Type'}
                            </h3>

                            {/* Status Badge */}
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${offer.status === 'pending' ? 'bg-warning-500/15 text-warning-500' :
                              offer.status === 'accepted' ? 'bg-primary-500/15 text-primary-300' :
                                offer.status === 'completed' ? 'bg-success-500/15 text-success-500' :
                                  offer.status === 'expired' ? 'bg-dark-600 text-light-400' :
                                    'bg-dark-700 text-light-300'
                              }`}>
                              {offer.status || 'unknown'}
                            </span>

                            {/* One-time Use Indicator */}
                            {offer.one_time_used ? (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-error-500/40 text-white border border-error-500/50" title="This offer has been used">
                                Used
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-success-500/40 text-white border border-success-500/50" title="This offer is still available">
                                Available
                              </span>
                            )}
                          </div>

                          {/* Offer Details */}
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-light-400">
                              Offer ID: <span className="font-mono">{offer.id}</span>
                            </p>
                            <p className="text-xs text-light-400">
                              Schema: <span className="font-mono text-primary-200">{offer.schema_id?.split(':').pop() || 'Unknown'}</span>
                            </p>
                            <p className="text-xs text-light-400">
                              Created: {toDate(offer.created_at)?.toLocaleString() || 'Unknown'}
                            </p>
                            {offer.expires_at && (
                              <p className="text-xs text-light-400">
                                Expires: {toDate(offer.expires_at)?.toLocaleString() || 'Unknown'}
                              </p>
                            )}
                          </div>

                          {/* Accepted By DID Display */}
                          {offer.accepted_by_did && (
                            <div className="mt-3 p-3 bg-primary-500/10 border-l-4 border-primary-400 rounded">
                              <p className="text-xs font-semibold text-primary-200 mb-1">
                                Bound to Holder
                              </p>
                              <p className="text-xs text-primary-100 font-mono break-all">
                                {offer.accepted_by_did}
                              </p>
                              {offer.accepted_at && (
                                <p className="text-xs text-primary-200 mt-1">
                                  Accepted: {toDate(offer.accepted_at)?.toLocaleString() || 'Unknown'}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Issuer Data Preview */}
                          {offer.issuer_data && Object.keys(offer.issuer_data).length > 0 && (
                            <div className="mt-2 p-2 bg-dark-700/80 rounded">
                              <p className="text-xs font-semibold text-light-200 mb-1">Issuer Data:</p>
                              {Object.entries(offer.issuer_data).map(([key, value]) => (
                                <p key={key} className="text-xs text-light-400">
                                  {key}: <span className="font-medium">{String(value)}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="ml-4 flex flex-col items-end space-y-2">
                          {offer.status === 'Pending' && !offer.one_time_used && (
                            <span className="text-lg text-warning-500" title="Waiting for holder to accept">
                              Waiting
                            </span>
                          )}
                          {offer.status === 'Accepted' && (
                            <CheckCircleIcon className="h-8 w-8 text-primary-300" title="Accepted by holder" />
                          )}
                          {offer.status === 'Completed' && (
                            <CheckCircleIcon className="h-8 w-8 text-success-400" title="Credential issued" />
                          )}

                          {/* View QR Button */}
                          {offer.status === 'Pending' && !offer.one_time_used && (
                            <button
                              onClick={async () => {
                                try {
                                  const qrResult = await issuerApi.generateOfferQR(token, issuerDid, offer.id);
                                  const qrData = qrResult.qr_data || qrResult.data || qrResult;
                                  setQrCodeData(qrData);
                                  setShowQRModal(true);
                                } catch (err) {
                                  console.error('[CredentialsPage] Failed to generate QR:', err);
                                  alert('Failed to generate QR code: ' + err.message);
                                }
                              }}
                              className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600"
                            >
                              View QR
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Templates Tab */}
        {activeTab === 'templates' && (loading ? (
          <div className="text-center py-8 text-light-300">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            <p className="mt-2">Loading templates...</p>
          </div>
        ) : (
          <div className="bg-dark-800 border border-dark-700/80 shadow-lg shadow-black/10 overflow-hidden sm:rounded-lg">
            {templates.length === 0 ? (
              <div className="text-center py-12 text-light-300">
                <DocumentDuplicateIcon className="mx-auto h-12 w-12 text-light-400" />
                <h3 className="mt-2 text-sm font-semibold text-light-200">No templates found</h3>
                <p className="mt-1 text-sm">
                  Create a template to get started.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-500 hover:bg-primary-600"
                  >
                    <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                    Create Template
                  </button>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-dark-600">
                {templates.map((template) => (
                  <li key={template.id}>
                    <div className="px-4 py-4 sm:px-6 hover:bg-dark-700/60 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-sm font-semibold text-light-100">
                              {template.name}
                            </h3>
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-primary-500/15 text-primary-200">
                              {template.fields?.length || 0} fields
                            </span>
                          </div>

                          <p className="mt-2 text-xs text-light-400">
                            {template.description || 'No description'}
                          </p>

                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-light-400">
                              Schema: <span className="font-mono text-primary-200">{template.schema_id?.split(':').pop() || 'Unknown'}</span>
                            </p>
                            <p className="text-xs text-light-400">
                              Template ID: <span className="font-mono">{template.id}</span>
                            </p>
                          </div>

                          {/* Field Source Summary */}
                          {template.fields && template.fields.length > 0 && (
                            <div className="mt-3 flex items-center space-x-2">
                              <span className="text-xs text-light-400">Fields:</span>
                              <span className="px-2 py-1 text-xs rounded-full bg-success-500/30 text-white border border-success-500/40">
                                {template.fields.filter(f => f.source === 'issuer_input').length} Issuer
                              </span>
                              <span className="px-2 py-1 text-xs rounded-full bg-primary-500/30 text-white border border-primary-500/40">
                                {template.fields.filter(f => f.source === 'holder_input').length} Holder
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="ml-4 flex flex-col items-end space-y-2">
                          <button
                            onClick={() => {
                              setSelectedTemplate(template);
                              setShowTemplateModal(true);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Schemas Tab */}
        {activeTab === 'schemas' && (loading ? (
          <div className="text-center py-8 text-light-300">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            <p className="mt-2">Loading schemas...</p>
          </div>
        ) : (
          <div className="bg-dark-800 border border-dark-700/80 shadow-lg shadow-black/10 overflow-hidden sm:rounded-lg">
            {schemas.length === 0 ? (
              <div className="text-center py-12 text-light-300">
                <DocumentSearchIcon className="mx-auto h-12 w-12 text-light-400" />
                <h3 className="mt-2 text-sm font-semibold text-light-200">No schemas found</h3>
                <p className="mt-1 text-sm">
                  Create a schema to get started.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowSchemaModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-500 hover:bg-primary-600"
                  >
                    <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                    Create Schema
                  </button>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-dark-600">
                {schemas.map((schema) => (
                  <li key={schema.id}>
                    <div className="px-4 py-4 sm:px-6 hover:bg-dark-700/60 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-sm font-semibold text-light-100">
                              {schema.name}
                            </h3>
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-primary-500/15 text-primary-200">
                              v{schema.version || '1.0'}
                            </span>
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-primary-500/15 text-primary-200">
                              {schema.attributes?.length || 0} attributes
                            </span>
                          </div>

                          <p className="mt-2 text-xs text-light-400">
                            {schema.description || 'No description'}
                          </p>

                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-light-400">
                              Schema ID: <span className="font-mono text-primary-200">{schema.id}</span>
                            </p>
                            <p className="text-xs text-light-400">
                              Type: <span className="font-medium">{schema.type || 'Unknown'}</span>
                            </p>
                          </div>

                          {/* Attributes List */}
                          {schema.attributes && schema.attributes.length > 0 && (
                            <div className="mt-3 p-2 bg-dark-700/80 rounded">
                              <p className="text-xs font-semibold text-light-200 mb-1">Attributes:</p>
                              <div className="flex flex-wrap gap-1 text-light-100">
                                {schema.attributes.slice(0, 10).map((attr, idx) => {
                                  const attrName = typeof attr === 'string' ? attr : attr?.name || 'Unknown';
                                  const dataType = typeof attr === 'object' ? attr?.data_type : null;
                                  return (
                                    <span key={idx} className="px-2 py-0.5 text-xs bg-dark-800 border border-dark-600 rounded">
                                      {attrName}{dataType ? ` (${dataType})` : ''}
                                    </span>
                                  );
                                })}
                                {schema.attributes.length > 10 && (
                                  <span className="text-xs text-light-400">
                                    +{schema.attributes.length - 10} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="ml-4 flex flex-col items-end space-y-2">
                          <button
                            onClick={() => {
                              setSelectedSchema(schema);
                              setShowSchemaModal(true);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Pagination - Only for Credentials tab */}
        {activeTab === 'credentials' && filteredCredentials.length > 0 && (
          <div className="bg-dark-900/60 px-4 py-3 flex items-center justify-between border-t border-dark-700 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <span className="text-sm text-light-300">
                Showing {filteredCredentials.length} credential{filteredCredentials.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-light-300">
                  Showing <span className="font-medium">{filteredCredentials.length}</span> of{' '}
                  <span className="font-medium">{credentials.length}</span> credential{credentials.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        <IssueCredentialModal
          isOpen={showIssueModal}
          onClose={() => setShowIssueModal(false)}
          onSuccess={(credential) => {
            console.log('Credential issued:', credential);
            loadData();
          }}
        />

        <TemplateModal
          isOpen={showTemplateModal}
          onClose={() => {
            setShowTemplateModal(false);
            setSelectedTemplate(null);
          }}
          onSuccess={(template) => {
            console.log('Template saved:', template);
            loadData();
          }}
          template={selectedTemplate}
        />

        <SchemaModal
          isOpen={showSchemaModal}
          onClose={() => {
            setShowSchemaModal(false);
            setSelectedSchema(null);
          }}
          onSuccess={(schema) => {
            console.log('Schema saved:', schema);
            loadData();
          }}
          schema={selectedSchema}
        />

        {/* Credential Detail Modal */}
        {showCredentialModal && selectedCredential && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-dark-900/80 transition-opacity"
                onClick={() => {
                  setShowCredentialModal(false);
                  setSelectedCredential(null);
                }}
              />

              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
                &#8203;
              </span>

              <div className="inline-block align-bottom bg-dark-800 border border-dark-600 rounded-2xl text-left overflow-hidden shadow-2xl shadow-black/40 transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
                <div className="bg-dark-800 px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-light-400">Credential ID</p>
                      <p className="font-semibold text-light-50 break-all">{selectedCredential.id || 'Unknown'}</p>
                      <p className="text-xs text-light-400 mt-1">{selectedCredential.credential_type || selectedCredential.templateId || 'Unknown type'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedCredential.status)}`}>
                        {selectedCredential.status || 'Unknown'}
                      </span>
                      {(selectedCredential.signature_type === 'bbs+' || selectedCredential.bbs_signature) && (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-primary-500/30 text-white border border-primary-500/40">
                          BBS+
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setShowCredentialModal(false);
                          setSelectedCredential(null);
                        }}
                        className="text-light-500 hover:text-light-200"
                        title="Close"
                      >
                        <XCircleIcon className="w-6 h-6" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-dark-900/50 border border-dark-600">
                      <p className="text-xs text-light-400 mb-1">Holder DID</p>
                      <p className="text-sm font-mono text-light-100 break-all">{selectedCredential.holderDid}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-dark-900/50 border border-dark-600">
                      <p className="text-xs text-light-400 mb-1">Template</p>
                      <p className="text-sm text-light-100">{selectedCredential.templateId || 'Unknown'}</p>
                      {selectedCredential.schema_id && (
                        <p className="text-xs text-light-400 mt-1">Schema: {selectedCredential.schema_id}</p>
                      )}
                    </div>
                    <div className="p-3 rounded-xl bg-dark-900/50 border border-dark-600">
                      <p className="text-xs text-light-400">Issued At</p>
                      <p className="text-sm text-light-100">{toDate(selectedCredential.issuedAt)?.toLocaleString() || 'Unknown'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-dark-900/50 border border-dark-600">
                      <p className="text-xs text-light-400">Expires At</p>
                      <p className="text-sm text-light-100">{selectedCredential.expiresAt ? new Date(selectedCredential.expiresAt).toLocaleString() : 'No expiry'}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-dark-900/40 border border-dark-600">
                      <p className="text-xs font-semibold text-light-200 mb-2">Storage</p>
                      {selectedCredential.ipfs_hash ? (
                        <div className="space-y-2 text-sm">
                          <div>
                            <p className="text-light-400 text-xs mb-1">IPFS Hash</p>
                            <p className="font-mono text-light-100 break-all">{selectedCredential.ipfs_hash}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {selectedCredential.ipfs_gateway_url && (
                              <a
                                href={selectedCredential.ipfs_gateway_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1 rounded-full bg-primary-500/20 text-primary-200 hover:bg-primary-500/30"
                              >
                                View on IPFS Gateway
                              </a>
                            )}
                            {selectedCredential.metadata_uri && (
                              <a
                                href={selectedCredential.metadata_uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1 rounded-full bg-dark-700 text-light-200 hover:bg-dark-600"
                              >
                                Metadata URI
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-light-400">No IPFS metadata recorded.</p>
                      )}
                    </div>

                    <div className="p-4 rounded-xl bg-dark-900/40 border border-dark-600">
                      <p className="text-xs font-semibold text-light-200 mb-2">Blockchain</p>
                      {selectedCredential.blockchain_tx_hash ? (
                        <div className="space-y-2 text-sm">
                          <div>
                            <p className="text-light-400 text-xs mb-1">Transaction Hash</p>
                            <p className="font-mono text-light-100 break-all">{selectedCredential.blockchain_tx_hash}</p>
                          </div>
                          <a
                            href={`https://sepolia.basescan.org/tx/${selectedCredential.blockchain_tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 inline-flex items-center gap-1 rounded-full bg-success-500/20 text-success-200 text-xs hover:bg-success-500/30"
                          >
                            View on BaseScan
                          </a>
                        </div>
                      ) : (
                        <p className="text-sm text-light-400">Not anchored on-chain yet.</p>
                      )}
                    </div>
                  </div>

                  {selectedCredential.evidence_attachments && selectedCredential.evidence_attachments.length > 0 && (
                    <div className="mt-5 p-4 rounded-xl bg-dark-900/40 border border-dark-600">
                      <p className="text-xs font-semibold text-light-200 mb-2">Evidence Attachments</p>
                      <div className="space-y-1 text-sm text-light-100">
                        {selectedCredential.evidence_attachments.map((att, idx) => (
                          <div key={`${att.label || 'evidence'}-${idx}`} className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{att.label || att.filename || `Attachment ${idx + 1}`}</p>
                              {att.ipfs_hash && <p className="text-xs text-light-400 break-all">Hash: {att.ipfs_hash}</p>}
                            </div>
                            {att.gateway_url && (
                              <a
                                href={att.gateway_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1 rounded-full bg-primary-500/20 text-primary-200"
                              >
                                View
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-dark-900/60 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-xs text-light-400">
                    Need to anchor? Use the Issue Credential modal to re-trigger blockchain registration with this credential hash.
                  </p>
                  <button
                    onClick={() => {
                      setShowCredentialModal(false);
                      setSelectedCredential(null);
                    }}
                    className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-500 text-sm font-medium text-white hover:bg-primary-600"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QR Code Modal */}
        {showQRModal && qrCodeData && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-dark-900/80 transition-opacity"
                onClick={() => {
                  setShowQRModal(false);
                  setQrCodeData(null);
                }}
              />

              <div className="inline-block align-bottom bg-dark-800 border border-dark-600 text-left overflow-hidden shadow-2xl shadow-black/40 transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
                <div className="bg-dark-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-light-100">
                      Offer QR Code
                    </h3>
                    <button
                      onClick={() => {
                        setShowQRModal(false);
                        setQrCodeData(null);
                      }}
                      className="text-light-500 hover:text-light-300"
                    >
                      <XCircleIcon className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="flex items-center justify-center bg-dark-900/60 border border-dark-700 p-6 rounded-lg">
                    <img
                      src={qrCodeData}
                      alt="QR Code"
                      className="max-w-full h-auto"
                      style={{ maxWidth: '300px' }}
                    />
                  </div>

                  <p className="mt-4 text-sm text-light-300 text-center">
                    Scan this QR code with the holder app to collect the credential
                  </p>
                </div>

                <div className="bg-dark-900/60 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    onClick={() => {
                      setShowQRModal(false);
                      setQrCodeData(null);
                    }}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-500 text-base font-medium text-white hover:bg-primary-600 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CredentialsPage;