'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ChevronLeft, Eye, EyeOff, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import walletService from '@/services/walletService';
import type { EncryptedSeedSyncResult } from '@/services/walletService';

export default function ChangePINPage() {
  const router = useRouter();
  const { addToast } = useToast();
  
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<EncryptedSeedSyncResult | null>(null);

  const handleSubmit = async () => {
    setError('');
    setSyncResult(null);
    
    if (currentPin.length !== 6) {
      setError('Current PIN must be 6 digits');
      return;
    }
    
    if (newPin.length !== 6) {
      setError('New PIN must be 6 digits');
      return;
    }
    
    if (newPin !== confirmPin) {
      setError('New PINs do not match');
      return;
    }
    
    if (currentPin === newPin) {
      setError('New PIN must be different from current PIN');
      return;
    }
    
    setLoading(true);
    
    try {
      const encrypted = await walletService.getEncryptedSeed();
      if (!encrypted) {
        setError('No encrypted seed was found. Please set up your PIN first so we can secure your wallet.');
        return;
      }

      const { decryptData, encryptData } = await import('@/lib/crypto');
      let seedPhrase;
      
      try {
        seedPhrase = decryptData(encrypted, currentPin);
      } catch {
        setError('Current PIN is incorrect');
        setLoading(false);
        return;
      }
      
      const newEncrypted = encryptData(seedPhrase, newPin);

      const result = await walletService.updateEncryptedSeed(newEncrypted);
      setSyncResult(result);

      if (!result.synced && result.errorMessage) {
        addToast(result.errorMessage, 'warning');
      }

      addToast('PIN changed successfully', 'success');
      
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      
      setTimeout(() => {
        router.push('/UserProfile');
      }, 1500);
      
    } catch (err) {
      console.error('Change PIN error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to change PIN. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.backgroundPattern} />
      
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.header}>
            <button onClick={() => router.push('/UserProfile')} style={styles.backButton}>
              <ChevronLeft size={24} />
            </button>
            <div style={styles.iconContainer}>
              <Lock size={32} color="#0005FF" />
            </div>
            <h1 style={styles.title}>Change PIN</h1>
            <p style={styles.subtitle}>
              Update your PIN for enhanced security
            </p>
          </div>

          <div style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Current PIN</label>
              <div style={styles.inputWrapper}>
                <input
                  type={showCurrentPin ? 'text' : 'password'}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter current PIN"
                  style={styles.input}
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPin(!showCurrentPin)}
                  style={styles.eyeButton}
                >
                  {showCurrentPin ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>New PIN (6 digits)</label>
              <div style={styles.inputWrapper}>
                <input
                  type={showNewPin ? 'text' : 'password'}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter new PIN"
                  style={styles.input}
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin(!showNewPin)}
                  style={styles.eyeButton}
                >
                  {showNewPin ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirm New PIN</label>
              <div style={styles.inputWrapper}>
                <input
                  type={showConfirmPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Confirm new PIN"
                  style={styles.input}
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPin(!showConfirmPin)}
                  style={styles.eyeButton}
                >
                  {showConfirmPin ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={styles.error}>
                {error}
              </div>
            )}

            {syncResult && (
              <div
                style={{
                  ...styles.statusBox,
                  background: syncResult.synced
                    ? 'rgba(34, 197, 94, 0.1)'
                    : syncResult.reason === 'network_error'
                    ? 'rgba(234, 179, 8, 0.08)'
                    : 'rgba(239, 68, 68, 0.08)',
                  border: syncResult.synced
                    ? '1px solid rgba(34, 197, 94, 0.3)'
                    : syncResult.reason === 'network_error'
                    ? '1px solid rgba(234, 179, 8, 0.2)'
                    : '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                <div
                  style={{
                    ...styles.statusIcon,
                    color: syncResult.synced ? '#34D399' : syncResult.reason === 'network_error' ? '#FBBF24' : '#F87171',
                  }}
                >
                  <AlertIcon synced={syncResult.synced} reason={syncResult.reason} />
                </div>
                <div style={styles.statusContent}>
                  <p style={styles.statusTitle}>
                    {syncResult.synced
                      ? 'Encrypted seed updated everywhere'
                      : syncResult.reason === 'network_error'
                      ? 'Backend will sync once connection restores'
                      : 'Encrypted seed updated locally'}
                  </p>
                  <p style={styles.statusText}>
                    {syncResult.synced
                      ? 'You can now unlock your wallet on other devices with the new PIN.'
                      : syncResult.errorMessage ||
                        'We couldn’t confirm the backend has the encrypted seed yet. Keep this browser open or retry later.'}
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !currentPin || !newPin || !confirmPin}
              style={{
                ...styles.submitButton,
                ...(loading || !currentPin || !newPin || !confirmPin ? styles.submitButtonDisabled : {}),
              }}
            >
              {loading ? (
                <>
                  <RefreshCw className="animate-spin" size={18} />
                  <span>Changing PIN...</span>
                </>
              ) : (
                <>
                  <Check size={20} />
                  <span>Change PIN</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertIcon({ synced, reason }: { synced: boolean; reason?: EncryptedSeedSyncResult['reason'] }) {
  if (synced) {
    return <Check size={20} />;
  }
  if (reason === 'network_error') {
    return <RefreshCw size={20} />;
  }
  return <AlertCircle size={20} />;
}

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
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '32px',
    position: 'relative' as const,
  },
  backButton: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    background: 'transparent',
    border: 'none',
    color: '#FFFFFF',
    cursor: 'pointer',
    padding: '8px',
  },
  iconContainer: {
    width: '80px',
    height: '80px',
    margin: '0 auto 16px',
    background: 'rgba(0, 5, 255, 0.1)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#8B8B9E',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500' as const,
    color: '#FFFFFF',
  },
  inputWrapper: {
    position: 'relative' as const,
  },
  input: {
    width: '100%',
    padding: '16px 50px 16px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    color: '#FFFFFF',
    fontSize: '16px',
    outline: 'none',
  },
  eyeButton: {
    position: 'absolute' as const,
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: '#8B8B9E',
    cursor: 'pointer',
    padding: '4px',
  },
  error: {
    padding: '12px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    color: '#F87171',
    fontSize: '14px',
  },
  info: {
    padding: '16px',
    background: 'rgba(0, 5, 255, 0.05)',
    border: '1px solid rgba(0, 5, 255, 0.1)',
    borderRadius: '12px',
    color: '#8B8B9E',
    fontSize: '13px',
  },
  submitButton: {
    width: '100%',
    padding: '16px',
    background: '#0005FF',
    border: 'none',
    borderRadius: '12px',
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '600' as const,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  submitButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  statusBox: {
    marginTop: '16px',
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
};
