'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import verifierAuthService from '../../services/verifierAuthService';

interface VerifierData {
  id: string;
  name: string;
  organization: string;
  domain: string;
  description?: string;
  website?: string;
  logo_url?: string;
}

export default function SetupPinPage() {
  const router = useRouter();
  
  const [verifierData, setVerifierData] = useState<VerifierData | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  useEffect(() => {
    const storedSeed = sessionStorage.getItem('temp_seed_phrase');
    const storedData = sessionStorage.getItem('temp_verifier_data');
    
    if (!storedSeed || !storedData) {
      setIsRedirecting(true);
      router.push('/onboarding');
      return;
    }
    
    setSeedPhrase(storedSeed);
    setVerifierData(JSON.parse(storedData));
  }, [router]);

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    if (pin.length > 6) {
      setError('PIN must be at most 6 digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifierAuthService.setupAuth(verifierData!, seedPhrase, pin);

      // Store verifierDID for app auth check
      localStorage.setItem('verifierDID', verifierData!.id);
      localStorage.setItem('verifierInfo', JSON.stringify(verifierData!));

      // Clear temporary session data
      sessionStorage.removeItem('temp_seed_phrase');
      sessionStorage.removeItem('temp_verifier_data');

      // Navigate to verifier home
      router.push('/VerifierHome');
    } catch (error: unknown) {
      console.error('Setup error:', error);
      setError(error instanceof Error ? error.message : 'Failed to setup PIN. Please try again.');
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
      maxWidth: '500px',
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
    progressContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '48px',
    },
    progressDot: {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      transition: 'all 0.3s ease',
    },
    progressLine: {
      width: '40px',
      height: '2px',
      transition: 'all 0.3s ease',
    },
    card: {
      background: 'rgba(15, 15, 20, 0.5)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '24px',
      padding: '48px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 5, 255, 0.1)',
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
    hint: {
      fontSize: '12px',
      color: '#52525E',
      marginTop: '8px',
      textAlign: 'center' as const,
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
      marginTop: '16px',
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
  };

  const animationStyles = `
    @keyframes fadeInScale {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  if (isRedirecting || !seedPhrase) {
    return (
      <>
        <style>{animationStyles}</style>
        <div style={styles.container}>
          <div style={styles.backgroundPattern} />
          <div style={{textAlign: 'center'}}>
            <div style={{width: '48px', height: '48px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #0005FF', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px'}}></div>
            <p style={{...styles.headerSubtitle, animation: 'pulse 2s ease-in-out infinite'}}>
              {isRedirecting ? 'Redirecting...' : 'Loading...'}
            </p>
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
            <h2 style={styles.headerTitle}>Setup Your PIN</h2>
            <p style={styles.headerSubtitle}>
              Create a secure 6 digit PIN for quick access
            </p>
          </div>

          {/* Progress */}
          <div style={styles.progressContainer}>
            {['complete', 'complete', 'complete', 'in_progress'].map((s, i) => (
              <React.Fragment key={i}>
                <div style={{
                  ...styles.progressDot,
                  background: s === 'pending' ? 'rgba(255, 255, 255, 0.1)' : '#0005FF',
                  transform: s === 'in_progress' ? 'scale(1.5)' : 'scale(1)',
                }} />
                {i < 3 && <div style={{...styles.progressLine, background: '#0005FF'}} />}
              </React.Fragment>
            ))}
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
              <label style={styles.label}>Enter PIN</label>
              <div style={styles.inputWrapper}>
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) setPin(value);
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
                  onClick={() => setShowPin(!showPin)}
                  style={styles.eyeButton}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8B8B9E'; }}
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
              <div style={styles.hint}>6 digits</div>
            </div>

            {/* Confirm PIN Input */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirm PIN</label>
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
              <div style={styles.hint}>Re-enter your PIN</div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={loading || !pin || !confirmPin}
              style={{
                ...styles.button,
                ...(loading || !pin || !confirmPin ? styles.buttonDisabled : {})
              }}
              onMouseEnter={(e) => { if (!loading && pin && confirmPin) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
            >
              {loading ? (
                <>
                  <div style={{width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #FFFFFF', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '8px', verticalAlign: 'middle'}}></div>
                  Setting up...
                </>
              ) : (
                'Complete Setup'
              )}
            </button>
          </div>

          <p style={{textAlign: 'center', fontSize: '12px', color: '#52525E', marginTop: '24px'}}>
            Your PIN is encrypted and stored securely
          </p>
        </div>
      </div>
    </>
  );
}
