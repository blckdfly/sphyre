'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import walletService from '@/services/walletService';
import type { EncryptedSeedSyncResult } from '@/services/walletService';
import { useToast } from '@/contexts/ToastContext';

export default function RecoveryPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [seedWords, setSeedWords] = useState<string[]>(Array(12).fill(''));
  const [showSeed, setShowSeed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<EncryptedSeedSyncResult | null>(null);

  useEffect(() => {
    if (walletService.isSessionAuthenticated()) {
      addToast('You are already logged in', 'info');
      router.push('/SSIWalletIdentity');
      return;
    }
  }, [router, addToast]);

  const handleSeedWordChange = (index: number, value: string) => {
    const newWords = [...seedWords];
    newWords[index] = value.toLowerCase().trim();
    setSeedWords(newWords);
  };

  const handlePasteSeedPhrase = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const words = text.trim().toLowerCase().split(/\s+/);
      if (words.length !== 12) {
        addToast('Seed phrase must contain exactly 12 words', 'error');
        return;
      }
      setSeedWords(words);
      addToast('Seed phrase pasted', 'success');
    } catch {
      addToast('Failed to paste from clipboard', 'error');
    }
  };

  const handleRecoverWithSeedPhrase = async () => {
    setIsLoading(true);
    try {
      const finalSeedPhrase = seedWords.filter(word => word).join(' ');
      if (finalSeedPhrase.split(' ').length !== 12) {
        addToast('Please enter all 12 words', 'error');
        setIsLoading(false);
        return;
      }
      await walletService.recoverFromSeedPhrase(finalSeedPhrase);
      walletService.setSessionAuthenticated(true);
      walletService.storeSeedPhraseInSession(finalSeedPhrase);

      const status = await walletService.refreshEncryptedSeedStatus();
      let result: EncryptedSeedSyncResult;
      if (status && status.has_encrypted_seed) {
        result = { synced: true, status };
        setSyncResult(result);
        addToast('Wallet recovered successfully! Your PIN backup was also found.', 'success');
        setIsLoading(false);
        router.push('/SSIWalletIdentity');
        return;
      }

      if (!status) {
        result = {
          synced: false,
          reason: 'missing_auth',
          errorMessage: 'Encrypted seed is not available on the backend yet. Please set a PIN to protect your wallet.',
        };
      } else {
        result = {
          synced: false,
          status,
          reason: 'backend_error',
          errorMessage: 'Encrypted seed backup was not found on the backend. Please set up a PIN to create one.',
        };
      }

      setSyncResult(result);
      addToast('Wallet recovered! Let’s set a PIN so you can unlock with it next time.', 'info');
      setIsLoading(false);
      router.push('/setup-pin');
    } catch {
      addToast('Invalid seed phrase. Please check and try again.', 'error');
      setIsLoading(false);
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
      maxWidth: '600px',
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
    backButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px',
      background: 'transparent',
      border: 'none',
      color: '#8B8B9E',
      fontSize: '14px',
      fontWeight: '500' as const,
      cursor: 'pointer',
      marginBottom: '24px',
      transition: 'color 0.2s ease',
    },
    brandLine: {
      width: '60px',
      height: '3px',
      background: 'linear-gradient(90deg, transparent, #0005FF, transparent)',
      margin: '0 auto 16px',
      borderRadius: '2px',
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
    methodCard: {
      padding: '16px 20px',
      background: 'rgba(255, 255, 255, 0.02)',
      border: '2px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      textAlign: 'center' as const,
    },
    methodTitle: {
      fontSize: '15px',
      fontWeight: '600' as const,
      color: '#FFFFFF',
      marginTop: '8px',
    },
    seedGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '12px',
      marginBottom: '24px',
    },
    seedInputWrapper: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '6px',
      minWidth: 0,
    },
    seedNumber: {
      fontSize: '10px',
      color: '#52525E',
      fontWeight: '600' as const,
      letterSpacing: '0.03em',
    },
    seedInput: {
      width: '100%',
      padding: '10px 12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '10px',
      color: '#FFFFFF',
      fontSize: '13px',
      outline: 'none',
      transition: 'all 0.3s ease',
      fontFamily: 'monospace',
      minHeight: '40px',
      boxSizing: 'border-box' as const,
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
      marginTop: '8px',
    },
    buttonSecondary: {
      background: 'transparent',
      border: '2px solid rgba(255, 255, 255, 0.1)',
      boxShadow: 'none',
      marginTop: '12px',
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
  `;

  return (
    <>
      <style>{animationStyles}</style>
      <div style={styles.container}>
        <div style={styles.backgroundPattern} />
        
        <div style={styles.wrapper}>
          <div style={styles.card}>
            <button
              style={styles.backButton}
              onClick={() => router.push('/onboarding')}
              onMouseEnter={(e) => e.currentTarget.style.color = '#0005FF'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#8B8B9E'}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div style={styles.header}>
              <div style={styles.brandLine} />
              <h1 style={styles.title}>Recover Wallet</h1>
              <p style={styles.subtitle}>
                Restore access to your wallet using your recovery method
              </p>
            </div>


                <div style={{marginBottom: '16px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                    <label style={{fontSize: '13px', fontWeight: '600', color: '#FFFFFF'}}>
                      Recovery Phrase (12 words)
                    </label>
                    <div style={{display: 'flex', gap: '8px'}}>
                      <button
                        onClick={handlePasteSeedPhrase}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          color: '#8B8B9E',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Paste
                      </button>
                      <button
                        onClick={() => setShowSeed(!showSeed)}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          color: '#8B8B9E',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {showSeed ? (
                          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                        {showSeed ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                  <div style={styles.seedGrid}>
                    {seedWords.map((word, index) => (
                      <div key={index} style={styles.seedInputWrapper}>
                        <span style={styles.seedNumber}>#{index + 1}</span>
                        <input
                          type={showSeed ? 'text' : 'password'}
                          value={word}
                          onChange={(e) => handleSeedWordChange(index, e.target.value)}
                          placeholder="word"
                          style={styles.seedInput}
                          onFocus={(e) => e.target.style.borderColor = '#0005FF'}
                          onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleRecoverWithSeedPhrase}
                  disabled={isLoading || seedWords.filter(w => w).length < 12}
                  style={{...styles.button, opacity: isLoading || seedWords.filter(w => w).length < 12 ? 0.5 : 1}}
                  onMouseEnter={(e) => {
                    if (!isLoading && seedWords.filter(w => w).length >= 12) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  {isLoading ? 'Recovering...' : 'Recover Wallet'}
                </button>

                {syncResult && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '16px',
                      borderRadius: '12px',
                      background: syncResult.synced
                        ? 'rgba(34, 197, 94, 0.1)'
                        : 'rgba(234, 179, 8, 0.08)',
                      border: syncResult.synced
                        ? '1px solid rgba(34, 197, 94, 0.3)'
                        : '1px solid rgba(234, 179, 8, 0.2)',
                      color: '#FFFFFF',
                    }}
                  >
                    <p style={{ fontWeight: 600, marginBottom: '8px' }}>
                      {syncResult.synced
                        ? 'PIN backup found'
                        : 'PIN backup not found yet'}
                    </p>
                    <p style={{ color: '#c7c7ce', fontSize: '13px', lineHeight: 1.6 }}>
                      {syncResult.synced
                        ? 'You can unlock this wallet with your PIN across devices.'
                        : syncResult.errorMessage ||
                          'Once you set a PIN, we will store the encrypted seed so you can unlock with it anywhere.'}
                    </p>
                  </div>
                )}
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
