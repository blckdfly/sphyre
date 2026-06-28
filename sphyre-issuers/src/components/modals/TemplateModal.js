import React, { useState, useEffect } from 'react';
import { XIcon, PlusIcon, TrashIcon, EyeIcon, PencilIcon, CheckCircleIcon } from '@heroicons/react/outline';
import { issuerApi } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

const TemplateModal = ({ isOpen, onClose, onSuccess }) => {
  const toast = useToast();
  const [view, setView] = useState('list');
  const [templates, setTemplates] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    schemaId: '',
    fields: [],
    evidence_required: [],
    extensions: [],
    evidence_allowed: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const issuerDid = localStorage.getItem('issuerDID') || '';
  const token = localStorage.getItem('token') || '';

  const ensureHolderFileFieldSource = (fields = []) =>
    (fields || []).map((field) => {
      if (!field) return field;
      const fieldType = field.field_type || field.type;
      if (fieldType === 'file') {
        return {
          ...field,
          source: 'holder_input',
        };
      }
      return field;
    });

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      loadSchemas();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await issuerApi.listTemplates(token, issuerDid);
      const templateList = response.data || response.templates || response || [];
      setTemplates(Array.isArray(templateList) ? templateList : []);
    } catch (err) {
      console.error('Load templates error:', err);
      toast.error('Failed to load templates');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSchemas = async () => {
    try {
      const response = await issuerApi.listSchemas(token, issuerDid);
      const schemaList = response.data || response.schemas || response || [];
      setSchemas(Array.isArray(schemaList) ? schemaList : []);
    } catch (err) {
      console.error('Load schemas error:', err);
      setSchemas([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.schemaId) {
      setError('Name and schema are required');
      return;
    }

    const normalizedEvidence = (formData.evidence_required || [])
      .map((label) => label.trim())
      .filter((label) => label.length > 0);

    if (formData.evidence_allowed && normalizedEvidence.length === 0) {
      setError('Please specify at least one evidence label when evidence is required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const normalizedFields = ensureHolderFileFieldSource(formData.fields || []);

      const templateData = {
        name: formData.name,
        description: formData.description,
        schema_id: formData.schemaId,
        fields: normalizedFields,
        evidence_required: normalizedEvidence,
        evidence_allowed: formData.evidence_allowed || false,
        extensions: formData.extensions || [],
      };

      console.log('Submitting template data:', JSON.stringify(templateData, null, 2));
      console.log('Token exists:', !!token);
      console.log('Issuer DID:', issuerDid);

      let result;
      if (isEditing && selectedTemplate) {
        console.log('Updating template:', selectedTemplate.id);
        result = await issuerApi.updateTemplate(token, issuerDid, selectedTemplate.id, templateData);
        toast.success('Template updated successfully!');
      } else {
        console.log('Creating new template');
        result = await issuerApi.createTemplate(token, issuerDid, templateData);
        console.log('Template created successfully:', result);
        toast.success('Template created successfully!');
      }

      await loadTemplates();
      setView('list');
      resetForm();
      onSuccess?.(result);
    } catch (err) {
      const errorMessage = err.message || 'Unknown error occurred';
      setError('Failed to save template: ' + errorMessage);
      toast.error('Failed to save template: ' + errorMessage);
      console.error('Save error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await issuerApi.deleteTemplate(token, issuerDid, templateId);
      toast.success('Template deleted successfully');
      await loadTemplates();
      if (view === 'detail' && selectedTemplate?.id === templateId) {
        setView('list');
      }
    } catch (err) {
      toast.error('Failed to delete template: ' + err.message);
      console.error('Delete error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSchemaSelect = (schemaId) => {
    const schema = schemas.find(s => s.id === schemaId);
    setSelectedSchema(schema);

    if (schema && schema.attributes) {
      const initialFields = schema.attributes
        .filter(attr => attr.required)
        .map(attr => {
          const attrName = typeof attr === 'string' ? attr : attr?.name || '';
          const dataType = typeof attr === 'object' ? attr?.data_type : 'string';
          return {
            name: attrName,
            field_type: mapDataTypeToFieldType(dataType),
            required: true,
            is_extension: false,
            placeholder: `Enter ${formatAttributeName(attrName)}`,
            help_text: typeof attr === 'object' ? attr?.description || '' : '',
            source: dataType === 'file' ? 'holder_input' : 'issuer_input'
          };
        });

      setFormData((prev) => ({
        ...prev,
        schemaId: schemaId,
        fields: ensureHolderFileFieldSource(initialFields),
        extensions: [],
        evidence_allowed: !!schema.evidence_allowed,
        evidence_required: [],
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        schemaId: schemaId,
        fields: [],
        extensions: [],
        evidence_allowed: false,
        evidence_required: [],
      }));
    }
  };

  const mapDataTypeToFieldType = (dataType) => {
    const mapping = {
      'string': 'text',
      'number': 'number',
      'date': 'date',
      'email': 'email',
      'url': 'url',
      'file': 'file',
      'boolean': 'checkbox'
    };
    return mapping[dataType] || 'text';
  };

  const formatAttributeName = (name) => {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      schemaId: template.schema_id || '',
      fields: ensureHolderFileFieldSource(template.fields || []),
      evidence_required: template.evidence_required || [],
      extensions: template.extensions || [],
      evidence_allowed: !!template.evidence_allowed,
    });
    const schema = schemas.find(s => s.id === template.schema_id);
    setSelectedSchema(schema);
    setIsEditing(true);
    setView('form');
  };

  const handleViewDetail = (template) => {
    setSelectedTemplate(template);
    const schema = schemas.find(s => s.id === template.schemaId);
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
      description: '',
      schemaId: '',
      fields: [],
      evidence_required: [],
      extensions: [],
      evidence_allowed: false,
    });
    setSelectedTemplate(null);
    setSelectedSchema(null);
    setIsEditing(false);
    setError('');
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
                {view === 'list' ? 'Template Management' : view === 'detail' ? 'Template Details' : isEditing ? 'Edit Template' : 'Create New Template'}
              </h3>
              <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <XIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white px-6 py-6" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            {view === 'list' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <p className="text-gray-600">Manage your credential templates</p>
                  <button
                    onClick={handleCreateNew}
                    style={{ background: '#0005FF', color: 'white' }}
                    className="inline-flex items-center px-4 py-2 rounded-md font-semibold hover:opacity-90 transition-opacity"
                  >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Create New Template
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading templates...</p>
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No templates</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new template.</p>
                    <div className="mt-6">
                      <button
                        onClick={handleCreateNew}
                        style={{ background: '#0005FF', color: 'white' }}
                        className="inline-flex items-center px-4 py-2 rounded-md font-semibold"
                      >
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Create Template
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {templates.map((template) => {
                      const schema = schemas.find(s => s.id === template.schemaId);
                      return (
                        <div
                          key={template.id}
                          className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h4 className="text-lg font-semibold" style={{ color: '#090909' }}>
                                {template.name}
                              </h4>
                              {schema && (
                                <p className="text-sm text-gray-500">
                                  Schema: {schema.name} v{schema.version}
                                </p>
                              )}
                              {Array.isArray(template.extensions) && template.extensions.length > 0 && (
                                <p className="text-xs text-indigo-600 mt-1">
                                  Extensions: {template.extensions.join(', ')}
                                </p>
                              )}
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleViewDetail(template)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                                title="View Details"
                              >
                                <EyeIcon className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleEdit(template)}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                                title="Edit"
                              >
                                <PencilIcon className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleDelete(template.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded"
                                title="Delete"
                              >
                                <TrashIcon className="w-5 h-5" />
                              </button>
                            </div>
                          </div>

                          {template.description && (
                            <p className="text-sm text-gray-600">{template.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {view === 'detail' && selectedTemplate && (
              <div>
                <div className="mb-6">
                  <button
                    onClick={() => setView('list')}
                    className="text-blue-600 hover:text-blue-800 flex items-center text-sm mb-4"
                  >
                    Back to list
                  </button>

                  <div className="bg-gray-50 rounded-lg p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-bold" style={{ color: '#090909' }}>
                          {selectedTemplate.name}
                        </h3>
                        {selectedSchema && (
                          <p className="text-sm text-gray-500 mt-1">
                            Based on: {selectedSchema.name} v{selectedSchema.version}
                          </p>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(selectedTemplate)}
                          style={{ background: '#0005FF', color: 'white' }}
                          className="inline-flex items-center px-3 py-2 rounded-md text-sm font-semibold"
                        >
                          <PencilIcon className="w-4 h-4 mr-2" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(selectedTemplate.id)}
                          className="inline-flex items-center px-3 py-2 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-700"
                        >
                          <TrashIcon className="w-4 h-4 mr-2" />
                          Delete
                        </button>
                      </div>
                    </div>

                    {selectedTemplate.description && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Description</h4>
                        <p className="text-gray-600">{selectedTemplate.description}</p>
                      </div>
                    )}

                    {Array.isArray(selectedTemplate.extensions) && selectedTemplate.extensions.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Extensions Enabled</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedTemplate.extensions.map((ext) => (
                            <span
                              key={ext}
                              className="inline-block bg-indigo-100 text-indigo-700 text-xs px-3 py-1 rounded-full font-medium"
                            >
                              {ext}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSchema && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">
                          Schema Attributes ({selectedSchema.attributes?.length || 0})
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {selectedSchema.attributes?.map((attr, idx) => {
                            const attrName = typeof attr === 'string' ? attr : attr?.name || 'Unknown';
                            return (
                              <div
                                key={idx}
                                className="bg-white border border-gray-200 rounded-lg p-3 flex items-center"
                              >
                                <CheckCircleIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" />
                                <span className="text-sm font-medium text-gray-900">{attrName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedTemplate.evidence_required && selectedTemplate.evidence_required.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Evidence Required</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedTemplate.evidence_required.map((ev, idx) => (
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

                    {selectedTemplate.created_at && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <p className="text-xs text-gray-500">
                          Created: {new Date(selectedTemplate.created_at).toLocaleString()}
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
                      Template Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., University Degree Template"
                      required
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
                      placeholder="Describe what this template is for..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#090909' }}>
                      Schema *
                    </label>
                    <select
                      value={formData.schemaId}
                      onChange={(e) => handleSchemaSelect(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select a schema</option>
                      {schemas.map(schema => (
                        <option key={schema.id} value={schema.id}>
                          {schema.name} (v{schema.version})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSchema && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Schema Attributes:</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedSchema.attributes?.map((attr, idx) => {
                          const attrName = typeof attr === 'string' ? attr : attr?.name || 'Unknown';
                          const attrKey = typeof attr === 'string' ? attr : attr?.name || `attr-${idx}`;
                          return (
                            <span key={attrKey} className="inline-block bg-white text-gray-700 text-xs px-2 py-1 rounded border border-gray-200">
                              {attrName}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedSchema?.extensions_allowed && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-purple-700">
                          Optional Extensions{selectedSchema.allowed_extensions?.length ? ` (${selectedSchema.allowed_extensions.length} available)` : ''}
                        </h5>
                      </div>

                      {selectedSchema.allowed_extensions?.length ? (
                        <div className="space-y-2">
                          {selectedSchema.allowed_extensions.map((ext) => {
                            const isChecked = formData.extensions?.includes(ext);
                            return (
                              <label
                                key={ext}
                                className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 border ${isChecked ? 'border-purple-400 bg-white text-purple-700' : 'border-purple-200 text-purple-600'
                                  } cursor-pointer transition-colors`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setFormData((prev) => {
                                      const exists = prev.extensions?.includes(ext);
                                      const updatedExtensions = exists
                                        ? prev.extensions.filter((item) => item !== ext)
                                        : [...(prev.extensions || []), ext];

                                      // Find extension details from schema's optional_attributes 
                                      const optionalAttr = selectedSchema?.attributes?.find(
                                        (attr) => (typeof attr === 'object' ? attr?.name : attr) === ext && !attr?.required
                                      );
                                      const dataType = typeof optionalAttr === 'object' ? optionalAttr?.data_type : 'string';
                                      const fieldType = mapDataTypeToFieldType(dataType);
                                      const isFileType = fieldType === 'file';

                                      const updatedFields = exists
                                        ? prev.fields.filter((field) => field.name !== ext)
                                        : [
                                          ...prev.fields,
                                          {
                                            name: ext,
                                            field_type: fieldType,
                                            required: false,
                                            is_extension: true,
                                            placeholder: isFileType ? `Upload ${ext}` : `Enter ${formatAttributeName(ext)}`,
                                            help_text: typeof optionalAttr === 'object' ? optionalAttr?.description || '' : '',
                                            source: isFileType ? 'holder_input' : 'issuer_input',
                                          },
                                        ];

                                      return {
                                        ...prev,
                                        extensions: updatedExtensions,
                                        fields: ensureHolderFileFieldSource(updatedFields),
                                      };
                                    });
                                  }}
                                  className="text-purple-600 focus:ring-purple-500 rounded"
                                  disabled={loading}
                                />
                                <span className="truncate">{ext}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-purple-600">
                          This schema allows extensions, but none are configured yet. Add them in schema settings first.
                        </p>
                      )}
                    </div>
                  )}

                  {selectedSchema?.evidence_allowed && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-purple-700">
                          Evidence Requirements
                        </h5>
                      </div>
                      <div className="space-y-2">
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.evidence_allowed}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFormData((prev) => ({
                                ...prev,
                                evidence_allowed: checked,
                                evidence_required: checked
                                  ? (prev.evidence_required && prev.evidence_required.length > 0
                                    ? prev.evidence_required
                                    : (selectedSchema?.allowed_evidence && selectedSchema.allowed_evidence.length > 0
                                      ? selectedSchema.allowed_evidence.slice(0, 1)
                                      : ['Evidence']))
                                  : [],
                              }));
                            }}
                            className="text-purple-600 focus:ring-purple-500 rounded"
                            disabled={loading}
                          />
                          <span>Require supporting evidence from holder</span>
                        </label>
                        {formData.evidence_allowed && (
                          <div className="space-y-2">
                            <p className="text-xs text-purple-600">
                              List the evidence labels holders must upload (comma separated).
                            </p>
                            <input
                              type="text"
                              value={formData.evidence_required.join(', ')}
                              onChange={(e) => {
                                const labels = e.target.value
                                  .split(',')
                                  .map((label) => label.trim())
                                  .filter(Boolean);
                                setFormData((prev) => ({
                                  ...prev,
                                  evidence_required: labels,
                                }));
                              }}
                              className="w-full px-3 py-2 border border-purple-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                              placeholder="e.g., Passport Scan, Proof of Enrollment"
                              disabled={loading}
                            />
                            {selectedSchema.allowed_evidence?.length > 0 && (
                              <p className="text-[11px] text-purple-500">
                                Schema allowed evidence: {selectedSchema.allowed_evidence.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {formData.fields && formData.fields.length > 0 && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">
                        Fields Configuration ({formData.fields.length} field{formData.fields.length !== 1 ? 's' : ''})
                      </h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {formData.fields.map((field, idx) => {
                          const fieldType = field.field_type || field.type;
                          const isFileField = fieldType === 'file';
                          return (
                            <div key={idx} className="bg-white rounded p-2 flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-700">{field.name}</span>
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                              </div>
                              {isFileField ? (
                                <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded">
                                  Holder uploads file evidence
                                </span>
                              ) : (
                                <select
                                  value={field.source || 'issuer_input'}
                                  onChange={(e) => {
                                    setFormData((prev) => {
                                      const updatedFields = [...prev.fields];
                                      updatedFields[idx] = { ...field, source: e.target.value };
                                      return {
                                        ...prev,
                                        fields: updatedFields,
                                      };
                                    });
                                  }}
                                  className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="issuer_input">Issuer fills</option>
                                  <option value="holder_input">Holder fills</option>
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {schemas.length === 0 && (
                    <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
                      No schemas found. Please create a schema first before creating templates.
                    </div>
                  )}
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
                    disabled={loading || !formData.name || !formData.schemaId}
                    style={{ background: '#0005FF', color: 'white' }}
                    className="px-4 py-2 text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Saving...' : (isEditing ? 'Update Template' : 'Create Template')}
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

export default TemplateModal;
