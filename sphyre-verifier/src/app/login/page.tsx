'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import verifierAuthService from '../../services/verifierAuthService';

interface AuthData {
  did: string;
  name: string;
  organization: string;
  domain: string;
  description?: string;
  website?: string;
  logoUrl?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifierInfo, setVerifierInfo] = useState<AuthData | null>(null);

  useEffect(() => {
    if (verifierAuthService.isSessionAuthenticated()) {
      router.push('/VerifierHome');
      return;
    }
    const authData = verifierAuthService.getAuthData();
    if (!authData) {
      router.push('/onboarding');
      return;
    }

    setVerifierInfo(authData);
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pin.length < 4) {
      setError('Please enter your PIN');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifierAuthService.loginWithPIN(pin);
 
      router.push('/VerifierHome');
    } catch (error: unknown) {
      console.error('Login error:', error);
      setError(error instanceof Error ? error.message : 'Incorrect PIN. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 6) {
      setPin(digits);
      setError('');
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
      margin: '8px 0 0 0',
    },
    issuerInfo: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      gap: '4px',
      marginTop: '16px',
      padding: '16px',
      background: 'rgba(0, 5, 255, 0.05)',
      borderRadius: '12px',
      border: '1px solid rgba(0, 5, 255, 0.1)',
    },
    issuerName: {
      fontSize: '16px',
      fontWeight: '600' as const,
      color: '#FFFFFF',
    },
    issuerDomain: {
      fontSize: '13px',
      color: '#8B8B9E',
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
      marginBottom: '16px',
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
    link: {
      color: '#0005FF',
      textDecoration: 'none',
      fontSize: '14px',
      fontWeight: '500' as const,
      transition: 'all 0.3s ease',
      display: 'block',
      textAlign: 'center' as const,
      padding: '8px',
      borderRadius: '8px',
    },
    securityNote: {
      marginTop: '24px',
      padding: '16px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    },
    securityText: {
      fontSize: '12px',
      color: '#52525E',
      lineHeight: '1.5',
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
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;

  if (!verifierInfo) {
    return (
      <>
        <style>{animationStyles}</style>
        <div style={styles.container}>
          <div style={styles.backgroundPattern} />
          <div style={{textAlign: 'center'}}>
            <div style={{width: '48px', height: '48px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #0005FF', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px'}}></div>
            <p style={{...styles.headerSubtitle, animation: 'pulse 2s ease-in-out infinite'}}>Loading...</p>
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
            <h2 style={styles.headerTitle}>Welcome Back</h2>
            <div style={styles.issuerInfo}>
              <div style={styles.issuerName}>{verifierInfo.name}</div>
              <div style={styles.issuerDomain}>{verifierInfo.domain}</div>
            </div>
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
            <form onSubmit={handleLogin}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Enter your PIN</label>
                <div style={styles.inputWrapper}>
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => handlePinChange(e.target.value)}
                    autoFocus
                    placeholder="••••"
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
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={pin.length < 4 || loading}
                style={{
                  ...styles.button,
                  ...(pin.length < 4 || loading ? styles.buttonDisabled : {})
                }}
                onMouseEnter={(e) => { if (pin.length >= 4 && !loading) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
              >
                {loading ? (
                  <>
                    <div style={{width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #FFFFFF', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '8px', verticalAlign: 'middle'}}></div>
                    Logging in...
                  </>
                ) : (
                  'Unlock Dashboard'
                )}
              </button>
            </form>

            {/* Recovery Link */}
            <Link
              href="/recovery"
              style={styles.link}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0, 5, 255, 0.1)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
            >
              Forgot your PIN? Use seed phrase
            </Link>

            {/* Security Note */}
            <div style={styles.securityNote}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: '#52525E', flexShrink: 0, marginTop: '2px'}}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p style={styles.securityText}>
                Your credentials are encrypted and stored securely on this device only.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
