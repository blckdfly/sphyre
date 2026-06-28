'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    ChevronLeft,
    Building,
    AlertCircle,
    Loader,
    Search,
    Filter,
    Upload,
    FileText,
    Link as LinkIcon,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import walletService from '@/services/walletService';
import apiService from '@/services/apiService';
import { DynamicField } from '@/components/DynamicField';
import type { EvidenceAttachment } from '@/services/apiService';

interface TemplateField {
    name: string;
    label?: string;
    field_type: string;
    type?: string;
    source?: 'holder_input' | 'issuer_input' | 'system_generated' | 'derived';
    required: boolean;
    placeholder?: string;
    help_text?: string;
    default_value?: string;
}

interface Template {
    id: string;
    name: string;
    description?: string;
    schema_id: string;
    issuer_did: string;
    issuerName?: string;
    issuerDomain?: string;
    issuerLogoUrl?: string;
    issuerWebsite?: string;
    issuerDescription?: string;
    fields: TemplateField[];
    evidence_required?: string[];
    allowed_evidence?: string[];
    evidence_allowed?: boolean;
}

function isWrappedResponse(obj: unknown): obj is { success: boolean; data?: unknown; error?: string } {
    return typeof obj === 'object' && obj !== null && 'success' in obj;
}

function isTemplatesArray(obj: unknown): obj is Template[] {
    return Array.isArray(obj);
}

function hasTemplatesField(obj: unknown): obj is { templates: Template[] } {
    if (typeof obj !== 'object' || obj === null) return false;
    const t = (obj as { templates?: unknown }).templates;
    return Array.isArray(t);
}

