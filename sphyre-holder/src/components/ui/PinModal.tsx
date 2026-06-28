import React, { useState, useEffect } from 'react';

interface PinModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onSubmit: (pin: string) => Promise<void> | void;
  onCancel: () => void;
}

export default function PinModal({
  isOpen,
  title = 'Enter PIN',
  description = 'Please enter your wallet PIN to continue.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onSubmit,
  onCancel,
}: PinModalProps) {
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!pin || pin.length < 4) {
      setError('PIN must be at least 6 digits');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to verify PIN');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>

        <div className="mb-4">
          <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={isSubmitting}
          />
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {isSubmitting ? 'Verifying...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
