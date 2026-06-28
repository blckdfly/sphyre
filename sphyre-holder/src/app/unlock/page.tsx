'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import walletService from '@/services/walletService';

export default function UnlockPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    if (pin.length < 4) {
      setError('Please enter your 4-digit PIN');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const isValid = await walletService.verifyPin(pin);
      if (isValid) {
        walletService.setSessionAuthenticated(true);
        router.push('/SSIWalletIdentity');
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch {
      setError('Failed to verify PIN. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = () => {
    walletService.disablePersistentLogin();
    walletService.setSessionAuthenticated(false);
    router.push('/recovery');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pin.length >= 4) {
      handleUnlock();
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
      backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0, 5, 255, 0.1) 1px, transparent 0)',
      backgroundSize: '48px 48px',
      opacity: 0.3,
    },
    wrapper: {
      width: '100%',
      maxWidth: '420px',
      position: 'relative' as const,
      zIndex: 1,
    },
    card: {
      background: 'rgba(15, 15, 15, 0.8)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '24px',
      padding: '48px 40px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 5, 255, 0.1)',
      animation: 'fadeInScale 0.5s ease-out',
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '40px',
    },
    iconContainer: {
      width: '80px',
      height: '80px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #0005FF 0%, #0003CC 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 24px',
      boxShadow: '0 10px 40px rgba(0, 5, 255, 0.4)',
      animation: 'scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    title: {
      fontSize: '28px',
      fontWeight: '700' as const,
      color: '#FFFFFF',
      marginBottom: '8px',
      letterSpacing: '-0.02em',
    },
    subtitle: {
      fontSize: '15px',
      color: '#8B8B9E',
      lineHeight: '1.6',
    },
    inputGroup: {
      marginBottom: '24px',
    },
    label: {
      display: 'block',
      fontSize: '13px',
      fontWeight: '600' as const,
      color: '#FFFFFF',
      marginBottom: '10px',
      letterSpacing: '0.02em',
    },
    input: {
      width: '100%',
      padding: '16px 20px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '24px',
      letterSpacing: '8px',
      textAlign: 'center' as const,
      outline: 'none',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      fontFamily: 'monospace',
    },
    errorBox: {
      padding: '14px 16px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '12px',
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      animation: 'shake 0.3s ease-in-out',
    },
    errorText: {
      fontSize: '13px',
      color: '#EF4444',
      lineHeight: '1.5',
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
    linkButton: {
      width: '100%',
      padding: '14px',
      background: 'transparent',
      border: 'none',
      color: '#8B8B9E',
      fontSize: '14px',
      fontWeight: '500' as const,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      textAlign: 'center' as const,
    },
    footer: {
      textAlign: 'center' as const,
      fontSize: '12px',
      color: '#52525E',
      marginTop: '24px',
    },
  };

  const animationStyles = `
    @keyframes fadeInScale {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes scaleIn {
      from { transform: scale(0); }
      to { transform: scale(1); }
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }
  `;

  return (
    <>
      <style>{animationStyles}</style>
      <div style={styles.container}>
        <div style={styles.backgroundPattern} />
        
        <div style={styles.wrapper}>
          <div style={styles.card}>
            <div style={styles.header}>
              <div style={styles.iconContainer}>
                <Image src="/icons/sphyre.svg" alt="Sphyre" width={50} height={50} priority />
              </div>
              <h1 style={styles.title}>Good to See You</h1>
              <p style={styles.subtitle}>Enter your PIN to unlock your wallet</p>
            </div>

            {error && (
              <div style={styles.errorBox}>
                <svg width="18" height="18" fill="none" stroke="#EF4444" viewBox="0 0 24 24" style={{flexShrink: 0}}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={styles.errorText}>{error}</span>
              </div>
            )}

            <div style={styles.inputGroup}>
              <label style={styles.label}>PIN Code</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyPress={handleKeyPress}
                placeholder="••••"
                style={styles.input}
                autoFocus
                onFocus={(e) => {
                  e.target.style.borderColor = '#0005FF';
                  e.target.style.background = 'rgba(0, 5, 255, 0.05)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.03)';
                }}
              />
            </div>

            <button
              onClick={handleUnlock}
              disabled={loading || pin.length < 4}
              style={{...styles.button, opacity: loading || pin.length < 4 ? 0.5 : 1}}
              onMouseEnter={(e) => {
                if (!loading && pin.length >= 4) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 30px rgba(0, 5, 255, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 5, 255, 0.3)';
              }}
            >
              {loading ? 'Unlocking...' : 'Unlock Wallet'}
            </button>

            <button
              onClick={handleForgot}
              style={styles.linkButton}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#0005FF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#8B8B9E';
              }}
            >
              Forgot PIN? Recover with seed phrase →
            </button>
          </div>

          <p style={styles.footer}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                lineHeight: 1,
              }}
            >
              <span style={{ paddingBottom: '2px', display: 'inline-block' }}>Powered by</span>
              <Image
                src="/assets/sphyre-text.png"
                alt="Sphyre logo"
                width={72}
                height={18}
                style={{ objectFit: 'contain', display: 'block' }}
                priority
              />
            </span>
          </p>
        </div>
      </div>
    </>
  );
}
