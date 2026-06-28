import React, { useState, useEffect } from 'react';
import { XIcon, PlusIcon, TrashIcon, EyeIcon, PencilIcon, CheckCircleIcon } from '@heroicons/react/outline';
import { issuerApi } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

const SchemaModal = ({ isOpen, onClose, onSuccess }) => {
  const toast = useToast();
  const [view, setView] = useState('list'); 
  const [schemas, setSchemas] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const attributeTypeOptions = [
    { value: 'string', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
  ];
  const [formData, setFormData] = useState({
    name: '',
    version: '1.0',
    description: '',
    attributes: [{ name: '', data_type: 'string', required: true }],
    extensions_allowed: false,
    allowed_extensions: [''],
    evidence_allowed: false,
    allowed_evidence: [''],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const issuerDid = localStorage.getItem('issuerDID') || '';
  const token = localStorage.getItem('token') || '';

  useEffect(() => {
    if (isOpen) {
      loadSchemas();
    }
  }, [isOpen]);

  const loadSchemas = async () => {
    try {
      setLoading(true);
      const response = await issuerApi.listSchemas(token, issuerDid);
      const schemaList = response.data || response.schemas || response || [];
      setSchemas(Array.isArray(schemaList) ? schemaList : []);
    } catch (err) {
      console.error('Load schemas error:', err);
      toast.error('Failed to load schemas');
      setSchemas([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const attributes = formData.attributes
      .filter(attr => attr.name.trim() !== '')
      .map(attr => ({
        name: attr.name.trim(),
        data_type: attr.data_type || 'string',
        required: attr.required !== false,
      }));

    if (!formData.name || attributes.length === 0) {
      setError('Name and at least one attribute are required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const schemaData = {
        name: formData.name,
        version: formData.version,
        description: formData.description,
        attributes,
        extensionsAllowed: formData.extensions_allowed,
        allowedExtensions: formData.extensions_allowed
          ? formData.allowed_extensions.filter(ext => ext.trim() !== '')
          : [],
        evidenceAllowed: formData.evidence_allowed,
        allowedEvidence: formData.evidence_allowed
          ? formData.allowed_evidence.filter(ev => ev.trim() !== '')
          : [],
      };

      let result;
      if (isEditing && selectedSchema) {
        result = await issuerApi.updateSchema(token, issuerDid, selectedSchema.id, schemaData);
        toast.success('Schema updated successfully!');
      } else {
        result = await issuerApi.createSchema(token, issuerDid, schemaData);
        toast.success('Schema created successfully!');
      }

      await loadSchemas();
      setView('list');
      resetForm();
      onSuccess?.(result);
    } catch (err) {
      const errorMessage = err.message || 'Unknown error occurred';
      setError('Failed to save schema: ' + errorMessage);
      toast.error('Failed to save schema: ' + errorMessage);
      console.error('Save error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (schemaId) => {
    if (!window.confirm('Are you sure you want to delete this schema? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await issuerApi.deleteSchema(token, issuerDid, schemaId);
      toast.success('Schema deleted successfully');
      await loadSchemas();
      if (view === 'detail' && selectedSchema?.id === schemaId) {
        setView('list');
      }
    } catch (err) {
      toast.error('Failed to delete schema: ' + err.message);
      console.error('Delete error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schema) => {
    setSelectedSchema(schema);
    const transformedAttrs = (schema.attributes || ['']).map(attr => {
      if (typeof attr === 'string') {
        return { name: attr, data_type: 'string', required: true };
      }
      return {
        name: attr?.name || '',
        data_type: attr?.data_type || 'string',
        required: attr?.required !== false,
      };
    });
    setFormData({
      name: schema.name,
      version: schema.version || '1.0',
      description: schema.description || '',
      attributes: transformedAttrs.length > 0 ? transformedAttrs : [{ name: '', data_type: 'string', required: true }],
      extensions_allowed: Boolean(schema.extensions_allowed),
      allowed_extensions: (schema.allowed_extensions && schema.allowed_extensions.length > 0)
        ? schema.allowed_extensions
        : [''],
      evidence_allowed: Boolean(schema.evidence_allowed),
      allowed_evidence: (schema.allowed_evidence && schema.allowed_evidence.length > 0)
        ? schema.allowed_evidence
        : [''],
    });
    setIsEditing(true);
    setView('form');
  };

  const handleViewDetail = (schema) => {
    setSelectedSchema(schema);
    setView('detail');
  };

  const handleCreateNew = () => {
    resetForm();
    setIsEditing(false);
    setView('form');
  };

  const resetForm = () => {
    setFormData({
      name: '',
      version: '1.0',
      description: '',
      attributes: [{ name: '', data_type: 'string', required: true }],
      extensions_allowed: false,
      allowed_extensions: [''],
      evidence_allowed: false,
      allowed_evidence: [''],
    });
    setSelectedSchema(null);
    setIsEditing(false);
    setError('');
  };

  const addAttribute = () => {
    setFormData(prev => ({
      ...prev,
      attributes: [...prev.attributes, { name: '', data_type: 'string', required: true }]
    }));
  };

  const removeAttribute = (index) => {
    setFormData(prev => ({
      ...prev,
      attributes: prev.attributes.filter((_, i) => i !== index)
    }));
  };

  const updateAttribute = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      attributes: prev.attributes.map((attr, i) => {
        if (i !== index) return attr;
        return {
          ...attr,
          [field]: field === 'name' ? value : value,
        };
      }),
    }));
  };

  const addAllowedExtension = () => {
    setFormData(prev => ({
      ...prev,
      allowed_extensions: [...prev.allowed_extensions, '']
    }));
  };

  const updateAllowedExtension = (index, value) => {
    setFormData(prev => ({
      ...prev,
      allowed_extensions: prev.allowed_extensions.map((ext, i) => i === index ? value : ext)
    }));
  };

  const removeAllowedExtension = (index) => {
    setFormData(prev => ({
      ...prev,
      allowed_extensions: prev.allowed_extensions.filter((_, i) => i !== index)
    }));
  };

  const addAllowedEvidence = () => {
    setFormData(prev => ({
      ...prev,
      allowed_evidence: [...prev.allowed_evidence, '']
    }));
  };

  const updateAllowedEvidence = (index, value) => {
    setFormData(prev => ({
      ...prev,
      allowed_evidence: prev.allowed_evidence.map((ev, i) => i === index ? value : ev)
    }));
  };

  const removeAllowedEvidence = (index) => {
    setFormData(prev => ({
      ...prev,
      allowed_evidence: prev.allowed_evidence.filter((_, i) => i !== index)
    }));
  };

  const handleClose = () => {
    resetForm();
    setView('list');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" onClick={handleClose} />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-6 pt-6 pb-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold" style={{ color: '#090909' }}>
                {view === 'list' ? 'Schema Management' : view === 'detail' ? 'Schema Details' : isEditing ? 'Edit Schema' : 'Create New Schema'}
              </h3>
              <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <XIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="bg-white px-6 py-6" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            {view === 'list' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <p className="text-gray-600">Manage your credential schemas</p>
                  <button
                    onClick={handleCreateNew}
                    style={{ background: '#0005FF', color: 'white' }}
                    className="inline-flex items-center px-4 py-2 rounded-md font-semibold hover:opacity-90 transition-opacity"
                  >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Create New Schema
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading schemas...</p>
                  </div>
                ) : schemas.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No schemas</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new schema.</p>
                    <div className="mt-6">
                      <button
                        onClick={handleCreateNew}
                        style={{ background: '#0005FF', color: 'white' }}
                        className="inline-flex items-center px-4 py-2 rounded-md font-semibold"
                      >
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Create Schema
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {schemas.map((schema) => (
                      <div
                        key={schema.id}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold" style={{ color: '#090909' }}>
                              {schema.name}
                            </h4>
                            <p className="text-sm text-gray-500">Version {schema.version}</p>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleViewDetail(schema)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                              title="View Details"
                            >
                              <EyeIcon className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleEdit(schema)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                              title="Edit"
                            >
                              <PencilIcon className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(schema.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {schema.description && (
                          <p className="text-sm text-gray-600 mb-3">{schema.description}</p>
                        )}

                        <div className="mt-3">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Attributes:</p>
                          <div className="flex flex-wrap gap-2">
                            {schema.attributes?.slice(0, 5).map((attr, idx) => {
                              // Handle both string and object formats
                              const attrName = typeof attr === 'string' ? attr : attr?.name || 'Unknown';
                              return (
                                <span
                                  key={idx}
                                  className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                                >
                                  {attrName}
                                </span>
                              );
                            })}
                            {schema.attributes?.length > 5 && (
                              <span className="inline-block text-xs text-gray-500 px-2 py-1">
                                +{schema.attributes.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'detail' && selectedSchema && (
              <div>
                <div className="mb-6">
                  <button
                    onClick={() => setView('list')}
                    className="text-blue-600 hover:text-blue-800 flex items-center text-sm mb-4"
                  >
                    ← Back to list
                  </button>

                  <div className="bg-gray-50 rounded-lg p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-bold" style={{ color: '#090909' }}>
                          {selectedSchema.name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Version {selectedSchema.version}</p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(selectedSchema)}
                          style={{ background: '#0005FF', color: 'white' }}
                          className="inline-flex items-center px-3 py-2 rounded-md text-sm font-semibold"
                        >
                          <PencilIcon className="w-4 h-4 mr-2" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(selectedSchema.id)}
                          className="inline-flex items-center px-3 py-2 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-700"
                        >
                          <TrashIcon className="w-4 h-4 mr-2" />
                          Delete
                        </button>
                      </div>
                    </div>

                    {selectedSchema.description && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Description</h4>
                        <p className="text-gray-600">{selectedSchema.description}</p>
                      </div>
                    )}

                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Attributes ({selectedSchema.attributes?.length || 0})</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {selectedSchema.attributes?.map((attr, idx) => {
                          const attrName = typeof attr === 'string' ? attr : attr?.name || 'Unknown';
                          const attrType = typeof attr === 'object' ? attr?.data_type : 'string';
                          return (
                            <div
                              key={idx}
                              className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col"
                            >
                              <div className="flex items-center">
                                <CheckCircleIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" />
                                <span className="text-sm font-medium text-gray-900">{attrName}</span>
                              </div>
                              {attrType && <span className="text-xs text-gray-500 mt-1 ml-7">{attrType}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {selectedSchema.extensions_allowed && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Allowed Extensions</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedSchema.allowed_extensions?.map((ext, idx) => (
                            <span
                              key={idx}
                              className="inline-block bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full font-medium"
                            >
                              {ext}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSchema.evidence_allowed && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Allowed Evidence Types</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedSchema.allowed_evidence?.map((ev, idx) => (
                            <span
                              key={idx}
                              className="inline-block bg-purple-100 text-purple-700 text-xs px-3 py-1 rounded-full font-medium"
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSchema.created_at && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <p className="text-xs text-gray-500">
                          Created: {new Date(selectedSchema.created_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {view === 'form' && (
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#090909' }}>
                      Schema Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., University Degree Schema"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#090909' }}>
                      Version
                    </label>
                    <input
                      type="text"
                      value={formData.version}
                      onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="1.0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#090909' }}>
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="3"
                      placeholder="Describe what this schema represents..."
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium" style={{ color: '#090909' }}>
                        Attributes
                      </label>
                      <button
                        type="button"
                        onClick={addAttribute}
                        style={{ background: '#0005FF', color: 'white' }}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium rounded hover:opacity-90"
                      >
                        <PlusIcon className="w-3 h-3 mr-1" />
                        Add
                      </button>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {formData.attributes.map((attribute, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2">
                          <div className="col-span-7">
                            <input
                              type="text"
                              value={attribute.name}
                              onChange={(e) => updateAttribute(index, 'name', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder={`Attribute ${index + 1}`}
                            />
                          </div>
                          <div className="col-span-4">
                            <select
                              value={attribute.data_type}
                              onChange={(e) => updateAttribute(index, 'data_type', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {attributeTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-1 flex items-center justify-end">
                            {formData.attributes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeAttribute(index)}
                                className="p-2 text-red-600 hover:text-red-800"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <p className="text-xs text-gray-500 mt-1">
                      Examples: studentName, graduationDate, degree, university, gpa
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold" style={{ color: '#090909' }}>Allowed Extensions</h4>
                        <p className="text-xs text-gray-500">
                          Enable if credentials based on this schema may include file attachments with specific extensions.
                        </p>
                      </div>
                      <label className="inline-flex items-center cursor-pointer">
                        <span className="mr-2 text-sm text-gray-700">Enable</span>
                        <input
                          type="checkbox"
                          className="form-checkbox h-5 w-5 text-blue-600"
                          checked={formData.extensions_allowed}
                          onChange={(e) => setFormData(prev => ({ ...prev, extensions_allowed: e.target.checked }))}
                        />
                      </label>
                    </div>

                    {formData.extensions_allowed && (
                      <div className="mt-3 space-y-2">
                        {formData.allowed_extensions.map((ext, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={ext}
                              onChange={(e) => updateAllowedExtension(index, e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g. pdf"
                            />
                            {formData.allowed_extensions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeAllowedExtension(index)}
                                className="p-2 text-red-600 hover:text-red-800"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addAllowedExtension}
                          className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <PlusIcon className="w-3 h-3 mr-1" />
                          Add extension
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold" style={{ color: '#090909' }}>Allowed Evidence Labels</h4>
                        <p className="text-xs text-gray-500">
                          Enable if this schema requires supporting evidence files (e.g. diploma scan, identity document).
                        </p>
                      </div>
                      <label className="inline-flex items-center cursor-pointer">
                        <span className="mr-2 text-sm text-gray-700">Enable</span>
                        <input
                          type="checkbox"
                          className="form-checkbox h-5 w-5 text-blue-600"
                          checked={formData.evidence_allowed}
                          onChange={(e) => setFormData(prev => ({ ...prev, evidence_allowed: e.target.checked }))}
                        />
                      </label>
                    </div>

                    {formData.evidence_allowed && (
                      <div className="mt-3 space-y-2">
                        {formData.allowed_evidence.map((ev, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={ev}
                              onChange={(e) => updateAllowedEvidence(index, e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g. diploma_scan"
                            />
                            {formData.allowed_evidence.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeAllowedEvidence(index)}
                                className="p-2 text-red-600 hover:text-red-800"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addAllowedEvidence}
                          className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-purple-50 text-purple-700 hover:bg-purple-100"
                        >
                          <PlusIcon className="w-3 h-3 mr-1" />
                          Add evidence label
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-between pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !formData.name}
                    style={{ background: '#0005FF', color: 'white' }}
                    className="px-4 py-2 text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Saving...' : (isEditing ? 'Update Schema' : 'Create Schema')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchemaModal;
