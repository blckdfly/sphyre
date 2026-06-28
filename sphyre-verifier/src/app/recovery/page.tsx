'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import verifierAuthService from '../../services/verifierAuthService';

export default function RecoveryPage() {
  const router = useRouter();
  const [step, setStep] = useState<'seedphrase' | 'setpin'>('seedphrase');
  const [seedWords, setSeedWords] = useState<string[]>(Array(12).fill(''));
  const [showSeed, setShowSeed] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleWordChange = (index: number, value: string) => {
    const newWords = [...seedWords];
    newWords[index] = value.toLowerCase().trim();
    setSeedWords(newWords);
    setError('');
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const words = text.trim().split(/\s+/);
      if (words.length === 12) {
        setSeedWords(words.map(w => w.toLowerCase().trim()));
        setError('');
      } else {
        setError('Pasted text must contain exactly 12 words');
      }
    } catch {
      setError('Failed to paste from clipboard');
    }
  };

  const handleVerifySeedPhrase = () => {
    const seedPhrase = seedWords.join(' ');
    
    // Validate that all words are filled
    if (seedWords.some(word => !word)) {
      setError('Please fill in all 12 words');
      return;
    }

    // Validate seed phrase
    if (!verifierAuthService.validateSeedPhrase(seedPhrase)) {
      setError('Invalid seed phrase. Please check and try again.');
      return;
    }

    setStep('setpin');
  };

  const handleRecoverWithNewPin = async () => {
    if (newPin.length < 4) {
      setError('PIN must be at least 6 digits');
      return;
    }

    if (newPin.length > 6) {
      setError('PIN must be at most 6 digits');
      return;
    }

    if (newPin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const seedPhrase = seedWords.join(' ');
      await verifierAuthService.recoverWithSeedPhrase(seedPhrase, newPin);
      router.push('/VerifierHome');
    } catch (error: unknown) {
      console.error('Recovery error:', error);
      setError(error instanceof Error ? error.message : 'Recovery failed. Please check your seed phrase.');
      setLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #090909 0%, #0a0a0f 50%, #090909 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative' as const,
      overflow: 'hidden',
    },
    backgroundPattern: {
      position: 'absolute' as const,
      inset: 0,
      background: 'radial-gradient(circle at 20% 50%, rgba(0, 5, 255, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(0, 5, 255, 0.1) 0%, transparent 50%)',
      zIndex: 0,
    },
    wrapper: {
      maxWidth: step === 'seedphrase' ? '700px' : '500px',
      width: '100%',
      position: 'relative' as const,
      zIndex: 1,
      animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '48px',
    },
    brandContainer: {
      marginBottom: '32px',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      gap: '12px',
    },
    brandLine: {
      width: '60px',
      height: '3px',
      background: 'linear-gradient(90deg, #0005FF, #0003CC)',
      borderRadius: '2px',
    },
    brandName: {
      fontSize: '28px',
      fontWeight: '700' as const,
      color: '#FFFFFF',
      letterSpacing: '-0.02em',
      margin: 0,
    },
    brandSubtitle: {
      fontSize: '13px',
      color: '#52525E',
      letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
    },
    headerTitle: {
      fontSize: '32px',
      fontWeight: '700' as const,
      color: '#FFFFFF',
      margin: '0 0 12px 0',
      letterSpacing: '-0.02em',
    },
    headerSubtitle: {
      fontSize: '15px',
      color: '#8B8B9E',
      lineHeight: '1.6',
      margin: 0,
    },
    card: {
      background: 'rgba(15, 15, 20, 0.5)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '24px',
      padding: '48px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 5, 255, 0.1)',
    },
    seedGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '12px',
      marginBottom: '24px',
    },
    seedInput: {
      background: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '12px',
      color: '#FFFFFF',
      fontSize: '14px',
      fontFamily: 'monospace',
      textAlign: 'center' as const,
      transition: 'all 0.3s ease',
      width: '100%',
      boxSizing: 'border-box' as const,
    },
    seedNumber: {
      fontSize: '10px',
      color: '#FFFFFF',
      marginBottom: '6px',
      textAlign: 'center' as const,
    },
    inputGroup: {
      marginBottom: '24px',
    },
    label: {
      fontSize: '13px',
      color: '#8B8B9E',
      fontWeight: '600' as const,
      marginBottom: '8px',
      display: 'block',
    },
    inputWrapper: {
      position: 'relative' as const,
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
      textAlign: 'center' as const,
      transition: 'all 0.3s ease',
      boxSizing: 'border-box' as const,
    },
    eyeButton: {
      position: 'absolute' as const,
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
    },
    button: {
      width: '100%',
      padding: '16px',
      background: 'linear-gradient(135deg, #0005FF 0%, #0003CC 100%)',
      border: 'none',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '15px',
      fontWeight: '600' as const,
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: '0 4px 20px rgba(0, 5, 255, 0.3)',
    },
    buttonSecondary: {
      background: 'transparent',
      border: '2px solid rgba(255, 255, 255, 0.1)',
      boxShadow: 'none',
    },
    buttonDisabled: {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
    errorBox: {
      padding: '16px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '12px',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    errorText: {
      fontSize: '14px',
      color: '#EF4444',
    },
    actions: {
      display: 'flex',
      gap: '12px',
      marginBottom: '16px',
      justifyContent: 'flex-end',
    },
    actionButton: {
      background: 'none',
      border: 'none',
      color: '#0005FF',
      fontSize: '14px',
      cursor: 'pointer',
      padding: '8px 12px',
      borderRadius: '8px',
      transition: 'all 0.3s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
  };

  const animationStyles = `
    @keyframes fadeInScale {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  if (step === 'seedphrase') {
    return (
      <>
        <style>{animationStyles}</style>
        <div style={styles.container}>
          <div style={styles.backgroundPattern} />
          <div style={styles.wrapper}>
            {/* Header */}
            <div style={styles.header}>
              <div style={styles.brandContainer}>
                <div style={styles.brandLine} />
                <h1 style={styles.brandName}>Sphyre</h1>
                <div style={styles.brandSubtitle}>Verifier Portal</div>
              </div>
              <h2 style={styles.headerTitle}>Recover Your Access</h2>
              <p style={styles.headerSubtitle}>
                Enter your 12-word seed phrase to regain access
              </p>
            </div>

            <div style={styles.card}>
              {error && (
                <div style={styles.errorBox}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: '#EF4444', flexShrink: 0}}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span style={styles.errorText}>{error}</span>
                </div>
              )}

              {/* Actions */}
              <div style={styles.actions}>
                <button
                  onClick={handlePaste}
                  style={styles.actionButton}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0, 5, 255, 0.1)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Paste
                </button>
                <button
                  onClick={() => setShowSeed(!showSeed)}
                  style={styles.actionButton}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0, 5, 255, 0.1)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showSeed ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                  {showSeed ? 'Hide' : 'Show'}
                </button>
              </div>

              {/* Seed Phrase Grid */}
              <div style={styles.seedGrid}>
                {seedWords.map((word, index) => (
                  <div key={index}>
                    <div style={styles.seedNumber}>{index + 1}</div>
                    <input
                      type={showSeed ? 'text' : 'password'}
                      value={word}
                      onChange={(e) => handleWordChange(index, e.target.value)}
                      placeholder={`Word ${index + 1}`}
                      style={styles.seedInput}
                      onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = '#0005FF'; }}
                      onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                    />
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <button
                onClick={handleVerifySeedPhrase}
                disabled={seedWords.filter(w => w).length !== 12}
                style={{
                  ...styles.button,
                  marginBottom: '12px',
                  ...(seedWords.filter(w => w).length !== 12 ? styles.buttonDisabled : {})
                }}
                onMouseEnter={(e) => { if (seedWords.filter(w => w).length === 12) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
              >
                Continue
              </button>

              <button
                onClick={() => router.push('/login')}
                style={{...styles.button, ...styles.buttonSecondary}}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{animationStyles}</style>
      <div style={styles.container}>
        <div style={styles.backgroundPattern} />
        <div style={styles.wrapper}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.brandContainer}>
              <div style={styles.brandLine} />
              <h1 style={styles.brandName}>Sphyre</h1>
              <div style={styles.brandSubtitle}>Verifier Portal</div>
            </div>
            <h2 style={styles.headerTitle}>Set New PIN</h2>
            <p style={styles.headerSubtitle}>
              Create a new PIN to secure your account
            </p>
          </div>

          <div style={styles.card}>
            {error && (
              <div style={styles.errorBox}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: '#EF4444', flexShrink: 0}}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={styles.errorText}>{error}</span>
              </div>
            )}

            {/* PIN Input */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>New PIN (6 digits)</label>
              <div style={styles.inputWrapper}>
                <input
                  type={showNewPin ? 'text' : 'password'}
                  value={newPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) setNewPin(value);
                    setError('');
                  }}
                  placeholder="••••"
                  maxLength={6}
                  style={styles.input}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = '#0005FF'; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin(!showNewPin)}
                  style={styles.eyeButton}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8B8B9E'; }}
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showNewPin ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Confirm PIN Input */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirm New PIN</label>
              <div style={styles.inputWrapper}>
                <input
                  type={showConfirmPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) setConfirmPin(value);
                    setError('');
                  }}
                  placeholder="••••"
                  maxLength={6}
                  style={styles.input}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = '#0005FF'; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPin(!showConfirmPin)}
                  style={styles.eyeButton}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8B8B9E'; }}
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showConfirmPin ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleRecoverWithNewPin}
              disabled={loading || newPin.length < 4 || confirmPin.length < 4}
              style={{
                ...styles.button,
                ...(loading || newPin.length < 4 || confirmPin.length < 4 ? styles.buttonDisabled : {})
              }}
              onMouseEnter={(e) => { if (!loading && newPin.length >= 4 && confirmPin.length >= 4) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
            >
              {loading ? (
                <>
                  <div style={{width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #FFFFFF', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '8px', verticalAlign: 'middle'}}></div>
                  Recovering...
                </>
              ) : (
                'Recover Access'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
