'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, CheckCircle, Loader2, Shield, AlertCircle, ChevronLeft, Upload, FileText, Link as LinkIcon, X } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import walletService from '@/services/walletService';
import apiService, { EvidenceAttachment } from '@/services/apiService';
import { DynamicField, FieldDef } from '@/components/DynamicField';
import PinModal from '@/components/ui/PinModal';
import { signMessageEd25519 } from '@/lib/crypto';

interface CredentialOffer {
    id?: string;
    offer_id?: string;
    credential_type?: string;
    schema_id?: string;
    template_id?: string;
    issuer_did?: string;
    issuerDID?: string;
    issuer_name?: string;
    issuer?: {
        name?: string;
        did?: string;
    };
    issuerName?: string;
    credential?: {
        type?: string;
        name?: string;
        attributes?: string[];
    };
    attributes?: string[];
    extensions?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preview?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    issuer_data?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    issuer_data_preview?: Record<string, any>;
    expires_at?: string;
    status?: string;
    evidence_required?: string[];
    allowed_evidence?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

interface Template {
    id: string;
    name: string;
    fields: FieldDef[];
    evidence_required?: string[];
    allowed_evidence?: string[];
    evidence_allowed?: boolean;
    extensions?: string[];
}

type Step = 'view' | 'challenge' | 'accept' | 'form' | 'submitting' | 'success';


export default function CollectCredentialsPage() {
    const router = useRouter();
    const { addToast } = useToast();

    // State
    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState<Step>('view');
    const [offer, setOffer] = useState<CredentialOffer | null>(null);
    const [template, setTemplate] = useState<Template | null>(null);
    const [userDID, setUserDID] = useState<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [evidenceAttachments, setEvidenceAttachments] = useState<EvidenceAttachment[]>([]);
    const [evidenceUploading, setEvidenceUploading] = useState<string | null>(null);
    const [customEvidenceLabel, setCustomEvidenceLabel] = useState<string>('');

    // Challenge/Accept state
    const [challengeData, setChallengeData] = useState<{ nonce: string; did_methods: string[]; expires_in: number } | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [verifyDid, setVerifyDid] = useState<string | null>(null);
    const [isPinOpen, setIsPinOpen] = useState(false);
    const pinResolveRef = useRef<((pin: string) => void) | null>(null);
    const pinRejectRef = useRef<((err: unknown) => void) | null>(null);

    const requestPin = (): Promise<string> => new Promise((resolve, reject) => {
        pinResolveRef.current = resolve;
        pinRejectRef.current = reject;
        setIsPinOpen(true);
    });
    const handlePinSubmit = async (pin: string) => {
        pinResolveRef.current?.(pin);
        setIsPinOpen(false);
    };
    const handlePinCancel = () => {
        pinRejectRef.current?.(new Error('PIN cancelled'));
        setIsPinOpen(false);
    };
    const signNonce = async (nonce: string): Promise<string> => {
        const seedPhrase = walletService.getSeedPhraseFromSession();
        if (seedPhrase) {
            const didKey = walletService.getDidKeyFromSession();
            if (didKey) setVerifyDid(didKey);
            return signMessageEd25519(nonce, seedPhrase);
        }
        if (walletService.isPersistentLoginEnabled()) {
            const pin = await requestPin();
            try {
                const didKey = walletService.deriveDidKeyFromPin(pin);
                setVerifyDid(didKey);
            } catch (e) {
                console.warn('Failed to derive did:key from PIN:', e);
            }
            return await walletService.signMessageWithPin(nonce, pin);
        }
        throw new Error('Seed phrase not in session. Please unlock wallet (PIN) from your wallet screen and try again.');
    };

    useEffect(() => {
        setMounted(true);

        // Get user DID
        const did = walletService.getCurrentDID();
        if (!did) {
            router.push('/onboarding');
            return;
        }
        setUserDID(did);

        // Get credential offer from sessionStorage
        const offerData = sessionStorage.getItem('credential_offer');
        if (!offerData) {
            addToast('No credential offer found', 'warning');
            return;
        }

        try {
            const parsedOffer = JSON.parse(offerData);
            setOffer(parsedOffer);
            console.log('Loaded offer:', parsedOffer);
        } catch (error) {
            console.error('Failed to parse offer:', error);
            addToast('Invalid credential offer data', 'error');
        }
    }, [router, addToast]);

    const requiredEvidence = useMemo(() => {
        const normalize = (labels?: string[] | null) => {
            if (!Array.isArray(labels)) {
                return [] as string[];
            }
            const seen = new Set<string>();
            const result: string[] = [];
            labels.forEach((label) => {
                if (typeof label !== 'string') {
                    return;
                }
                const trimmed = label.trim();
                if (!trimmed) {
                    return;
                }
                const key = trimmed.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(trimmed);
                }
            });
            return result;
        };

        const templateRequired = normalize(template?.evidence_required);
        if (templateRequired.length > 0) {
            return templateRequired;
        }
        return normalize(offer?.evidence_required);
    }, [template?.evidence_required, offer?.evidence_required]);

