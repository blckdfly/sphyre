import React, { useState, useEffect } from 'react';
import { XIcon } from '@heroicons/react/outline';
import { issuerApi } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

const IssueCredentialModal = ({ isOpen, onClose, onSuccess }) => {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [issuerData, setIssuerData] = useState({});
  const [holderFields, setHolderFields] = useState([]);
  const [requiredEvidence, setRequiredEvidence] = useState([]);
  const [allowedEvidence, setAllowedEvidence] = useState([]);
  const [expirationDate, setExpirationDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offer, setOffer] = useState(null);
  const [qrCode, setQrCode] = useState(null);

  const issuerDid = localStorage.getItem('issuerDID') || '';
  const token = localStorage.getItem('token') || '';

  useEffect(() => {
    if (isOpen && issuerDid) {
      loadTemplates();
    }
  }, [isOpen, issuerDid]);

  useEffect(() => {
    console.log('QrCode state changed:', {
      exists: !!qrCode,
      length: qrCode?.length,
      startsWithDataImage: qrCode?.startsWith('data:image'),
      preview: qrCode?.substring(0, 50)
    });
  }, [qrCode]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await issuerApi.listTemplates(token, issuerDid);
      const templateList = response.data || response.templates || response || [];
      setTemplates(Array.isArray(templateList) ? templateList : []);
    } catch (err) {
      console.error(' Load templates error:', err);
      setError('Failed to load templates: ' + err.message);
      toast.error('Failed to load templates');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = async (template) => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Selected template:', template);
      
      const issuerInputFields = template.fields?.filter(f => 
        f.source === 'issuer_input'
      ) || [];
      
      const holderInputFields = template.fields?.filter(f => 
        f.source === 'holder_input'
      ) || [];
      
      if (issuerInputFields.length === 0 && holderInputFields.length === 0) {
        console.warn('No FieldSource data, using schema attributes');
        const schemaId = template.schema_id || template.schemaId;
        if (schemaId) {
          const schemaResponse = await issuerApi.getSchema(token, issuerDid, schemaId);
          const schema = schemaResponse.data || schemaResponse.schema || schemaResponse;
          
          if (schema && schema.attributes) {
            schema.attributes.forEach(attr => {
              const attrName = typeof attr === 'string' ? attr : attr?.name || '';
              if (attrName) {
                issuerInputFields.push({
                  name: attrName,
                  label: attrName.replace(/([A-Z])/g, ' $1').trim(),
                  field_type: 'text',
                  source: 'issuer_input',
                  required: true
                });
              }
            });
          }
        }
      }
      
      console.log('Issuer fields:', issuerInputFields.length);
      console.log('Holder fields:', holderInputFields.length);
      
      setSelectedTemplate(template);
      setHolderFields(holderInputFields);
      setRequiredEvidence(template.evidence_required || []);
      setAllowedEvidence(Array.isArray(template.allowed_evidence) ? template.allowed_evidence : []);
      
      const initialData = {};
      issuerInputFields.forEach(field => {
        initialData[field.name] = field.default_value || '';
      });
      
      setIssuerData(initialData);
      setStep(2);
    } catch (err) {
      console.error('Error selecting template:', err);
      setError('Failed to load template: ' + err.message);
      toast.error('Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const handleDataChange = (field, value) => {
    setIssuerData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const renderField = (field) => {
    const value = issuerData[field.name] || '';
    const fieldType = field.field_type || 'text';
    
    return (
      <div key={field.name}>
        <label className="block text-sm font-medium text-dark-500 mb-1">
          {field.label || field.name}
          {field.required && <span className="text-red-600 ml-1">*</span>}
        </label>
        
        {fieldType === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => handleDataChange(field.name, e.target.value)}
            className="w-full px-3 py-2 border border-dark-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={field.placeholder || `Enter ${field.label || field.name}`}
            rows={3}
            disabled={loading}
          />
        ) : fieldType === 'select' && field.options ? (
          <select
            value={value}
            onChange={(e) => handleDataChange(field.name, e.target.value)}
            className="w-full px-3 py-2 border border-dark-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={loading}
          >
            <option value="">Select...</option>
            {field.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : fieldType === 'checkbox' ? (
          <input
            type="checkbox"
            checked={value === true || value === 'true'}
            onChange={(e) => handleDataChange(field.name, e.target.checked)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            disabled={loading}
          />
        ) : (
          <input
            type={fieldType}
            value={value}
            onChange={(e) => handleDataChange(field.name, e.target.value)}
            className="w-full px-3 py-2 border border-dark-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={field.placeholder || `Enter ${field.label || field.name}`}
            disabled={loading}
          />
        )}
        
        {field.description && (
          <p className="text-xs text-dark-300 mt-1">{field.description}</p>
        )}
      </div>
    );
  };

  const handleCreateOffer = async () => {
    try {
      setLoading(true);
      setError('');

      const issuerFields = selectedTemplate.fields?.filter(f => f.source === 'issuer_input') || [];
      const requiredFields = issuerFields.filter(f => f.required);
      const missingFields = requiredFields.filter(f => !issuerData[f.name]);
      
      if (missingFields.length > 0) {
        throw new Error(`Please fill in required fields: ${missingFields.map(f => f.label || f.name).join(', ')}`);
      }

      console.log('Creating credential offer...');
      console.log('Template ID:', selectedTemplate.id);
      console.log('Issuer Data:', issuerData);
      console.log('Evidence required:', requiredEvidence);

      console.log('Creating offer...');
      
      const offerResult = await issuerApi.createOffer(token, issuerDid, {
        template_id: selectedTemplate.id,
        issuer_data: issuerData,
        expiration_hours: 24,
        evidence_required: requiredEvidence,
        allowed_evidence: allowedEvidence,
      });
      
      console.log('Offer created:', offerResult);
  
      const offer = offerResult.offer || offerResult.data || offerResult;
      const offerId = offer.id;
      
      if (!offerId) {
        console.error('No offer ID in response:', offerResult);
        throw new Error('Failed to get offer ID from backend response');
      }
      
      console.log('Offer ID:', offerId);
      console.log('Offer status:', offer.status);
      setOffer(offer);
      toast.success('Credential offer created!');

      console.log('Generating QR from offer...');
      
      try {
        const qrResult = await issuerApi.generateOfferQR(token, issuerDid, offerId);
        
        console.log('QR generation successful:', qrResult);
        console.log('Full response:', JSON.stringify(qrResult, null, 2));
 
        let qrData = qrResult.qr_data || qrResult.qrData || qrResult.data || qrResult;
        
        console.log('Extracted QR data:', qrData);
        console.log('QR data type:', typeof qrData);
        
        if (!qrData) {
          console.error('No QR data in response:', qrResult);
          throw new Error('QR data not found in response');
        }
        
        let qrImageData = qrData;
        
        if (typeof qrData === 'string' && !qrData.startsWith('data:image')) {
          console.log('QR data is not image format, might be JSON offer data');
          try {
            const parsedQR = JSON.parse(qrData);
            console.log('Holder fields in QR:', parsedQR.holder_fields);
            console.log('Issuer data preview:', parsedQR.issuer_data_preview);
            
            console.warn('Backend returned JSON instead of QR image!');
            toast.warning('Backend returned offer data instead of QR image. Please check backend implementation.');
          } catch (e) {
            console.log('QR data is string but not JSON:', qrData.substring(0, 100));
          }
        }
        
        console.log('Setting QR code, length:', qrImageData?.length);
        console.log('QR starts with data:image?', qrImageData?.startsWith('data:image'));
        setQrCode(qrImageData);
        console.log('QR code state set!');
        toast.success('QR code generated! Holder can now scan and accept');
      } catch (qrError) {
        console.error('QR generation failed:', qrError);
        toast.error('Failed to generate QR: ' + (qrError.message || 'Unknown error'));
      }

      setStep(4);
    } catch (err) {
      const errorMessage = err.message || 'Unknown error occurred';
      setError('Failed to create offer: ' + errorMessage);
      toast.error('Failed to create offer: ' + errorMessage);
      console.error('Create offer error:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setStep(1);
    setSelectedTemplate(null);
    setIssuerData({});
    setHolderFields([]);
    setExpirationDate('');
    setError('');
    setOffer(null);
    setQrCode(null);
  };

  const handleClose = () => {
    if (offer) {
      onSuccess?.(offer);
    }
    
    resetModal();
    onClose();
  };

  if (!isOpen) return null;

  const issuerFields = selectedTemplate?.fields?.filter(f => f.source === 'issuer_input') || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-light-1000 bg-opacity-75 transition-opacity" onClick={handleClose} />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-dark-500">
                Create Credential Offer - Step {step} of 4
              </h3>
              <button onClick={handleClose} className="text-dark-200 hover:text-dark-300">
                <XIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <div className="flex items-center">
                {[1, 2, 3, 4].map((num) => (
                  <React.Fragment key={num}>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                      step >= num ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-dark-300'
                    }`}>
                      {num}
                    </div>
                    {num < 4 && (
                      <div className={`flex-1 h-0.5 ${step > num ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div className="flex justify-between text-xs text-dark-300 mt-2">
                <span>Select Template</span>
                <span>Your Data</span>
                <span>Review</span>
                <span>Share QR</span>
              </div>
            </div>

            <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
              <p className="text-sm text-blue-800">
                You create an offer, holder scans QR code, provides their DID, completes 
                remaining information, and receives the credential automatically.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            {step === 1 && (
              <div>
                <h4 className="text-md font-medium mb-4">Select Credential Template</h4>
                {loading ? (
                  <div className="text-center py-4">Loading templates...</div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-4 text-dark-300">
                    No templates found. Please create a template first.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {templates.map(template => {
                      const issuerFieldCount = template.fields?.filter(f => f.source === 'issuer_input').length || 0;
                      const holderFieldCount = template.fields?.filter(f => f.source === 'holder_input').length || 0;
                      
                      return (
                        <div
                          key={template.id}
                          className={`border rounded-lg p-4 cursor-pointer hover:bg-light-100 transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                          onClick={() => handleTemplateSelect(template)}
                        >
                          <h5 className="font-medium text-dark-500">{template.name}</h5>
                          <p className="text-sm text-dark-300 mt-1">{template.description || 'No description'}</p>
                          <div className="mt-2 flex items-center space-x-2 flex-wrap gap-1">
                            <span className="text-xs bg-light-200 text-dark-500 px-2 py-1 rounded">
                              Schema: {template.schema_id || template.schemaId || 'N/A'}
                            </span>
                            {issuerFieldCount > 0 && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                {issuerFieldCount} field{issuerFieldCount !== 1 ? 's' : ''} (you fill)
                              </span>
                            )}
                            {holderFieldCount > 0 && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                {holderFieldCount} field{holderFieldCount !== 1 ? 's' : ''} (holder fills)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {step === 2 && selectedTemplate && (
              <div>
                <h4 className="text-md font-medium mb-4">Enter Your Data</h4>
                
                <div className="bg-green-50 border-l-4 border-green-400 rounded p-3 mb-4">
                  <p className="text-sm text-green-800">
                    <strong>You fill:</strong> Issuer-controlled data ({issuerFields.length} field{issuerFields.length !== 1 ? 's' : ''})
                  </p>
                  <p className="text-sm text-green-800 mt-1">
                    <strong>Holder fills:</strong> {holderFields.length} field{holderFields.length !== 1 ? 's' : ''} when they scan the QR code
                  </p>
                </div>
                
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  <div>
                    <label className="block text-sm font-medium text-dark-500 mb-1">
                      Offer Expiration (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={expirationDate}
                      onChange={(e) => setExpirationDate(e.target.value)}
                      className="w-full px-3 py-2 border border-dark-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={loading}
                    />
                    <p className="text-xs text-dark-300 mt-1">
                      When should this offer expire? Leave empty for no expiration.
                    </p>
                  </div>

                  {issuerFields.length === 0 ? (
                    <div className="text-center py-4 text-dark-300 bg-light-100 rounded">
                      No issuer fields required. All data will be provided by holder.
                    </div>
                  ) : (
                    issuerFields.map((field) => renderField(field))
                  )}

                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setStep(1)}
                      className="px-4 py-2 text-sm font-medium text-dark-500 bg-white border border-dark-100 rounded-md hover:bg-light-100"
                      disabled={loading}
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep(3)}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
                      disabled={loading}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h4 className="text-md font-medium mb-4">Review Credential Offer</h4>
                <div className="bg-light-100 rounded-lg p-4 space-y-3 max-h-96 overflow-y-auto">
                  <div>
                    <span className="font-medium">Template:</span> {selectedTemplate.name}
                  </div>
                  {expirationDate && (
                    <div>
                      <span className="font-medium">Offer Expires:</span> {new Date(expirationDate).toLocaleString()}
                    </div>
                  )}
                  {Object.keys(issuerData).length > 0 && (
                    <div className="bg-green-50 border-l-4 border-green-400 rounded p-3">
                      <p className="text-sm text-green-800 font-medium mb-2">Issuer-provided data:</p>
                      <ul className="space-y-1 ml-4 text-sm text-green-700">
                        {Object.entries(issuerData).map(([key, value]) => (
                          <li key={key}>
                            <span className="font-medium">{key}:</span> {String(value)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="bg-indigo-50 border-l-4 border-indigo-400 rounded p-3">
                    <p className="text-sm text-indigo-800">
                      When holder accepts, they'll be bound to this offer (one-time use).
                      Their DID will be verified via challenge/response authentication.
                    </p>
                  </div>
                  {requiredEvidence.length > 0 && (
                    <div className="bg-purple-50 border-l-4 border-purple-400 rounded p-3">
                      <p className="text-sm text-purple-800 font-medium mb-2">
                        Evidence required from holder:
                      </p>
                      <ul className="space-y-1 ml-4 text-sm text-purple-700">
                        {requiredEvidence.map(label => (
                          <li key={label}>• {label}</li>
                        ))}
                      </ul>
                      {allowedEvidence.length > 0 && (
                        <p className="text-xs text-purple-600 mt-2">
                          Allowed file labels/types: {allowedEvidence.join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                  {holderFields.length > 0 && (
                    <div className="bg-blue-50 border-l-4 border-blue-400 rounded p-3">
                      <p className="text-sm text-blue-800 font-medium mb-2">
                        Holder will provide ({holderFields.length} field{holderFields.length !== 1 ? 's' : ''}):
                      </p>
                      <ul className="space-y-1 ml-4">
                        {holderFields.map(field => (
                          <li key={field.name} className="text-sm text-blue-700">
                            - {field.label || field.name} {field.required && <span className="text-red-600">*</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex justify-between pt-4">
                  <button
                    onClick={() => setStep(2)}
                    className="px-4 py-2 text-sm font-medium text-dark-500 bg-white border border-dark-100 rounded-md hover:bg-light-100"
                    disabled={loading}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreateOffer}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:bg-gray-300"
                  >
                    {loading ? 'Creating Offer...' : 'Create Offer'}
                  </button>
                </div>
              </div>
            )}

            {step === 4 && offer && (() => {
              console.log('Offer', !!offer, 'qrCode:', !!qrCode, 'qrCode length:', qrCode?.length);
              return true;
            })() && (
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                  <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-lg font-medium text-dark-500 mb-2">Credential Offer Created!</h4>
                <p className="text-sm text-dark-300 mb-4">
                  Offer ID: {offer.id}
                </p>

                {qrCode && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-dark-500 mb-2">Share this QR Code with the holder:</h5>
                    <div className="flex justify-center">
                      <img 
                        src={qrCode} 
                        alt="Credential Offer QR Code" 
                        className="w-64 h-64 border-2 border-indigo-200 rounded-lg shadow-lg"
                        onError={(e) => {
                          console.error('[IssueCredentialModal] QR image failed to load');
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                      />
                      <div style={{display: 'none'}} className="text-red-500 text-sm">
                        QR image failed to load. Data: {qrCode?.substring(0, 100)}...
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-center space-x-3 pt-4">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-dark-500 bg-white border border-dark-100 rounded-md hover:bg-light-100"
                  >
                    Close
                  </button>
                  <button
                    onClick={resetModal}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
                  >
                    Create Another Offer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IssueCredentialModal;
