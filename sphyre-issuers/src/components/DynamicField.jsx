import React from 'react';

export const DynamicField = ({ field, value, onChange, disabled, error }) => {
  const isReadOnly = disabled || field.source === 'holder_input';

  const renderField = () => {
    if (field.source === 'system_generated' || field.source === 'derived') {
      return null;
    }

    const baseClasses = `w-full px-3 py-2 border rounded-md text-sm ${
      error ? 'border-red-500' : 'border-dark-100'
    } ${isReadOnly ? 'bg-light-100 cursor-not-allowed' : 'bg-white'} focus:ring-2 focus:ring-primary-500 focus:border-transparent`;

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
            required={field.required}
            className={baseClasses}
          />
        );

      case 'number':
      case 'integer':
        return (
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => {
              const nextValue = e.target.value;
              if (nextValue === '') {
                onChange('');
                return;
              }

              if (/^[-+]?\d*(\.\d+)?$/.test(nextValue)) {
                onChange(Number(nextValue));
              }
            }}
            onKeyDown={(e) => {
              if (['e', 'E'].includes(e.key)) {
                e.preventDefault();
              }
            }}
            inputMode="decimal"
            pattern="[0-9]*"
            disabled={isReadOnly}
            min={field.min}
            max={field.max}
            required={field.required}
            className={baseClasses}
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
            className={baseClasses}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            placeholder={field.placeholder}
            required={field.required}
            rows={4}
            className={baseClasses}
          />
        );

      case 'select':
      case 'dropdown':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            required={field.required}
            className={baseClasses}
          >
            <option value="">-- Select --</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
      case 'boolean':
        return (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              disabled={isReadOnly}
              className="w-4 h-4 text-primary-500 border-dark-100 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-dark-500">{field.label || field.name}</span>
          </label>
        );

      case 'email':
        return (
          <input
            type="email"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            placeholder={field.placeholder}
            required={field.required}
            className={baseClasses}
          />
        );

      case 'url':
        return (
          <input
            type="url"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            placeholder={field.placeholder}
            required={field.required}
            className={baseClasses}
          />
        );

      case 'tel':
      case 'phone':
        return (
          <input
            type="tel"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            placeholder={field.placeholder}
            required={field.required}
            className={baseClasses}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            placeholder={field.placeholder}
            required={field.required}
            className={baseClasses}
          />
        );
    }
  };

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-dark-500">
        {field.label || field.name}
        {field.required && <span className="text-red-500 ml-1"></span>}
        {field.source === 'holder_input' && (
          <span className="ml-2 text-xs text-dark-300">(From holder)</span>
        )}
        {field.source === 'issuer_input' && (
          <span className="ml-2 text-xs text-primary-500">(You fill this)</span>
        )}
      </label>
      
      {renderField()}
      
      {field.help_text && (
        <p className="text-xs text-dark-300">{field.help_text}</p>
      )}
      
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
};