    const { allowedEvidence, showOptionalEvidenceUploader } = useMemo(() => {
        const normalize = (labels?: string[] | null) => {
            if (!Array.isArray(labels)) {
                return [] as string[];
            }
            const seen = new Map<string, string>();
            labels.forEach((label) => {
                if (typeof label !== 'string') {
                    return;
                }
                const trimmed = label.trim();
                if (!trimmed) {
                    return;
                }
                const key = trimmed.toLowerCase();
                if (!seen.has(key)) {
                    seen.set(key, trimmed);
                }
            });
            return Array.from(seen.values());
        };

        const allowedSet = new Map<string, string>();
        normalize(template?.allowed_evidence).forEach((ev) => {
            allowedSet.set(ev.toLowerCase(), ev);
        });
        normalize(offer?.allowed_evidence).forEach((ev) => {
            if (!allowedSet.has(ev.toLowerCase())) {
                allowedSet.set(ev.toLowerCase(), ev);
            }
        });
        const allowedList = Array.from(allowedSet.values());

        const requiredLookup = new Set(requiredEvidence.map((label) => label.toLowerCase()));
        const optionalLabels = allowedList.filter((label) => !requiredLookup.has(label.toLowerCase()));
        const shouldShowOptionalUploader = optionalLabels.length > 0 || requiredEvidence.length === 0;

        return {
            allowedEvidence: allowedList,
            optionalEvidenceLabels: optionalLabels,
            showOptionalEvidenceUploader: shouldShowOptionalUploader,
        };
    }, [template?.allowed_evidence, offer?.allowed_evidence, requiredEvidence]);

    const extensions = useMemo(() => {
        const templateExtensions = Array.isArray(template?.extensions) ? template?.extensions : [];
        const offerExtensions = Array.isArray(offer?.extensions) ? offer?.extensions : [];
        return Array.from(new Set([...(templateExtensions || []), ...(offerExtensions || [])]));
    }, [template?.extensions, offer?.extensions]);

