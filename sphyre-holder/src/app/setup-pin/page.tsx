'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Check, AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import walletService from '@/services/walletService';
import type { EncryptedSeedSyncResult } from '@/services/walletService';

export default function SetupPinPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [syncResult, setSyncResult] = useState<EncryptedSeedSyncResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const storedSeed = walletService.getSeedPhraseFromSession();
    if (!storedSeed) {
      router.push('/recovery');
      return;
    }
    setSeedPhrase(storedSeed);
  }, [router]);

  const handleSubmit = async () => {
    if (pin.length !== 6) {
      setError('PIN must be exactly 6 digits');
      return;
    }
    
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    
    setSubmitting(true);
    try {
      // Enable persistent login and attempt backend sync
      const result = await walletService.enablePersistentLogin(seedPhrase, pin);
      setSyncResult(result);

      if (!result.synced && result.errorMessage) {
        setError(result.errorMessage);
        return;
      }

      walletService.setSessionAuthenticated(true);
      
      // Clear seed phrase from session
      walletService.clearSeedPhraseFromSession();
      
      router.push('/SSIWalletIdentity');
    } catch (err) {
      console.error('Failed to set PIN:', err);
      setError('Failed to set PIN. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const retrySync = async () => {
    if (!syncResult || syncResult.synced) return;

    try {
      setSubmitting(true);
      const status = await walletService.refreshEncryptedSeedStatus();
      if (status?.has_encrypted_seed) {
        setSyncResult({ synced: true, status });
        setError('');
      } else {
        setSyncResult({
          synced: false,
          status,
          reason: syncResult.reason,
          errorMessage: 'Encrypted seed not yet available on backend. Try again after finishing wallet login.',
        });
      }
    } catch (err) {
      console.error('Failed to refresh encrypted seed status:', err);
      setSyncResult({
        synced: false,
        reason: 'network_error',
        errorMessage: 'Network error while checking backend status. Please retry later.',
      });
    } finally {
      setSubmitting(false);
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
      maxWidth: '480px',
      position: 'relative' as const,
      zIndex: 1,
    },
    card: {
      background: 'rgba(15, 15, 15, 0.8)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '24px',
      padding: '40px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 5, 255, 0.1)',
      animation: 'fadeInScale 0.5s ease-out',
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '32px',
    },
    iconContainer: {
      width: '80px',
      height: '80px',
      background: 'linear-gradient(135deg, rgba(0, 5, 255, 0.15) 0%, rgba(0, 5, 255, 0.05) 100%)',
      border: '2px solid rgba(0, 5, 255, 0.2)',
      borderRadius: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 24px',
    },
    icon: {
      width: '40px',
      height: '40px',
      color: '#0005FF',
    },
    title: {
      fontSize: '28px',
      fontWeight: '700' as const,
      color: '#FFFFFF',
      marginBottom: '12px',
      letterSpacing: '-0.02em',
    },
    subtitle: {
      fontSize: '15px',
      color: '#8B8B9E',
      lineHeight: '1.6',
    },
    errorBox: {
      padding: '16px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '12px',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    },
    errorIcon: {
      width: '20px',
      height: '20px',
      color: '#F87171',
      flexShrink: 0,
      marginTop: '2px',
    },
    errorText: {
      fontSize: '14px',
      color: '#FCA5A5',
      lineHeight: '1.5',
    },
    inputGroup: {
      marginBottom: '20px',
    },
    label: {
      fontSize: '14px',
      fontWeight: '500' as const,
      color: '#8B8B9E',
      marginBottom: '8px',
      display: 'block',
    },
    inputWrapper: {
      position: 'relative' as const,
    },
    input: {
      width: '100%',
      padding: '16px 50px 16px 16px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '24px',
      fontWeight: '600' as const,
      letterSpacing: '0.4em',
      textAlign: 'center' as const,
      outline: 'none',
      transition: 'all 0.3s ease',
    },
    inputFocus: {
      borderColor: '#0005FF',
      boxShadow: '0 0 0 3px rgba(0, 5, 255, 0.1)',
    },
    eyeButton: {
      position: 'absolute' as const,
      right: '16px',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: '8px',
      borderRadius: '8px',
      transition: 'background 0.2s ease',
    },
    eyeIcon: {
      width: '20px',
      height: '20px',
      color: '#52525E',
    },
    buttonGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
      marginTop: '32px',
    },
    buttonPrimary: {
      width: '100%',
      padding: '18px 24px',
      background: 'linear-gradient(135deg, #0005FF 0%, #0003CC 100%)',
      border: 'none',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '16px',
      fontWeight: '600' as const,
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: '0 4px 20px rgba(0, 5, 255, 0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    },
    buttonPrimaryDisabled: {
      opacity: 0.4,
      cursor: 'not-allowed',
      boxShadow: 'none',
    },
    buttonSecondary: {
      width: '100%',
      padding: '14px 24px',
      background: 'transparent',
      border: 'none',
      borderRadius: '12px',
      color: '#8B8B9E',
      fontSize: '14px',
      fontWeight: '500' as const,
      cursor: 'pointer',
      transition: 'color 0.2s ease',
    },
    infoBox: {
      marginTop: '24px',
      padding: '20px',
      background: 'rgba(0, 5, 255, 0.05)',
      border: '1px solid rgba(0, 5, 255, 0.15)',
      borderRadius: '16px',
      display: 'flex',
      gap: '12px',
    },
    infoIcon: {
      width: '20px',
      height: '20px',
      color: '#0005FF',
      flexShrink: 0,
      marginTop: '2px',
    },
    infoContent: {
      flex: 1,
    },
    infoTitle: {
      fontSize: '14px',
      fontWeight: '600' as const,
      color: '#FFFFFF',
      marginBottom: '4px',
    },
    infoText: {
      fontSize: '13px',
      color: '#8B8B9E',
      lineHeight: '1.6',
    },
    statusBox: {
      marginTop: '20px',
      padding: '16px',
      borderRadius: '12px',
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start',
    },
    statusIcon: {
      width: '20px',
      height: '20px',
      flexShrink: 0,
      marginTop: '2px',
    },
    statusContent: {
      flex: 1,
    },
    statusTitle: {
      fontSize: '14px',
      fontWeight: '600' as const,
      color: '#FFFFFF',
      marginBottom: '4px',
    },
    statusText: {
      fontSize: '13px',
      color: '#8B8B9E',
      lineHeight: '1.6',
    },
    retryButton: {
      marginTop: '12px',
      padding: '10px 14px',
      borderRadius: '10px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      color: '#FFFFFF',
      background: 'rgba(255, 255, 255, 0.05)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
    },
  };

  return (
    <>
      <style jsx global>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
      
      <div style={styles.container}>
        <div style={styles.backgroundPattern} />
        
        <div style={styles.wrapper}>
          <div style={styles.card}>
            <div style={styles.header}>
              <div style={styles.iconContainer}>
                <Lock style={styles.icon} />
              </div>
              <h1 style={styles.title}>Set Your PIN</h1>
              <p style={styles.subtitle}>
                Create a 6-digit PIN to quickly unlock your wallet without entering your seed phrase every time
              </p>
            </div>
            
            {error && (
              <div style={styles.errorBox}>
                <AlertCircle style={styles.errorIcon} />
                <p style={styles.errorText}>{error}</p>
              </div>
            )}
            
            <div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  Enter PIN (6 digits)
                </label>
                <div style={styles.inputWrapper}>
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, ''));
                      setError('');
                    }}
                    style={styles.input}
                    placeholder="••••••"
                    onFocus={(e) => {
                      e.target.style.borderColor = '#0005FF';
                      e.target.style.boxShadow = '0 0 0 3px rgba(0, 5, 255, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    style={styles.eyeButton}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {showPin ? <EyeOff style={styles.eyeIcon} /> : <Eye style={styles.eyeIcon} />}
                  </button>
                </div>
              </div>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  Confirm PIN
                </label>
                <div style={styles.inputWrapper}>
                  <input
                    type={showConfirmPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.target.style.boxShadow = 'none';
                    }}
                    onChange={(e) => {
                      setConfirmPin(e.target.value.replace(/\D/g, ''));
                      setError('');
                    }}
                    style={styles.input}
                    placeholder="••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPin(!showConfirmPin)}
                    style={styles.eyeButton}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {showConfirmPin ? <EyeOff style={styles.eyeIcon} /> : <Eye style={styles.eyeIcon} />}
                  </button>
                </div>
              </div>
              
              <div style={styles.buttonGroup}>
                <button
                  onClick={handleSubmit}
                  disabled={pin.length !== 6 || confirmPin.length !== 6 || submitting}
                  style={{
                    ...styles.buttonPrimary,
                    ...(pin.length !== 6 || confirmPin.length !== 6 || submitting ? styles.buttonPrimaryDisabled : {}),
                  }}
                  onMouseEnter={(e) => {
                    if (pin.length === 6 && confirmPin.length === 6 && !submitting) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 5, 255, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 5, 255, 0.3)';
                  }}
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="animate-spin" style={{ width: '20px', height: '20px' }} />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Check style={{ width: '20px', height: '20px' }} />
                      Set PIN & Continue
                    </>
                  )}
                </button>
              </div>

              {syncResult && (
                <div
                  style={{
                    ...styles.statusBox,
                    background:
                      syncResult.synced
                        ? 'rgba(34, 197, 94, 0.1)'
                        : syncResult.reason === 'network_error'
                        ? 'rgba(234, 179, 8, 0.08)'
                        : 'rgba(239, 68, 68, 0.08)',
                    border:
                      syncResult.synced
                        ? '1px solid rgba(34, 197, 94, 0.3)'
                        : syncResult.reason === 'network_error'
                        ? '1px solid rgba(234, 179, 8, 0.2)'
                        : '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <AlertCircle
                    style={{
                      ...styles.statusIcon,
                      color: syncResult.synced ? '#34D399' : syncResult.reason === 'network_error' ? '#FBBF24' : '#F87171',
                    }}
                  />
                  <div style={styles.statusContent}>
                    <p style={styles.statusTitle}>
                      {syncResult.synced
                        ? 'Encrypted seed synced to backend'
                        : syncResult.reason === 'network_error'
                        ? 'Sync will retry automatically'
                        : 'Encrypted seed stored locally only'}
                    </p>
                    <p style={styles.statusText}>
                      {syncResult.synced
                        ? 'You can unlock your wallet on other devices using this PIN.'
                        : syncResult.errorMessage ||
                          'We could not confirm the encrypted seed is available on the backend yet.'}
                    </p>

                    {!syncResult.synced && (
                      <button
                        type="button"
                        style={styles.retryButton}
                        onClick={retrySync}
                        disabled={submitting}
                      >
                        <RefreshCw style={{ width: '18px', height: '18px' }} />
                        Retry Sync
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div style={styles.infoBox}>
                <Lock style={styles.infoIcon} />
                <div style={styles.infoContent}>
                  <p style={styles.infoTitle}>Convenient & Secure</p>
                  <p style={styles.infoText}>
                    Your seed phrase will be encrypted locally. You&apos;ll only need your PIN to unlock your wallet in future sessions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
