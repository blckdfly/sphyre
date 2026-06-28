import React, { useEffect, useState } from 'react';

export interface VerificationRequestFormValues {
  requiredAttributes: string[];
  attributeValueRequirements: Record<string, string[]>;
}

export interface VerificationRequestFormProps {
  onSubmit: (values: VerificationRequestFormValues) => void;
  initialValues?: Partial<VerificationRequestFormValues>;
  availableAttributes?: string[];
}

const VerificationRequestForm: React.FC<VerificationRequestFormProps> = ({ onSubmit, initialValues, availableAttributes }) => {
  const [attributes, setAttributes] = useState<string[]>(initialValues?.requiredAttributes || availableAttributes || []);
  const [attributeValueRequirements, setAttributeValueRequirements] = useState<Record<string, string[]>>(
    initialValues?.attributeValueRequirements || {}
  );

  useEffect(() => {
    if (initialValues?.requiredAttributes) {
      setAttributes(initialValues.requiredAttributes);
    } else if (availableAttributes) {
      setAttributes(availableAttributes);
    } else {
      setAttributes([]);
    }

    setAttributeValueRequirements(initialValues?.attributeValueRequirements || {});
  }, [initialValues, availableAttributes]);

  useEffect(() => {
    onSubmit({
      requiredAttributes: attributes,
      attributeValueRequirements,
    });
  }, [attributes, attributeValueRequirements, onSubmit]);

  const handleAddAttributeValue = (attribute: string) => {
    const value = prompt(`Enter an allowed value for the "${attribute}" attribute`);
    if (!value) {
      return;
    }

    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    setAttributeValueRequirements((prev) => {
      const existing = prev[attribute] || [];
      if (existing.includes(normalized)) {
        return prev;
      }

      return {
        ...prev,
        [attribute]: [...existing, normalized],
      };
    });
  };

  const handleRemoveAttributeValue = (attribute: string, value: string) => {
    setAttributeValueRequirements((prev) => {
      const existing = prev[attribute] || [];
      const filtered = existing.filter((item) => item !== value);
      if (filtered.length === 0) {
        const { [attribute]: _, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [attribute]: filtered,
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {attributes.map((attribute) => (
          <div key={attribute} className="border border-neutral-200 rounded-xl p-4 bg-neutral-50">
            <div className="flex items-center justify-between">
              <strong className="text-sm font-semibold text-neutral-700">
                {attribute.replace(/_/g, ' ').replace(/\b\w/g, (char: string) => char.toUpperCase())}
              </strong>
              <button
                type="button"
                onClick={() => handleAddAttributeValue(attribute)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Add allowed value
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              The holder must disclose this attribute. Add allowed values if you need to restrict its contents.
            </p>

            {attributeValueRequirements[attribute]?.length ? (
              <div className="mt-3 space-y-2">
                {attributeValueRequirements[attribute].map((value) => (
                  <div
                    key={value}
                    className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 px-3 py-2"
                  >
                    <span className="text-sm text-neutral-700">{value}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttributeValue(attribute, value)}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs italic text-neutral-400">
                No value restrictions. Any value will be accepted as long as the attribute is disclosed.
              </p>
            )}
          </div>
        ))}
      </div>

    </div>
  );
};

export default VerificationRequestForm;