    const formatFileSize = (size?: number) => {
        if (!size) return '';
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleUploadEvidence = async (file: File, label?: string) => {
        if (!userDID) {
            addToast('Wallet DID is not available.', 'error');
            return;
        }

        const effectiveLabel = label?.trim() || customEvidenceLabel.trim();
        if (requiredEvidence.length > 0 && effectiveLabel && !requiredEvidence.some(ev => ev.toLowerCase() === effectiveLabel.toLowerCase())) {
            addToast(`Label "${effectiveLabel}" is not required for this credential.`, 'warning');
            return;
        }

        try {
            setEvidenceUploading(file.name);
            const response = await apiService.uploadEvidence(userDID, file, effectiveLabel || undefined);
            if (!response.success || !response.data) {
                throw new Error(response.error || 'Failed to upload evidence');
            }

            const attachment = response.data.evidence;
            setEvidenceAttachments((prev) => {
                const filtered = prev.filter(att => att.label.toLowerCase() !== attachment.label.toLowerCase());
                return [...filtered, attachment];
            });
            addToast(`Evidence "${attachment.label}" uploaded`, 'success');
            setCustomEvidenceLabel('');
        } catch (error) {
            console.error('Evidence upload failed', error);
            addToast(error instanceof Error ? error.message : 'Evidence upload failed', 'error');
        } finally {
            setEvidenceUploading(null);
        }
    };

    const handleRemoveEvidence = (label: string) => {
        setEvidenceAttachments(prev => prev.filter(att => att.label.toLowerCase() !== label.toLowerCase()));
        addToast(`Removed evidence "${label}"`, 'info');
    };

    const handleEvidenceInputChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
        label?: string,
    ) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        await handleUploadEvidence(file, label);
        event.target.value = '';
    };

    const handleAccept = async () => {
        if (!offer || !userDID) return;

        setIsLoading(true);
        setStep('challenge');

        try {
            let fetchedTemplate: Template | null = null;
            if (offer.template_id) {
                console.log('Fetching template:', offer.template_id);
                try {
                    const issuerDid = offer.issuer_did || offer.issuerDID || offer.issuer?.did;
                    if (issuerDid) {
                        const templateResponse = await apiService.getTemplateByIssuer(issuerDid, offer.template_id);
                        if (templateResponse.success && templateResponse.data) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const payload: any = templateResponse.data;
                            const normalized = (payload.template ?? payload) as Template;
                            fetchedTemplate = normalized;
                            console.log('Template fetched:', normalized);
                        } else {
                            console.warn('Template fetch unsuccessful:', templateResponse.error);
                        }
                    } else {
                        console.warn('Missing issuer DID; cannot fetch template by issuer');
                    }
                } catch (error) {
                    console.warn('Failed to fetch template by issuer:', error);
                }
            }

            const offerId = offer.id || offer.offer_id;
            if (!offerId) {
                throw new Error('Offer ID not found. Invalid credential offer.');
            }

            console.log('Getting challenge for offer:', offerId);

            const response = await apiService.getOfferChallenge(offerId) as {
                success: boolean;
                data?: { nonce: string; did_methods: string[]; expires_in: number };
                error?: string;
            };
            if (!response || !response.success || !response.data) {
                throw new Error(response?.error || 'Failed to get challenge from server');
            }
            const challengeData = response.data;
            console.log('Challenge data:', challengeData);

            if (!challengeData || !challengeData.nonce) {
                throw new Error('Invalid challenge response: missing nonce');
            }

            console.log('Challenge received:', challengeData);

            setStep('accept');
            const sig = await signNonce(challengeData.nonce);
            setChallengeData(challengeData);
            setSignature(sig);

            console.log('Nonce signed, ready for form submission');

            const tmpl: Template = fetchedTemplate || template || {
                id: 'template-empty',
                name: `${offer.credential_type || 'Credential'} Template`,
                fields: [],
            };
            if (!template) setTemplate(tmpl);

            if (tmpl.evidence_required?.length) {
                tmpl.evidence_required.forEach(required => {
                    const exists = evidenceAttachments.some(att => att.label.toLowerCase() === required.toLowerCase());
                    if (!exists) {
                        setEvidenceAttachments(prev => prev);
                    }
                });
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const initialData: Record<string, any> = {};
            tmpl.fields.forEach(field => {
                if (field.source === 'issuer_input' && field.default_value) {
                    initialData[field.name] = field.default_value;
                }
                if (field.source === 'issuer_input' && offer.issuer_data_preview?.[field.name]) {
                    initialData[field.name] = offer.issuer_data_preview[field.name];
                }
                if (field.source === 'issuer_input' && offer.issuer_data?.[field.name]) {
                    initialData[field.name] = offer.issuer_data[field.name];
                }
            });
            setFormData(initialData);

            setStep('form');

        } catch (error) {
            console.error('Error in accept flow:', error);
            addToast(
                error instanceof Error ? error.message : 'Failed to accept offer',
                'error'
            );
            setStep('view');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDecline = () => {
        const confirmDecline = window.confirm('Are you sure you want to decline this credential offer?');
        if (confirmDecline) {
            sessionStorage.removeItem('credential_offer');
            router.push('/SSIWalletIdentity');
        }
    };

    const handleSubmit = async () => {
        if (!offer || !userDID || !template) return;

        const errors: Record<string, string> = {};
        template.fields.forEach(field => {
            if (field.required && field.source === 'holder_input') {
                if (!formData[field.name] || formData[field.name] === '') {
                    errors[field.name] = `${field.name} is required`;
                }
            }
        });

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            addToast('Please fill in all required fields', 'error');
            return;
        }

        setIsLoading(true);
        setStep('submitting');

        try {
            if (!challengeData || !signature) {
                throw new Error('Missing authentication data. Please try accepting the offer again.');
            }

            const offerId = offer.id || offer.offer_id;
            if (!offerId) {
                throw new Error('Offer ID not found');
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const holderData: Record<string, any> = {};
            template.fields.forEach(field => {
                if (field.source === 'holder_input' && formData[field.name] !== undefined) {
                    holderData[field.name] = formData[field.name];
                }
            });

            if (requiredEvidence.length > 0) {
                const missing = requiredEvidence.filter(required => !evidenceAttachments.some(att => att.label.toLowerCase() === required.toLowerCase()))
                    .map(label => label);

                if (missing.length > 0) {
                    setStep('form');
                    setIsLoading(false);
                    addToast(`Please upload evidence for: ${missing.join(', ')}`, 'error');
                    return;
                }
            }

            console.log('Submitting accept with holder_data:', {
                holder_did: userDID,
                holder_data: holderData,
                nonce: challengeData.nonce.substring(0, 20) + '...',
                signature: signature.substring(0, 20) + '...'
            });

            console.log('Accepting offer:', offerId);

            console.log('Accepting offer with:', {
                offer_id: offerId,
                holder_did: userDID,
                verify_did: verifyDid,
                holder_data_fields: Object.keys(holderData)
            });

            const acceptResponse = await apiService.acceptOffer(offerId, {
                holder_did: userDID,
                proof: {
                    type: 'Ed25519Signature2024',
                    nonce: challengeData.nonce,
                    signature: signature,
                    // Provide verification DID when using Ed25519 (did:key)
                    ...(verifyDid ? { did: verifyDid } : {})
                },
                holder_data: holderData,
                evidence: evidenceAttachments,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = (acceptResponse.data || acceptResponse) as { credential?: any; success?: boolean; error?: string; credential_id?: string; debug?: any };

            console.log('Accept response received:', {
                success: response.success,
                has_credential: !!response.credential,
                credential_id: response.credential_id,
                owner_did: response.credential?.credential?.owner_did,
                holder_did: userDID,
                match: response.credential?.credential?.owner_did === userDID,
                debug: response.debug
            });

            // Backend returns credential after successful accept
            if (response && (response.credential || response.success)) {
                console.log('Credential will be saved to MongoDB with owner_did:', userDID);

                setStep('success');
                sessionStorage.removeItem('credential_offer');

                console.log('Credential issued:', {
                    credential_id: response.credential_id,
                    owner_did: response.credential?.credential?.owner_did,
                    type: response.credential?.credential?.credential_type
                });

                setTimeout(() => {
                    console.log('Redirecting to Activity page after 2s delay...');
                    router.push('/SSIWalletActivity');
                }, 2000);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                throw new Error(((response as any)?.error as string) || 'Failed to accept offer and issue credential');
            }

        } catch (error) {
            console.error('Error submitting:', error);
            addToast(
                error instanceof Error ? error.message : 'Failed to collect credential',
                'error'
            );
            setStep('form');
        } finally {
            setIsLoading(false);
        }
    };

    const extractAttributes = (offer: CredentialOffer): string[] => {
        if (offer.issuer_data_preview && typeof offer.issuer_data_preview === 'object') {
            const previewKeys = Object.keys(offer.issuer_data_preview).filter(
                key => !['issuer_name', 'credential_type', 'fields_to_fill', 'type'].includes(key)
            );
            if (previewKeys.length > 0) {
                console.log('Attributes from issuer_data_preview:', previewKeys);
                return previewKeys;
            }
        }

        if (offer.preview && typeof offer.preview === 'object') {
            const previewKeys = Object.keys(offer.preview).filter(
                key => !['issuer_name', 'credential_type', 'fields_to_fill', 'type'].includes(key)
            );
            if (previewKeys.length > 0) {
                console.log('Attributes from preview:', previewKeys);
                return previewKeys;
            }
        }

        if (offer.issuer_data && typeof offer.issuer_data === 'object') {
            const realAttributes = Object.keys(offer.issuer_data).filter(
                key => !['issuer_name', 'credential_type', 'fields_to_fill', 'template_id', 'schema_id', 'type'].includes(key)
            );
            if (realAttributes.length > 0) {
                console.log('Attributes from issuer_data:', realAttributes);
                return realAttributes;
            }
        }

        if (offer.credential?.attributes && Array.isArray(offer.credential.attributes)) {
            console.log('Attributes from credential.attributes array');
            return offer.credential.attributes;
        }
        if (offer.attributes && Array.isArray(offer.attributes)) {
            console.log('Attributes from attributes array');
            return offer.attributes;
        }

        console.warn('No attributes found in offer');
        return [];
    };

    const getIssuerName = (offer: CredentialOffer): string => {
        if (offer.issuer_name) {
            return offer.issuer_name;
        }
        if (offer.issuer_data?.issuer_name) {
            return offer.issuer_data.issuer_name;
        }
        return offer.issuer?.name || offer.issuerName || 'Unknown Issuer';
    };

    const getCredentialName = (offer: CredentialOffer): string => {
        if (offer.issuer_data?.credential_type) {
            return offer.issuer_data.credential_type;
        }
        if (offer.credential_type) {
            return offer.credential_type;
        }
        return offer.credential?.name || offer.credential?.type || 'Verifiable Credential';
    };


    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen bg-light-50">
                <Loader2 className="animate-spin text-primary-500" size={40} />
            </div>
        );
    }

    if (!offer) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-light-50 px-4">
                <AlertCircle size={64} className="text-orange-500 mb-4" />
                <h2 className="text-xl font-semibold text-dark-500 mb-2">No Offer Found</h2>
                <p className="text-dark-300 text-center mb-6">
                    No credential offer was found. Please scan a QR code first.
                </p>
                <button
                    onClick={() => router.push('/SSIWalletIdentity')}
                    className="bg-primary-500 text-white px-6 py-3 rounded-full font-medium hover:bg-primary-600 transition-colors"
                >
                    Back to Wallet
                </button>
            </div>
        );
    }

    const attributes = extractAttributes(offer);
    const issuerName = getIssuerName(offer);
    const credentialName = getCredentialName(offer);

    return (
        <div className="flex flex-col h-screen bg-light-50">
            {/* Header */}
            <div className="bg-light-50 px-4 py-4 flex items-center">
                <button
                    onClick={() => router.push('/SSIWalletIdentity')}
                    className="mr-4 p-2 -ml-2 rounded-full hover:bg-light-200 transition-colors"
                    disabled={isLoading}
                >
                    <ChevronLeft size={24} className="text-dark-500" />
                </button>
                <h1 className="text-xl font-semibold text-dark-500">
                    {step === 'view' ? 'Collect Credentials' :
                        step === 'challenge' ? 'Verifying...' :
                            step === 'accept' ? 'Accepting Offer...' :
                                step === 'form' ? 'Fill Information' :
                                    step === 'submitting' ? 'Submitting...' :
                                        'Success!'}
                </h1>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 py-6 overflow-y-auto">
                {step === 'view' && (
                    <>
                        <div className="mb-6">
                            <p className="text-dark-500 text-base leading-relaxed">
                                You have received an offer to collect your credential
                            </p>
                        </div>

                        {/* Issuer Info */}
                        <div className="mb-6">
                            <div className="bg-white rounded-xl border border-dark-100 p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                                            <span className="text-white font-bold text-sm">
                                                {issuerName.slice(0, 2).toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-dark-500">{issuerName}</h4>
                                            <p className="text-xs text-dark-300">Verified Issuer</p>
                                        </div>
                                    </div>
                                    <CheckCircle size={20} className="text-green-500" />
                                </div>
                            </div>
                        </div>

                        {/* Credential Details */}
                        <div className="mb-8">
                            <div className="bg-white rounded-xl border border-dark-100 shadow-sm">
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="w-full p-4 flex items-center justify-between hover:bg-light-100 transition-colors rounded-xl"
                                >
                                    <div className="text-left">
                                        <h4 className="font-medium text-dark-500">{credentialName}</h4>
                                        <p className="text-sm text-dark-300 mt-1">{attributes.length} Attributes</p>
                                    </div>
                                    <ChevronDown
                                        size={20}
                                        className={`text-dark-200 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {isExpanded && attributes.length > 0 && (
                                    <div className="px-4 pb-4 border-t border-gray-100 mt-2 pt-4">
                                        <div className="space-y-2">
                                            {attributes.map((attr, index) => (
                                                <div key={index} className="flex items-center space-x-2">
                                                    <div className="w-2 h-2 bg-primary-500 rounded-full" />
                                                    <span className="text-sm text-dark-500">{attr}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {extensions.length > 0 && (
                            <div className="mb-6">
                                <div className="bg-white rounded-xl border border-dark-100 p-4 shadow-sm">
                                    <h4 className="text-sm font-semibold text-dark-500 mb-2">Extensions Enabled</h4>
                                    <p className="text-xs text-dark-300 mb-3">
                                        These optional extensions will be included with your credential.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {extensions.map((ext) => (
                                            <span
                                                key={ext}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-medium"
                                            >
                                                <FileText className="w-3.5 h-3.5" />
                                                {ext}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Instructions */}
                        <div className="mb-8">
                            <p className="text-sm text-dark-300 leading-relaxed">
                                If you would like to accept this offer, click proceed. You will need to verify your identity and fill in some information.
                            </p>
                        </div>
                    </>
                )}

                {(step === 'challenge' || step === 'accept') && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="animate-spin text-primary-500 mb-4" size={48} />
                        <h3 className="text-lg font-semibold text-dark-500 mb-2">
                            {step === 'challenge' ? 'Getting Challenge...' : 'Signing & Accepting...'}
                        </h3>
                        <p className="text-sm text-dark-300 text-center">
                            {step === 'challenge' ? 'Verifying credential offer...' : 'Accepting offer with your identity proof...'}
                        </p>
                    </div>
                )}

                {step === 'form' && template && (
                    <>
                        <div className="mb-6">
                            <div className="flex items-center space-x-2 mb-2">
                                <Shield className="text-primary-500" size={20} />
                                <h3 className="text-lg font-semibold text-dark-500">Fill Your Information</h3>
                            </div>
                            <p className="text-sm text-dark-300">
                                Please provide the required information below. Fields marked with * are required.
                            </p>
                        </div>

                        {/* Issuer-provided data (readonly) */}
                        {template.fields.filter(f => f.source === 'issuer_input').length > 0 && (
                            <div className="bg-light-50 rounded-xl border border-dark-100 p-4 shadow-sm mb-4">
                                <div className="flex items-center space-x-2 mb-3">
                                    <CheckCircle className="text-green-500" size={16} />
                                    <h4 className="text-sm font-semibold text-dark-500">Issuer-Provided Information</h4>
                                </div>
                                <div className="space-y-2">
                                    {template.fields
                                        .filter(field => field.source === 'issuer_input')
                                        .map((field) => (
                                            <div key={field.name} className="flex items-start">
                                                <span className="text-xs font-medium text-dark-400 w-32 flex-shrink-0 capitalize">{field.name.replace(/_/g, ' ')}:</span>
                                                <span className="text-xs text-dark-500 font-medium">{formData[field.name] || offer.issuer_data_preview?.[field.name] || offer.issuer_data?.[field.name] || 'N/A'}</span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        <div className="bg-white rounded-xl border border-dark-100 p-4 shadow-sm mb-6">
                            {template.fields
                                .filter(field => field.source === 'holder_input')
                                .map((field) => (
                                    <DynamicField
                                        key={field.name}
                                        field={field}
                                        value={formData[field.name]}
                                        onChange={(value) => {
                                            setFormData(prev => ({ ...prev, [field.name]: value }));
                                            setFormErrors(prev => {
                                                const newErrors = { ...prev };
                                                delete newErrors[field.name];
                                                return newErrors;
                                            });
                                        }}
                                        error={formErrors[field.name]}
                                    />
                                ))}

                            {/* Show message if no holder fields */}
                            {template.fields.filter(f => f.source === 'holder_input').length === 0 && (
                                <div className="text-center py-8 text-dark-300">
                                    <p className="text-sm">
                                        No additional information required from you.
                                    </p>
                                    <p className="text-xs mt-2">
                                        All information has been provided by the issuer.
                                    </p>
                                </div>
                            )}
                        </div>

                        {extensions.length > 0 && (
                            <div className="bg-white rounded-xl border border-indigo-100 p-4 shadow-sm mb-6">
                                <h4 className="text-sm font-semibold text-indigo-700 mb-2">Extensions Included</h4>
                                <p className="text-xs text-indigo-600 mb-3">
                                    The credential will embed the following extensions selected by the issuer.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {extensions.map((ext) => (
                                        <span
                                            key={ext}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-medium"
                                        >
                                            <FileText className="w-3.5 h-3.5" />
                                            {ext}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                            <p className="text-xs text-blue-800">
                                Your information will be securely stored in your wallet and shared only with your consent.
                            </p>
                        </div>

                        {(requiredEvidence.length > 0 || showOptionalEvidenceUploader || evidenceAttachments.length > 0) && (
                            <div className="bg-white rounded-xl border border-dark-100 p-4 shadow-sm mb-6 space-y-4">
                                <div className="flex items-center gap-2">
                                    <FileText className="text-primary-500" size={18} />
                                    <h4 className="text-sm font-semibold text-dark-500">Supporting Evidence</h4>
                                </div>

                                {requiredEvidence.length > 0 && (
                                    <div className="border border-light-200 rounded-lg p-3">
                                        <p className="text-xs text-dark-300 mb-2">
                                            Upload the evidence files listed below before submitting this credential.
                                        </p>
                                        <ul className="space-y-2">
                                            {requiredEvidence.map((label) => {
                                                const inputId = `evidence-required-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
                                                const provided = evidenceAttachments.some(
                                                    (att) => att.label.toLowerCase() === label.toLowerCase(),
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
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                            <input
                                                                id={inputId}
                                                                type="file"
                                                                accept="*/*"
                                                                className="hidden"
                                                                onChange={(event) => handleEvidenceInputChange(event, label)}
                                                            />
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}

                                <div className="border border-light-200 rounded-lg p-3 space-y-3">
                                    <p className="text-xs text-dark-300">
                                        Need to upload additional evidence? Provide an optional label and attach the file below.
                                    </p>
                                    {allowedEvidence.length > 0 && (
                                        <p className="text-xs text-dark-200">
                                            Allowed labels: {allowedEvidence.join(', ')}
                                        </p>
                                    )}
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            value={customEvidenceLabel}
                                            onChange={(event) => setCustomEvidenceLabel(event.target.value)}
                                            placeholder="Optional evidence label"
                                            className="flex-1 px-3 py-2 border border-light-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
                                        />
                                        <label
                                            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition cursor-pointer ${evidenceUploading
                                                ? 'bg-gray-100 text-dark-300 border-light-200 cursor-not-allowed'
                                                : 'bg-primary-500 text-white border-primary-500 hover:bg-primary-600'
                                                }`}
                                        >
                                            <Upload className="w-4 h-4" />
                                            {evidenceUploading ? 'Uploading…' : 'Upload file'}
                                            <input
                                                type="file"
                                                accept="*/*"
                                                className="hidden"
                                                disabled={Boolean(evidenceUploading)}
                                                onChange={(event) => handleEvidenceInputChange(event, customEvidenceLabel || undefined)}
                                            />
                                        </label>
                                    </div>
                                </div>

                                {evidenceAttachments.length > 0 && (
                                    <div className="border border-light-200 rounded-lg p-3 space-y-2">
                                        <h5 className="text-xs font-semibold text-dark-400 uppercase tracking-wide">Uploaded evidence</h5>
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
                                                                    <span className="ml-1 text-dark-200">
                                                                        · {formatFileSize(attachment.size)}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            {attachment.content_type && (
                                                                <p className="text-xs text-dark-200">{attachment.content_type}</p>
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
                                                            onClick={() => handleRemoveEvidence(attachment.label)}
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {step === 'submitting' && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="animate-spin text-primary-500 mb-4" size={48} />
                        <h3 className="text-lg font-semibold text-dark-500 mb-2">
                            Collecting Credential...
                        </h3>
                        <p className="text-sm text-dark-300 text-center">
                            Please wait while we securely store your credential...
                        </p>
                    </div>
                )}

                {step === 'success' && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="text-green-600" size={40} />
                        </div>
                        <h3 className="text-lg font-semibold text-dark-500 mb-2">
                            Credential Collected!
                        </h3>
                        <p className="text-sm text-dark-300 text-center mb-6">
                            Your credential has been securely stored in your wallet.
                        </p>
                        <p className="text-xs text-gray-400">
                            Redirecting to wallet...
                        </p>
                    </div>
                )}
            </div>

            {(step === 'view' || step === 'form') && (
                <div className="px-4 pb-6 space-y-3 bg-white border-t border-dark-100">
                    {step === 'view' && (
                        <>
                            <button
                                onClick={handleAccept}
                                disabled={isLoading}
                                className="w-full bg-primary-500 text-white py-4 rounded-full font-medium text-lg hover:bg-primary-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="animate-spin mr-2" size={20} />
                                        Processing...
                                    </>
                                ) : (
                                    'Accept Offer'
                                )}
                            </button>

                            <button
                                onClick={handleDecline}
                                disabled={isLoading}
                                className="w-full text-red-600 py-2 font-medium text-lg hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                            >
                                Decline
                            </button>
                        </>
                    )}

                    {step === 'form' && (
                        <>
                            <button
                                onClick={handleSubmit}
                                disabled={isLoading}
                                className="w-full bg-primary-500 text-white py-4 rounded-full font-medium text-lg hover:bg-primary-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="animate-spin mr-2" size={20} />
                                        Submitting...
                                    </>
                                ) : (
                                    'Submit & Collect'
                                )}
                            </button>

                            <button
                                onClick={() => {
                                    setStep('view');
                                    setFormData({});
                                    setFormErrors({});
                                }}
                                disabled={isLoading}
                                className="w-full text-gray-600 py-2 font-medium text-lg hover:bg-gray-50 rounded-full transition-colors disabled:opacity-50"
                            >
                                Back
                            </button>
                        </>
                    )}
                </div>
            )}
            <PinModal
                isOpen={isPinOpen}
                title="Wallet PIN"
                description="Enter your wallet PIN to sign the challenge."
                confirmText="Sign"
                cancelText="Cancel"
                onSubmit={handlePinSubmit}
                onCancel={handlePinCancel}
            />
        </div>
    );
}
