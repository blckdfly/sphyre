import React from 'react';

export type FieldSource = 'holder_input' | 'issuer_input' | 'system_generated' | 'derived';

export interface FieldDef {
  name: string;
  field_type: string;
  required: boolean;
  source: FieldSource;
  placeholder?: string;
  help_text?: string;
  pattern?: string;
  min_length?: number;
  max_length?: number;
  min?: number;
  max?: number;
  options?: string[];
  readonly_in_holder?: boolean;
  default_value?: string;
  formula?: string;
}

interface DynamicFieldProps {
  field: FieldDef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (value: any) => void;
  disabled?: boolean;
  error?: string;
}

export function DynamicField({ field, value, onChange, disabled, error }: DynamicFieldProps) {
  const isReadOnly = field.readonly_in_holder || disabled || field.source === 'issuer_input';

  const renderField = () => {
    if (field.source === 'system_generated' || field.source === 'derived') {
      return null;
    }

    switch (field.field_type) {
      case 'text':
      case 'string':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            placeholder={field.placeholder}
            pattern={field.pattern}
            minLength={field.min_length}
            maxLength={field.max_length}
            required={field.required}
            className={`w-full px-4 py-3 bg-white border ${
              error ? 'border-red-500' : 'border-dark-100'
            } rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-dark-500 placeholder-dark-300 shadow-sm ${
              isReadOnly ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
        );

      case 'number':
      case 'integer':
        return (
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={isReadOnly}
            min={field.min}
            max={field.max}
            required={field.required}
            className={`w-full px-4 py-3 bg-white border ${
              error ? 'border-red-500' : 'border-dark-100'
            } rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-dark-500 shadow-sm ${
              isReadOnly ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            required={field.required}
            className={`w-full px-4 py-3 bg-white border ${
              error ? 'border-red-500' : 'border-dark-100'
            } rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-dark-500 shadow-sm ${
              isReadOnly ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
        );

      case 'enum':
      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            required={field.required}
            className={`w-full px-4 py-3 bg-white border ${
              error ? 'border-red-500' : 'border-dark-100'
            } rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-dark-500 shadow-sm ${
              isReadOnly ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            <option value="" disabled>Select {field.name}...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'boolean':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              disabled={isReadOnly}
              className={`w-5 h-5 text-primary-500 bg-white border-dark-200 rounded focus:ring-primary-500 ${
                isReadOnly ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            />
            <label className="ml-3 text-sm text-dark-400">
              {field.placeholder || field.name}
            </label>
          </div>
        );

      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            placeholder={field.placeholder}
            minLength={field.min_length}
            maxLength={field.max_length}
            required={field.required}
            rows={4}
            className={`w-full px-4 py-3 bg-white border ${
              error ? 'border-red-500' : 'border-dark-100'
            } rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-dark-500 placeholder-dark-300 shadow-sm ${
              isReadOnly ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
        );

      case 'image':
      case 'file':
        return (
          <input
            type="file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  onChange({
                    name: file.name,
                    data: reader.result,
                    type: file.type,
                    size: file.size
                  });
                };
                reader.readAsDataURL(file);
              }
            }}
            disabled={isReadOnly}
            accept={field.field_type === 'image' ? 'image/*' : '*/*'}
            className={`w-full text-dark-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-500 file:text-white hover:file:bg-primary-600 ${
              isReadOnly ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            className="w-full px-4 py-3 bg-white border border-dark-100 rounded-xl focus:ring-2 focus:ring-primary-500 text-dark-500 shadow-sm"
          />
        );
    }
  };

  if (field.source === 'system_generated' || field.source === 'derived') {
    return null;
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-dark-400 mb-2">
        {field.name}
        {field.required && <span className="text-red-500 ml-1">*</span>}
        {field.source === 'issuer_input' && (
          <span className="ml-2 text-xs text-primary-500">(Provided by issuer)</span>
        )}
      </label>
      
      {renderField()}
      
      {field.help_text && (
        <p className="text-xs text-dark-300 mt-1">{field.help_text}</p>
      )}
      
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
