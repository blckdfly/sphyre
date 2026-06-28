"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Trash2, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import apiService from '@/services/apiService';

interface PredicateRequirement {
  attribute: string;
  operator: string;
  value: number;
  predicate_type: string;
}

interface VerificationPreset {
  id: string;
  name: string;
  description: string;
  preset_type: string;
  required_predicates?: PredicateRequirement[];
  required_attributes: string[];
  requested_attributes?: string[];
  is_system: boolean;
  verifier_did: string;
  created_at: string;
  updated_at: string;
}

const PresetConfigurationPage: React.FC = () => {
  const router = useRouter();
  const [presets, setPresets] = useState<VerificationPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [verifierDID, setVerifierDID] = useState<string>('');

  useEffect(() => {
    const did = localStorage.getItem('verifierDID');
    if (!did) {
      router.push('/onboarding');
      return;
    }
    setVerifierDID(did);
    fetchPresets(did);
  }, [router]);

  const fetchPresets = async (did: string) => {
    setIsLoading(true);
    try {
      const response = await apiService.listPresets(did);
      if (response.success && response.data) {
        const data = response.data as { presets: VerificationPreset[] };
        setPresets(data.presets || []);
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardToggle = (cardId: string) => {
    const newExpandedCards = new Set(expandedCards);
    if (newExpandedCards.has(cardId)) {
      newExpandedCards.delete(cardId);
    } else {
      newExpandedCards.add(cardId);
    }
    setExpandedCards(newExpandedCards);
  };

  const handleBack = () => {
        router.push('/VerifierHome');
    };

  const handleDelete = async (preset: VerificationPreset) => {
    if (preset.is_system) {
      alert('Cannot delete system presets');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${preset.name}"?`)) {
      return;
    }

    try {
      const response = await apiService.deletePreset(verifierDID, preset.id);
      if (response.success) {
        fetchPresets(verifierDID);
      } else {
        alert('Failed to delete preset: ' + response.error);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete preset');
    }
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
  };

  const handleSaveSuccess = () => {
    handleCloseModal();
    fetchPresets(verifierDID);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-light-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-dark-300">Loading presets</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-50">
      {/* Header */}
      <div className="bg-light-50 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center">
          
          <button onClick={handleBack} className="mr-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-medium text-dark-500">Preset Configuration</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          New Preset
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Description */}
        <div className="mb-8">
          <p className="text-dark-500 leading-relaxed">
            Manage your verification request presets. Create custom request types with specific attributes.
          </p>
        </div>

        {/* Presets list */}
        {presets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-dark-300 mb-4">No presets found. Create your first preset!</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              Create Preset
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {presets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isExpanded={expandedCards.has(preset.id)}
                onToggle={() => handleCardToggle(preset.id)}
                onDelete={() => handleDelete(preset)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <PresetModal
          verifierDID={verifierDID}
          onClose={handleCloseModal}
          onSuccess={handleSaveSuccess}
        />
      )}
    </div>
  );
};

interface PresetCardProps {
  preset: VerificationPreset;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, isExpanded, onToggle, onDelete }) => {
  return (
    <div className="bg-white rounded-lg border border-dark-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center flex-1 cursor-pointer" onClick={onToggle}>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-dark-500">{preset.name}</h3>
              {preset.is_system && (
                <span className="flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                  <Shield size={12} className="mr-1" />
                  System
                </span>
              )}
            </div>
            <p className="text-sm text-dark-300 mt-1">{preset.description}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                {preset.required_attributes.length} attributes
              </span>
              <span className="text-xs text-dark-300">{preset.preset_type}</span>
            </div>
          </div>
          <button className="ml-4">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {!preset.is_system && (
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="View preset"
            >
              <Eye size={18} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Delete preset"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <h4 className="text-sm font-medium text-dark-400 mb-2">Required Attributes:</h4>
            <div className="flex flex-wrap gap-2">
              {preset.required_attributes.map((attr, index) => (
                <span key={index} className="px-3 py-1 bg-light-200 text-dark-500 text-sm rounded-2">
                  {attr}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4">
          </div>
        </div>
      )}
    </div>
  );
};

interface PresetModalProps {
  verifierDID: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PresetModal: React.FC<PresetModalProps> = ({ verifierDID, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    preset_type: '',
    required_attributes: '',
    requested_attributes: '',
  });
  const [predicates, setPredicates] = useState<PredicateRequirement[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const addPredicate = () => {
    setPredicates([...predicates, { attribute: '', operator: '>=', value: 0, predicate_type: 'range' }]);
  };

  const updatePredicate = (index: number, field: keyof PredicateRequirement, value: string | number) => {
    const updated = [...predicates];
    if (field === 'value') {
      updated[index][field] = Number(value);
    } else if (field === 'operator') {
      updated[index][field] = value as string;
      updated[index].predicate_type = (value === '==' || value === '!=') ? 'equality' : 'range';
    } else {
      updated[index][field] = value as string;
    }
    setPredicates(updated);
  };

  const removePredicate = (index: number) => {
    setPredicates(predicates.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
    const data = {
      name: formData.name,
      description: formData.description,
      preset_type: formData.preset_type,
      required_predicates: predicates.length > 0 ? predicates : undefined,
      required_attributes: formData.required_attributes.split(',').map(s => s.trim()).filter(Boolean),
      requested_attributes: formData.requested_attributes ? formData.requested_attributes.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    };

    console.log('Creating preset with data:', {
      verifierDID,
      data: JSON.stringify(data, null, 2)
    });

    const response = await apiService.createPreset(verifierDID, data);

    if (response.success) {
      console.log('Preset created successfully:', response);
      onSuccess();
    } else {
      console.error('Preset creation failed:', response);
      alert('Failed to save preset: ' + response.error);
    }
  } catch (error) {
    console.error('Error creating preset:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    alert('Failed to save preset: ' + errorMessage);
  } finally {
    setIsSaving(false);
  }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-dark-500">
              Create New Preset
            </h2>
            <button onClick={onClose} className="text-dark-300 hover:text-dark-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-500 mb-2">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-500 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-500 mb-2">Preset Type</label>
                <input
                  type="text"
                  value={formData.preset_type}
                  onChange={(e) => setFormData({ ...formData, preset_type: e.target.value })}
                  className="w-full px-4 py-2 border border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="driver_license_a"
                  required
                />
                <p className="text-xs text-dark-300 mt-1">Use a descriptive identifier for this preset</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-500 mb-2">Preset Category</label>
                <input
                  type="text"
                  value={formData.preset_type ? formData.preset_type.split(':')[0] : ''}
                  onChange={() => {}}
                  className="w-full px-4 py-2 border border-dark-200 rounded-lg bg-light-100 text-dark-300 cursor-not-allowed"
                  placeholder=""
                  disabled
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-500 mb-2">Required Attributes (comma-separated)</label>
              <input
                type="text"
                value={formData.required_attributes}
                onChange={(e) => setFormData({ ...formData, required_attributes: e.target.value })}
                className="w-full px-4 py-2 border border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="name, car_type, issue_year"
                required
              />
              <p className="text-xs text-dark-300 mt-1">Example: employee_status, org_affiliation, job_title</p>
            </div>

            <div className="border-t border-dark-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-dark-500">
                    Zero-Knowledge Predicates
                  </label>
                </div>
                <button
                  type="button"
                  onClick={addPredicate}
                  className="text-sm px-3 py-1 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  Add Predicate
                </button>
              </div>
              
              {predicates.length > 0 ? (
                <div className="space-y-2">
                  {predicates.map((pred, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-purple-50 p-3 rounded-lg">
                      <input
                        type="text"
                        placeholder="Attribute (e.g., age)"
                        value={pred.attribute}
                        onChange={(e) => updatePredicate(idx, 'attribute', e.target.value)}
                        className="flex-1 px-3 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                      <select
                        value={pred.operator}
                        onChange={(e) => updatePredicate(idx, 'operator', e.target.value)}
                        className="px-3 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      >
                        <option value=">=">&ge; (&gt;=)</option>
                        <option value="<=">&le; (&lt;=)</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value="==">= (==)</option>
                        <option value="!=">≠ (!=)</option>
                      </select>
                      <input
                        type="number"
                        placeholder="Value"
                        value={pred.value}
                        onChange={(e) => updatePredicate(idx, 'value', e.target.value)}
                        className="w-24 px-3 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => removePredicate(idx)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-dark-300 bg-purple-50 p-3 rounded-lg">
                   No predicates added. Predicates allow proving attributes without revealing actual values (e.g., age &ge; 21).
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-500 mb-2">
                Requested Attributes (Optional, comma-separated)
              </label>
              <input
                type="text"
                value={formData.requested_attributes}
                onChange={(e) => setFormData({ ...formData, requested_attributes: e.target.value })}
                className="w-full px-4 py-2 border border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="address, phone, email"
              />
              <p className="text-xs text-dark-300 mt-1">
                Holder can choose whether to share these attributes (not mandatory)
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 border border-dark-200 text-dark-500 rounded-lg hover:bg-light-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Create Preset'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PresetConfigurationPage;
