'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deriveDIDFromSeedPhrase } from '@/utils/crypto';

export default function RecoverySeedPhrasePage() {
  const router = useRouter();
  const [seedWords, setSeedWords] = useState<string[]>(Array(12).fill(''));
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [step, setStep] = useState<'seed' | 'pin' | 'verifying'>('seed');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleWordChange = (index: number, value: string) => {
    const newWords = [...seedWords];
    newWords[index] = value.trim().toLowerCase();
    setSeedWords(newWords);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const words = pastedText.trim().split(/\s+/);
    if (words.length === 12) {
      setSeedWords(words.map(w => w.toLowerCase()));
    }
  };

  const handleContinue = () => {
    const filledWords = seedWords.filter(w => w.length > 0);
    if (filledWords.length !== 12) {
      setError('Please enter all 12 words');
      return;
    }

    const invalidWords = seedWords.filter(w => w.length < 3 || w.length > 10);
    if (invalidWords.length > 0) {
      setError('Some words appear invalid. Please check your seed phrase.');
      return;
    }

    setError('');
    setStep('pin');
  };

  const handleRecover = async () => {
    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);
    setError('');
    setStep('verifying');

    try {
      const seedPhrase = seedWords.join(' ');
      const did = await deriveDIDFromSeedPhrase(seedPhrase);
      
      console.log('Recovered DID:', did);
      const encryptedSeed = btoa(JSON.stringify({ seed: seedPhrase, pin }));

      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';
      const response = await fetch(`${API_BASE}/api/verifier/${encodeURIComponent(did)}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const verifierInfo = data.verifier || data;

        localStorage.setItem('verifierDID', did);
        localStorage.setItem('verifierInfo', JSON.stringify(verifierInfo));
        localStorage.setItem('verifier_seed_encrypted', encryptedSeed);

        console.log('Verifier recovered successfully');
        
        router.push('/VerifierHome');
      } else {
        throw new Error('Verifier not found with this seed phrase. Please check your words or create a new account.');
      }

    } catch (err) {
      console.error('Recovery error:', err);
      setError((err as Error).message || 'Failed to recover account. Please check your seed phrase.');
      setStep('seed');
    } finally {
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
      overflow: 'hidden' as const,
    },
    backgroundPattern: {
      position: 'absolute' as const,
      inset: 0,
      backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0, 5, 255, 0.1) 1px, transparent 0)',
      backgroundSize: '48px 48px',
      opacity: 0.3,
    },
    card: {
      width: '100%',
      maxWidth: '600px',
      background: 'rgba(15, 15, 15, 0.8)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '24px',
      padding: '32px 24px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      position: 'relative' as const,
      zIndex: 1,
    },
    header: {
      marginBottom: '32px',
      textAlign: 'center' as const,
    },
    title: {
      fontSize: '28px',
      fontWeight: '700',
      color: '#FFFFFF',
      marginBottom: '8px',
      letterSpacing: '-0.02em',
    },
    subtitle: {
      fontSize: '16px',
      color: '#8B8B9E',
      lineHeight: '1.5',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '10px',
      marginBottom: '24px',
    },
    wordInput: {
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '10px',
      padding: '10px 8px',
      color: '#FFFFFF',
      fontSize: '13px',
      textAlign: 'center' as const,
      outline: 'none',
      transition: 'all 0.2s',
      width: '100%',
      boxSizing: 'border-box' as const,
    },
    pinContainer: {
      marginBottom: '24px',
    },
    label: {
      display: 'block',
      fontSize: '14px',
      color: '#8B8B9E',
      marginBottom: '8px',
      fontWeight: '500',
    },
    pinInput: {
      width: '100%',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '16px',
      color: '#FFFFFF',
      fontSize: '18px',
      textAlign: 'center' as const,
      letterSpacing: '8px',
      outline: 'none',
      transition: 'all 0.2s',
      boxSizing: 'border-box' as const,
    },
    button: {
      width: '100%',
      padding: '16px',
      background: 'linear-gradient(135deg, #0005FF 0%, #0003CC 100%)',
      border: 'none',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      position: 'relative' as const,
      overflow: 'hidden' as const,
      marginTop: '24px',
    },
    buttonSecondary: {
      background: 'transparent',
      border: '2px solid rgba(255, 255, 255, 0.1)',
      marginTop: '12px',
    },
    error: {
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '12px',
      padding: '12px 16px',
      color: '#FCA5A5',
      fontSize: '14px',
      marginBottom: '20px',
      textAlign: 'center' as const,
    },
    info: {
      background: 'rgba(59, 130, 246, 0.1)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      borderRadius: '12px',
      padding: '16px',
      color: '#93C5FD',
      fontSize: '14px',
      marginBottom: '24px',
      lineHeight: '1.6',
    },
    loading: {
      textAlign: 'center' as const,
      padding: '40px',
      color: '#8B8B9E',
      fontSize: '16px',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.backgroundPattern} />
      
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.title}>
            {step === 'seed' ? 'Recover Account' : step === 'pin' ? 'Set PIN' : 'Verifying...'}
          </div>
          <div style={styles.subtitle}>
            {step === 'seed' ? 'Enter your 12-word seed phrase' : step === 'pin' ? 'Create a 6-digit PIN' : 'Please wait...'}
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {step === 'seed' && (
          <>
            <div style={styles.info}>
              Enter the seed phrase you received when creating your account. This will restore your Verifier DID and credentials.
            </div>

            <div style={styles.grid} onPaste={handlePaste}>
              {seedWords.map((word, index) => (
                <input
                  key={index}
                  type="text"
                  value={word}
                  onChange={(e) => handleWordChange(index, e.target.value)}
                  placeholder={`Word ${index + 1}`}
                  style={styles.wordInput}
                  autoComplete="off"
                  spellCheck="false"
                />
              ))}
            </div>

            <button
              onClick={handleContinue}
              style={styles.button}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              Continue
            </button>

            <button
              onClick={() => router.push('/onboarding')}
              style={{...styles.button, ...styles.buttonSecondary}}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              Back to Onboarding
            </button>
          </>
        )}

        {step === 'pin' && (
          <>
            <div style={styles.info}>
              Create a 6-digit PIN to protect your seed phrase. You&apos;ll use this PIN to unlock your account.
            </div>

            <div style={styles.pinContainer}>
              <label style={styles.label}>Enter 6-digit PIN</label>
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={styles.pinInput}
                placeholder="••••••"
              />
            </div>

            <div style={styles.pinContainer}>
              <label style={styles.label}>Confirm PIN</label>
              <input
                type={showPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={styles.pinInput}
                placeholder="••••••"
              />
            </div>

            <label style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#8B8B9E', marginBottom: '24px', cursor: 'pointer'}}>
              <input 
                type="checkbox" 
                checked={showPin} 
                onChange={(e) => setShowPin(e.target.checked)}
              />
              Show PIN
            </label>

            <button
              onClick={handleRecover}
              disabled={loading || pin.length !== 6 || confirmPin.length !== 6}
              style={{...styles.button, opacity: loading || pin.length !== 6 || confirmPin.length !== 6 ? 0.5 : 1}}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {loading ? 'Recovering...' : 'Recover Account'}
            </button>

            <button
              onClick={() => setStep('seed')}
              style={{...styles.button, ...styles.buttonSecondary}}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              Back
            </button>
          </>
        )}

        {step === 'verifying' && (
          <div style={styles.loading}>
            <div style={{fontSize: '18px', marginBottom: '20px', color: '#6B7280'}}>Loading</div>
            <div>Verifying your seed phrase...</div>
            <div style={{fontSize: '14px', marginTop: '8px'}}>This may take a moment</div>
          </div>
        )}
      </div>
    </div>
  );
}