export default function RequestCredentialPage() {
    const router = useRouter();
    const { addToast } = useToast();

    const [step, setStep] = useState<'browse' | 'form' | 'review'>('browse');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [formData, setFormData] = useState<{ [key: string]: unknown }>({});
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [evidenceAttachments, setEvidenceAttachments] = useState<EvidenceAttachment[]>([]);
    const [evidenceUploading, setEvidenceUploading] = useState<string | null>(null);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredTemplates(templates);
            return;
        }

        const query = searchQuery.toLowerCase();
        const filtered = templates.filter(t =>
            t.name.toLowerCase().includes(query) ||
            t.description?.toLowerCase().includes(query) ||
            t.issuerName?.toLowerCase().includes(query)
        );
        setFilteredTemplates(filtered);
    }, [searchQuery, templates]);

    const loadTemplates = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            console.log('Loading all templates...');
            console.log('API URL:', process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech');

            const response = await apiService.getAllTemplates();
            console.log('API Response:', response);
            const payload: unknown = isWrappedResponse(response) ? response.data : response;
            console.log('Payload:', payload);
            console.log('Payload type:', Array.isArray(payload) ? 'array' : typeof payload);

            let templateList: Template[] | null = null;

            if (isTemplatesArray(payload)) {
                templateList = payload;
                console.log('Payload is direct array');
            }
            else if (hasTemplatesField(payload)) {
                templateList = payload.templates;
                console.log('Payload has templates field');
            }
            else if (hasTemplatesField(response)) {
                templateList = response.templates;
                console.log('Wrapper has templates field');
            }
            else if (isWrappedResponse(payload) && payload.success === false) {
                throw new Error(payload.error || 'Backend returned error');
            }

            if (templateList === null) {
                console.error('Could not extract templates from response:', response);
                throw new Error('Invalid response format from backend');
            }

            if (templateList.length === 0) {
                setError('No templates available yet. Issuers need to create templates first.');
                setTemplates([]);
                setFilteredTemplates([]);
            } else {
                setTemplates(templateList);
                setFilteredTemplates(templateList);
            }
        } catch (err) {
            console.error('Failed to load templates:', err);
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error('Error message:', errorMsg);
            setError(`Failed to load templates: ${errorMsg}`);
            setTemplates([]);
            setFilteredTemplates([]);
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);

    const handleTemplateSelect = (template: Template) => {
        console.log('Selected template:', template);

        setSelectedTemplate(template);

        const holderFields = template.fields?.filter(f =>
            !f.source || f.source === 'holder_input'
        ) || template.fields || [];

        console.log(`Holder fields: ${holderFields.length} (total: ${template.fields?.length || 0})`);

        // Initialize form data
        const initialData: { [key: string]: unknown } = {};
        holderFields.forEach(field => {
            initialData[field.name] = field.default_value || '';
        });

        setFormData(initialData);
        setEvidenceAttachments([]);
        setStep('form');
    };

    const handleFieldChange = (fieldName: string, value: unknown) => {
        setFormData(prev => ({
            ...prev,
            [fieldName]: value
        }));
    };

    const handleSubmitRequest = async () => {
        if (!selectedTemplate) {
            addToast('No template selected', 'error');
            return;
        }

        try {
            setLoading(true);

            // Get user DID
            const userDID = walletService.getCurrentDID();

            if (!userDID) {
                addToast('Please set up your wallet first', 'error');
                router.push('/onboarding');
                return;
            }

            // Validate required holder fields
            const holderFields = selectedTemplate.fields?.filter(f =>
                !f.source || f.source === 'holder_input'
            ) || selectedTemplate.fields || [];

            const isEmptyValue = (value: unknown) => {
                if (value === undefined || value === null) return true;
                if (typeof value === 'string') return value.trim() === '';
                if (typeof value === 'number') return Number.isNaN(value);
                return false;
            };

            const missingFields = holderFields
                .filter(f => f.required && isEmptyValue(formData[f.name]))
                .map(f => f.label || f.name);

            if (missingFields.length > 0) {
                addToast(`Please fill in: ${missingFields.join(', ')}`, 'error');
                return;
            }

            const requiredEvidence = selectedTemplate.evidence_required || [];
            const missingEvidence = requiredEvidence.filter((label) =>
                !evidenceAttachments.some((att) => att.label?.toLowerCase() === label.toLowerCase())
            );

            if (missingEvidence.length > 0) {
                addToast(`Please upload evidence for: ${missingEvidence.join(', ')}`, 'error');
                return;
            }

            const requestData: Record<string, string> = {};
            for (const field of holderFields) {
                const rawValue = formData[field.name];
                if (rawValue === undefined || rawValue === null) {
                    requestData[field.name] = '';
                    continue;
                }

                if (typeof rawValue === 'string') {
                    requestData[field.name] = rawValue;
                    continue;
                }

                if (typeof rawValue === 'number') {
                    requestData[field.name] = Number.isNaN(rawValue) ? '' : String(rawValue);
                    continue;
                }

                if (typeof rawValue === 'boolean') {
                    requestData[field.name] = String(rawValue);
                    continue;
                }

                if (rawValue instanceof Date) {
                    requestData[field.name] = rawValue.toISOString();
                    continue;
                }

                try {
                    if (typeof rawValue === 'object') {
                        requestData[field.name] = JSON.stringify(rawValue);
                    } else {
                        requestData[field.name] = String(rawValue);
                    }
                } catch {
                    requestData[field.name] = String(rawValue);
                }
            }

            const requestPayload = {
                user_did: userDID,
                issuer_did: selectedTemplate.issuer_did,
                template_id: selectedTemplate.id,
                schema_id: selectedTemplate.schema_id,
                credential_type: selectedTemplate.name,
                request_data: requestData,
                timestamp: new Date().toISOString(),
                evidence: evidenceAttachments.map((att) => ({
                    label: att.label,
                    filename: att.filename,
                    ipfs_hash: att.ipfs_hash,
                    gateway_url: att.gateway_url,
                    content_type: att.content_type,
                    size: att.size,
                })),
                evidence_required: selectedTemplate.evidence_required || [],
            };

            console.log('Submitting request:', requestPayload);

            // Submit credential REQUEST to backend
            const response = await apiService.submitCredentialRequest(requestPayload);

            console.log('API response:', response);

            if (response.success) {
                addToast('Credential request submitted and Issuer will review your request', 'success');

                // Redirect to activity after delay
                setTimeout(() => {
                    router.push('/SSIWalletActivity');
                }, 2000);
            } else {
                throw new Error(response.error || 'Failed to submit request');
            }
        } catch (err) {
            console.error('Submit error:', err);
            const errorMsg = err instanceof Error ? err.message : 'Failed to submit request';
            addToast(errorMsg, 'error');
        } finally {
            setLoading(false);
        }
    };

    const formatFileSize = (size?: number) => {
        if (!size) return '';
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleEvidenceUpload = async (file: File, label?: string) => {
        const userDID = walletService.getCurrentDID();
        if (!userDID) {
            addToast('Wallet DID not found. Please set up your wallet first.', 'error');
            return;
        }

        try {
            setEvidenceUploading(file.name);

            const response = await apiService.uploadEvidence(userDID, file, label?.trim() || undefined);
            if (!response.success || !response.data?.evidence) {
                throw new Error(response.error || 'Failed to upload evidence');
            }

            const attachment = response.data.evidence;
            setEvidenceAttachments((prev) => {
                const filtered = prev.filter((att) => att.label?.toLowerCase() !== attachment.label.toLowerCase());
                return [...filtered, attachment];
            });
        } catch (err) {
            console.error('Evidence upload failed:', err);
            const msg = err instanceof Error ? err.message : 'Failed to upload evidence';
            addToast(msg, 'error');
        } finally {
            setEvidenceUploading(null);
        }
    };

    const handleEvidenceInputChange = async (event: React.ChangeEvent<HTMLInputElement>, label?: string) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        await handleEvidenceUpload(file, label);
        event.target.value = '';
    };

    const handleRemoveEvidence = (label: string) => {
        setEvidenceAttachments((prev) => prev.filter((att) => att.label !== label));
    };

    const getHolderFields = () => {
        if (!selectedTemplate) return [];
        return selectedTemplate.fields?.filter(f =>
            !f.source || f.source === 'holder_input'
        ) || selectedTemplate.fields || [];
    };

    const getIssuerFields = () => {
        if (!selectedTemplate) return [];
        return selectedTemplate.fields?.filter(f =>
            f.source === 'issuer_input'
        ) || [];
    };

    // Render: Browse Templates
    const renderBrowse = () => (
        <div className="space-y-4">
            <div className="flex items-start gap-3 mb-6">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-lg hover:bg-light-200 transition-colors"
                    aria-label="Back"
                >
                    <ChevronLeft size={24} className="text-dark-400" />
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-dark-500">Browse Credentials</h2>
                    <p className="text-sm text-dark-300 mt-1">
                        Select a credential template from available issuers
                    </p>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-300" size={20} />
                <input
                    type="text"
                    placeholder="Search credentials or issuers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-dark-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-12">
                    <Loader className="animate-spin text-primary-500 mb-4" size={40} />
                    <p className="text-dark-400">Loading templates...</p>
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="bg-red-50 border-l-4 border-red-400 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                        <AlertCircle className="text-red-600 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm text-red-800 font-medium">Error Loading Templates</p>
                            <p className="text-xs text-red-700 mt-1">{error}</p>
                            <button
                                onClick={loadTemplates}
                                className="mt-2 text-xs text-red-800 underline hover:no-underline"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Templates List */}
            {!loading && !error && filteredTemplates.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm text-dark-400">
                        {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
                    </p>
                    {filteredTemplates.map((template) => {
                        const holderFieldCount = template.fields?.filter(f => !f.source || f.source === 'holder_input').length || 0;
                        const issuerFieldCount = template.fields?.filter(f => f.source === 'issuer_input').length || 0;

                        return (
                            <div
                                key={template.id}
                                onClick={() => handleTemplateSelect(template)}
                                className="bg-white border border-dark-100 rounded-xl p-4 hover:border-primary-500 hover:shadow-lg transition-all cursor-pointer"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-dark-500">{template.name}</h3>
                                        {template.description && (
                                            <p className="text-sm text-dark-300 mt-1">{template.description}</p>
                                        )}

                                        {/* Issuer Info */}
                                        <div className="flex items-center mt-3 space-x-2">
                                            <Building size={16} className="text-dark-300" />
                                            <span className="text-xs text-dark-400">
                                                by {template.issuerName || 'Unknown Issuer'}
                                            </span>
                                            {template.issuerDomain && (
                                                <span className="text-xs text-dark-300">
                                                    • {template.issuerDomain}
                                                </span>
                                            )}
                                        </div>

                                        {/* Field Counts */}
                                        <div className="flex items-center mt-2 space-x-2">
                                            {holderFieldCount > 0 && (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                                    {holderFieldCount} field{holderFieldCount !== 1 ? 's' : ''} (you fill)
                                                </span>
                                            )}
                                            {issuerFieldCount > 0 && (
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                                    {issuerFieldCount} field{issuerFieldCount !== 1 ? 's' : ''} (issuer provides)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && filteredTemplates.length === 0 && templates.length > 0 && (
                <div className="text-center py-12">
                    <Filter className="mx-auto text-dark-200 mb-4" size={48} />
                    <p className="text-dark-400">No templates match your search</p>
                    <button
                        onClick={() => setSearchQuery('')}
                        className="mt-2 text-sm text-primary-500 underline hover:no-underline"
                    >
                        Clear search
                    </button>
                </div>
            )}
        </div>
    );

    // Render: Fill Form
    const renderForm = () => {
        const holderFields = getHolderFields();
        const issuerFields = getIssuerFields();
        const requiredEvidence = selectedTemplate?.evidence_required || [];
        const allowedEvidence = selectedTemplate?.allowed_evidence || [];
        const evidenceSectionVisible = requiredEvidence.length > 0 || allowedEvidence.length > 0 || evidenceAttachments.length > 0;

        return (
            <div className="space-y-6">
                <div className="flex items-start gap-3 mb-6">
                    <button
                        onClick={() => setStep('browse')}
                        className="p-2 rounded-lg hover:bg-light-200 transition-colors"
                        aria-label="Back to browse"
                    >
                        <ChevronLeft size={24} className="text-dark-400" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-dark-500">Fill Your Information</h2>
                        <p className="text-sm text-dark-300 mt-1">
                            Template: {selectedTemplate?.name}
                        </p>
                    </div>
                </div>

                {/* Issuer Info */}
                <div className="bg-light-50 rounded-xl p-4 border border-dark-100">
                    <div className="flex items-center space-x-3">
                        <div>
                            <p className="font-medium text-dark-500">{selectedTemplate?.issuerName || 'Unknown Issuer'}</p>
                            {selectedTemplate?.issuerDomain && (
                                <p className="text-xs text-dark-400">{selectedTemplate.issuerDomain}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info Banner */}
                <div className="bg-green-50 border-l-4 border-green-400 rounded-lg p-3">
                    <div className="flex items-start space-x-2">
                        <div>
                            <p className="text-sm text-green-800 font-medium">
                                You fill: {holderFields.length} field{holderFields.length !== 1 ? 's' : ''}
                            </p>
                            {issuerFields.length > 0 && (
                                <p className="text-xs text-green-700 mt-1">
                                    Issuer will provide: {issuerFields.map(f => f.label || f.name).join(', ')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {holderFields.length === 0 ? (
                        <div className="text-center py-8 bg-light-50 rounded-xl">
                            <p className="text-dark-400">No fields for you to fill. Issuer will provide all data.</p>
                        </div>
                    ) : (
                        holderFields.map((field) => (
                            <DynamicField
                                key={field.name}
                                field={{
                                    ...field,
                                    source: field.source || 'holder_input' as const,
                                    field_type: field.field_type || field.type || 'text'
                                }}
                                value={formData[field.name]}
                                onChange={(value) => handleFieldChange(field.name, value)}
                                disabled={loading}
                            />
                        ))
                    )}
                </div>

                {evidenceSectionVisible && (
                    <div className="bg-white border border-dark-100 rounded-xl p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <FileText className="text-primary-500" size={18} />
                            <h3 className="text-sm font-semibold text-dark-500">Supporting Evidence</h3>
                        </div>

                        {requiredEvidence.length > 0 && (
                            <div className="border border-light-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs text-dark-300">
                                    Upload the evidence files listed below before submitting this request.
                                </p>
                                <ul className="space-y-2">
                                    {requiredEvidence.map((label) => {
                                        const inputId = `request-evidence-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
                                        const provided = evidenceAttachments.some(
                                            (att) => att.label?.toLowerCase() === label.toLowerCase()
                                        );
                                        return (
                                            <li
                                                key={label}
                                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-light-100 rounded-lg px-3 py-2"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium text-dark-500">{label}</p>
                                                    <p className="text-xs text-dark-300">
                                                        {provided ? 'Evidence uploaded' : 'Awaiting upload'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <label
                                                        htmlFor={inputId}
                                                        className={`inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-full border transition ${provided
                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                            : 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
                                                            }`}
                                                    >
                                                        <Upload className="w-4 h-4" />
                                                        {provided ? 'Replace' : 'Upload'}
                                                    </label>
                                                    {provided && (
                                                        <button
                                                            type="button"
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                                                            onClick={() => handleRemoveEvidence(label)}
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                    <input
                                                        id={inputId}
                                                        type="file"
                                                        className="hidden"
                                                        onChange={(event) => handleEvidenceInputChange(event, label)}
                                                        disabled={Boolean(evidenceUploading)}
                                                    />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {allowedEvidence.length > 0 && (
                            <div className="border border-light-200 rounded-lg p-3">
                                <p className="text-xs text-dark-300">
                                    Allowed evidence labels: {allowedEvidence.join(', ')}
                                </p>
                            </div>
                        )}

                        {evidenceAttachments.length > 0 && (
                            <div className="border border-light-200 rounded-lg p-3 space-y-2">
                                <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wide">Uploaded evidence</h4>
                                <div className="space-y-2">
                                    {evidenceAttachments.map((attachment) => (
                                        <div
                                            key={`${attachment.label}-${attachment.ipfs_hash}`}
                                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-light-50 border border-light-200 rounded-lg px-3 py-2"
                                        >
                                            <div className="flex items-start gap-2">
                                                <FileText className="w-4 h-4 text-primary-500 mt-1" />
                                                <div>
                                                    <p className="text-sm font-medium text-dark-500">{attachment.label}</p>
                                                    <p className="text-xs text-dark-300">
                                                        {attachment.filename || 'Unnamed file'}
                                                        {attachment.size && (
                                                            <span className="ml-1 text-dark-200">· {formatFileSize(attachment.size)}</span>
                                                        )}
                                                    </p>
                                                    {attachment.content_type && (
                                                        <p className="text-xs text-dark-200">{attachment.content_type}</p>
                                                    )}
                                                    {attachment.ipfs_hash && (
                                                        <p className="text-[11px] text-dark-300 break-all mt-1">
                                                            Hash: {attachment.ipfs_hash}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {attachment.gateway_url && (
                                                    <a
                                                        href={attachment.gateway_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100"
                                                    >
                                                        <LinkIcon className="w-3.5 h-3.5" />
                                                        Open
                                                    </a>
                                                )}
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                                                    onClick={() => handleRemoveEvidence(attachment.label || '')}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex space-x-3">
                    <button
                        onClick={() => setStep('browse')}
                        disabled={loading}
                        className="flex-1 px-4 py-3 border border-dark-200 text-dark-500 rounded-xl hover:bg-light-50 transition-colors disabled:opacity-50"
                    >
                        Back
                    </button>
                    <button
                        onClick={() => setStep('review')}
                        disabled={loading}
                        className="flex-1 px-4 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50"
                    >
                        Review
                    </button>
                </div>
            </div>
        );
    };

    // Render: Review
    const renderReview = () => {
        const holderFields = getHolderFields();
        const issuerFields = getIssuerFields();
        const requiredEvidence = selectedTemplate?.evidence_required || [];

        return (
            <div className="space-y-6">
                <div className="flex items-start gap-3 mb-6">
                    <button
                        onClick={() => setStep('form')}
                        className="p-2 rounded-lg hover:bg-light-200 transition-colors"
                        aria-label="Back to form"
                    >
                        <ChevronLeft size={24} className="text-dark-400" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-dark-500">Review Request</h2>
                        <p className="text-sm text-dark-300 mt-1">
                            Check your information before submitting
                        </p>
                    </div>
                </div>

                {/* Template Info */}
                <div className="bg-white border border-dark-100 rounded-xl p-4">
                    <h3 className="font-medium text-dark-500 mb-3">Credential Request</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-dark-400">Template:</span>
                            <span className="text-dark-500 font-medium">{selectedTemplate?.name}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-dark-400">Issuer:</span>
                            <span className="text-dark-500 font-medium">{selectedTemplate?.issuerName}</span>
                        </div>
                    </div>
                </div>

                {/* Your Data */}
                <div className="bg-white border border-dark-100 rounded-xl p-4">
                    <h3 className="font-medium text-dark-500 mb-3">Your Information</h3>
                    <div className="space-y-2">
                        {holderFields.map(field => (
                            <div key={field.name} className="flex justify-between text-sm">
                                <span className="text-dark-400">{field.label || field.name}:</span>
                                <span className="text-dark-500 font-medium">
                                    {formData[field.name]?.toString() || '(empty)'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Issuer Will Provide */}
                {issuerFields.length > 0 && (
                    <div className="bg-green-50 border-l-4 border-green-400 rounded-lg p-4">
                        <p className="text-sm text-green-800 font-medium mb-2">Issuer will provide:</p>
                        <ul className="text-xs text-green-700 space-y-1 ml-4">
                            {issuerFields.map(f => (
                                <li key={f.name}>• {f.label || f.name}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {(requiredEvidence.length > 0 || evidenceAttachments.length > 0) && (
                    <div className="bg-white border border-dark-100 rounded-xl p-4 space-y-3">
                        <h3 className="font-medium text-dark-500">Supporting Evidence</h3>
                        {requiredEvidence.length > 0 && (
                            <p className="text-xs text-dark-300">
                                Required evidence: {requiredEvidence.join(', ')}
                            </p>
                        )}
                        {evidenceAttachments.length === 0 ? (
                            <p className="text-xs text-dark-300">No evidence uploaded yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {evidenceAttachments.map((attachment) => (
                                    <div
                                        key={`${attachment.label}-${attachment.ipfs_hash}`}
                                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-light-200 rounded-lg px-3 py-2"
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-dark-500">{attachment.label}</p>
                                            <p className="text-xs text-dark-300">
                                                {attachment.filename || 'Unnamed file'}
                                                {attachment.size && (
                                                    <span className="ml-1 text-dark-200">· {formatFileSize(attachment.size)}</span>
                                                )}
                                            </p>
                                            {attachment.content_type && (
                                                <p className="text-xs text-dark-200">{attachment.content_type}</p>
                                            )}
                                        </div>
                                        {attachment.gateway_url && (
                                            <a
                                                href={attachment.gateway_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100"
                                            >
                                                <LinkIcon className="w-3.5 h-3.5" />
                                                Open
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex space-x-3">
                    <button
                        onClick={() => setStep('form')}
                        disabled={loading}
                        className="flex-1 px-4 py-3 border border-dark-200 text-dark-500 rounded-xl hover:bg-light-50 transition-colors disabled:opacity-50"
                    >
                        Back
                    </button>
                    <button
                        onClick={handleSubmitRequest}
                        disabled={loading}
                        className="flex-1 px-4 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                        {loading ? (
                            <>
                                <Loader className="animate-spin" size={20} />
                                <span>Submitting...</span>
                            </>
                        ) : (
                            <>
                                <span>Submit</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-light-50 p-4">
            <div className="max-w-2xl mx-auto py-8">
                {step === 'browse' && renderBrowse()}
                {step === 'form' && renderForm()}
                {step === 'review' && renderReview()}
            </div>
        </div>
    );
}
