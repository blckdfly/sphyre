import React, { useState, useEffect } from 'react';

export default function PinModal({ isOpen, onClose, onSubmit, title = 'Enter PIN', subtitle = 'Enter your PIN to continue' }) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setShowPin(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onSubmit(pin);
      onClose();
    } catch (error) {
      setError(error.message || 'Invalid PIN');
      setLoading(false);
    }
  };

  const handlePinChange = (value) => {
    const digits = value.replace(/\D/g, '');
    const capped = digits.slice(0, 6);
    setPin(capped);
    setError('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && pin.length === 6) {
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const styles = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.2s ease',
    },
    modal: {
      background: 'rgba(15, 15, 20, 0.95)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '24px',
      padding: '40px',
      maxWidth: '460px',
      width: '90%',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 5, 255, 0.2)',
      animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    header: {
      textAlign: 'center',
      marginBottom: '32px',
    },
    title: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#FFFFFF',
      margin: '0 0 8px 0',
      letterSpacing: '-0.02em',
    },
    subtitle: {
      fontSize: '14px',
      color: '#8B8B9E',
      margin: 0,
    },
    inputGroup: {
      marginBottom: '24px',
    },
    label: {
      fontSize: '13px',
      color: '#8B8B9E',
      fontWeight: '600',
      marginBottom: '8px',
      display: 'block',
    },
    inputWrapper: {
      position: 'relative',
    },
    input: {
      width: '100%',
      padding: '16px',
      paddingRight: '48px',
      background: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '18px',
      fontFamily: 'monospace',
      letterSpacing: '4px',
      textAlign: 'center',
      transition: 'all 0.3s ease',
      boxSizing: 'border-box',
      outline: 'none',
    },
    eyeButton: {
      position: 'absolute',
      right: '12px',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      color: '#8B8B9E',
      cursor: 'pointer',
      padding: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'color 0.2s',
    },
    buttonGroup: {
      display: 'flex',
      gap: '12px',
      marginTop: '24px',
    },
    button: {
      flex: 1,
      padding: '14px',
      border: 'none',
      borderRadius: '12px',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    cancelButton: {
      background: 'rgba(255, 255, 255, 0.05)',
      color: '#8B8B9E',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    submitButton: {
      background: 'linear-gradient(135deg, #0005FF 0%, #0003CC 100%)',
      color: '#FFFFFF',
      boxShadow: '0 4px 20px rgba(0, 5, 255, 0.3)',
    },
    errorBox: {
      padding: '12px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '8px',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    errorText: {
      fontSize: '13px',
      color: '#EF4444',
      margin: 0,
    },
  };

  const animationStyles = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  return (
    <>
      <style>{animationStyles}</style>
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <h2 style={styles.title}>{title}</h2>
            <p style={styles.subtitle}>{subtitle}</p>
          </div>

          {error && (
            <div style={styles.errorBox}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: '#EF4444', flexShrink: 0}}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p style={styles.errorText}>{error}</p>
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>PIN</label>
            <div style={styles.inputWrapper}>
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="••••••"
                maxLength={6}
                style={styles.input}
                autoFocus
                onFocus={(e) => { e.target.style.borderColor = '#0005FF'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                style={styles.eyeButton}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#8B8B9E'; }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showPin ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          <div style={styles.buttonGroup}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                ...styles.button,
                ...styles.cancelButton,
                opacity: loading ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || pin.length !== 6}
              style={{
                ...styles.button,
                ...styles.submitButton,
                opacity: (loading || pin.length !== 6) ? 0.4 : 1,
                cursor: (loading || pin.length !== 6) ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!loading && pin.length === 6) e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {loading ? (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}>
                  <div style={{width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #FFFFFF', borderRadius: '50%', animation: 'spin 1s linear infinite'}}></div>
                  Verifying...
                </div>
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}