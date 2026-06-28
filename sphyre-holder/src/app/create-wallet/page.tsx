'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import walletService from '@/services/walletService';
import { generateSeedPhrase } from '@/lib/crypto';
import { useToast } from '@/contexts/ToastContext';

export default function CreateWalletPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [step, setStep] = useState<'generate' | 'confirm'>('generate');
  const [seedPhrase, setSeedPhrase] = useState<string>('');
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [showSeed, setShowSeed] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [confirmWords, setConfirmWords] = useState<{ [key: number]: string }>({});
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [isProvisioning, setIsProvisioning] = useState(false);

  useEffect(() => {
    if (walletService.isSessionAuthenticated()) {
      router.push('/SSIWalletIdentity');
      return;
    }
    handleGenerateWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateWallet = () => {
    try {
      const newSeedPhrase = generateSeedPhrase();
      setSeedPhrase(newSeedPhrase);
      setSeedWords(newSeedPhrase.split(' '));
      walletService.storeSeedPhraseInSession(newSeedPhrase);

      const indexes: number[] = [];
      while (indexes.length < 3) {
        const randomIndex = Math.floor(Math.random() * 12);
        if (!indexes.includes(randomIndex)) indexes.push(randomIndex);
      }
      setSelectedIndexes(indexes.sort((a, b) => a - b));
    } catch {
      addToast('Failed to generate recovery phrase', 'error');
    }
  };

  const handleCopySeedPhrase = () => {
    const numbered = seedWords.length
      ? seedWords.map((word, idx) => `${idx + 1}. ${word}`).join('\n')
      : seedPhrase;
    navigator.clipboard.writeText(numbered);
  };

  const handleCopyWord = (index: number, word: string) => {
    navigator.clipboard.writeText(word);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleConfirm = async () => {
    const isValid = selectedIndexes.every(
      (idx) => confirmWords[idx]?.toLowerCase().trim() === seedWords[idx]
    );
    if (!isValid) {
      addToast('Words do not match. Please try again.', 'error');
      return;
    }
    if (!seedPhrase) {
      addToast('Seed phrase missing. Please regenerate your wallet.', 'error');
      return;
    }

    try {
      setIsProvisioning(true);
      await walletService.provisionWalletFromSeed(seedPhrase);
      walletService.setSessionAuthenticated(true);
      router.push('/setup-pin');
    } catch (error) {
      console.error('Failed to provision wallet:', error);
      const message = error instanceof Error ? error.message : 'Failed to create wallet';
      addToast(message, 'error');
    } finally {
      setIsProvisioning(false);
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #090909 0%, #0a0a0f 50%, #090909 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'clamp(16px, 4vw, 24px)',
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
    content: {
      animation: 'fadeInScale 0.5s ease-out',
    },
    progressContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: '32px',
      gap: '12px',
    },
    progressDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    progressLine: {
      width: '40px',
      height: '2px',
      borderRadius: '2px',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '32px',
    },
    title: {
      fontSize: '24px',
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
    seedBox: {
      background: 'rgba(0, 5, 255, 0.05)',
      border: '1px solid rgba(0, 5, 255, 0.2)',
      borderRadius: '16px',
      padding: 'clamp(16px, 4vw, 24px)',
      marginBottom: '24px',
    },
    seedGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '12px',
      marginTop: '16px',
    },
    seedItem: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '6px',
      minWidth: 0,
    },
    seedWord: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 14px',
      background: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: '10px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      minHeight: '44px',
      maxWidth: '100%',
      overflow: 'hidden',
      position: 'relative' as const,
    },
    seedNumber: {
      fontSize: '10px',
      color: '#52525E',
      fontWeight: '600' as const,
      letterSpacing: '0.03em',
    },
    seedText: {
      fontSize: '14px',
      color: '#FFFFFF',
      fontFamily: 'monospace',
      lineHeight: '1.3',
      textAlign: 'center' as const,
      overflowWrap: 'anywhere' as const,
      minWidth: 0,
    },
    seedCopiedIcon: {
      position: 'absolute' as const,
      top: '8px',
      right: '8px',
    },
    confirmInput: {
      width: '100%',
      padding: '14px 18px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '15px',
      outline: 'none',
      transition: 'all 0.3s ease',
      fontFamily: 'monospace',
      marginBottom: '16px',
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
      marginTop: '12px',
    },
    warningBox: {
      padding: '16px',
      background: 'rgba(251, 191, 36, 0.05)',
      border: '1px solid rgba(251, 191, 36, 0.2)',
      borderRadius: '12px',
      marginBottom: '24px',
      display: 'flex',
      gap: '12px',
      fontSize: '13px',
      color: '#8B8B9E',
      lineHeight: '1.6',
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
	          <div style={styles.progressContainer}>
	            {['generate', 'confirm', 'backup'].map((s, i) => (
              <React.Fragment key={s}>
                <div style={{
                  ...styles.progressDot,
                  background: step === s || ['generate', 'confirm', 'backup'].indexOf(step) > i ? '#0005FF' : 'rgba(255, 255, 255, 0.1)',
                  transform: step === s ? 'scale(1.5)' : 'scale(1)',
                }} />
                {i < 2 && <div style={{
                  ...styles.progressLine,
                  background: ['generate', 'confirm', 'backup'].indexOf(step) > i ? '#0005FF' : 'rgba(255, 255, 255, 0.1)',
                }} />}
              </React.Fragment>
	            ))}
	          </div>

	          <div style={styles.content}>
	            {step === 'generate' && (
	              <>
	                <div style={styles.header}>
	                  <h1 style={styles.title}>Your Recovery Phrase</h1>
	                  <p style={styles.subtitle}>
	                    Write down these 12 words in order. You&apos;ll need them to recover your wallet.
	                  </p>
	                </div>

	                <div style={styles.warningBox}>
	                  <svg width="20" height="20" fill="none" stroke="#FCD34D" viewBox="0 0 24 24" style={{flexShrink: 0}}>
	                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
	                  </svg>
	                  <span>
	                    Never share your recovery phrase. Anyone with these words can access your data.
	                  </span>
		                </div>

		                <div style={styles.seedBox}>
		                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap'}}>
		                    <span style={{fontSize: '12px', fontWeight: '600', color: '#8B8B9E'}}>RECOVERY PHRASE</span>
		                    <div style={{display: 'flex', gap: '8px'}}>
		                      <button
		                        onClick={() => setShowSeed(!showSeed)}
	                        style={{
	                          padding: '8px 12px',
	                          background: 'rgba(255, 255, 255, 0.1)',
	                          border: 'none',
	                          borderRadius: '8px',
	                          color: '#FFFFFF',
	                          fontSize: '12px',
	                          cursor: 'pointer',
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
	                      <button
	                        onClick={handleCopySeedPhrase}
	                        style={{
	                          padding: '8px 12px',
	                          background: 'rgba(255, 255, 255, 0.1)',
	                          border: 'none',
	                          borderRadius: '8px',
	                          color: '#FFFFFF',
	                          fontSize: '12px',
	                          cursor: 'pointer',
	                          display: 'flex',
	                          alignItems: 'center',
	                          gap: '4px',
	                        }}
	                      >
	                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
	                        </svg>
	                        Copy
		                      </button>
		                    </div>
		                  </div>
		                  <div style={styles.seedGrid}>
		                    {seedWords.map((word, idx) => (
		                      <div key={idx} style={styles.seedItem}>
		                        <span style={styles.seedNumber}>#{idx + 1}</span>
		                        <button
		                          type="button"
		                          style={styles.seedWord}
		                          onClick={() => handleCopyWord(idx, word)}
		                        >
		                          <span style={styles.seedText}>{showSeed ? word : '••••'}</span>
		                          {copiedIndex === idx && (
		                            <svg
		                              width="12"
		                              height="12"
		                              fill="#10B981"
		                              viewBox="0 0 20 20"
		                              style={styles.seedCopiedIcon}
		                            >
		                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
		                            </svg>
		                          )}
		                        </button>
		                      </div>
		                    ))}
			                  </div>
			                </div>

		                <button
		                  onClick={() => setStep('confirm')}
		                  style={styles.button}
	                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
	                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
	                >
	                  I&apos;ve Saved My Recovery Phrase
	                </button>
	              </>
	            )}

	            {step === 'confirm' && (
	              <>
	                <div style={styles.header}>
	                  <h1 style={styles.title}>Verify Recovery Phrase</h1>
	                  <p style={styles.subtitle}>
	                    Enter the following words from your recovery phrase to confirm you&apos;ve saved it correctly.
	                  </p>
	                </div>

	                {selectedIndexes.map((idx) => (
	                  <div key={idx} style={{marginBottom: '20px'}}>
	                    <label style={{fontSize: '13px', fontWeight: '600', color: '#FFFFFF', display: 'block', marginBottom: '10px'}}>
	                      Word #{idx + 1}
	                    </label>
	                    <input
	                      type="text"
	                      value={confirmWords[idx] || ''}
	                      onChange={(e) => setConfirmWords({...confirmWords, [idx]: e.target.value})}
	                      placeholder="Enter word"
	                      style={styles.confirmInput}
	                      onFocus={(e) => e.target.style.borderColor = '#0005FF'}
	                      onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
	                    />
	                  </div>
	                ))}

	                <button
	                  onClick={handleConfirm}
	                  disabled={
	                    selectedIndexes.some((idx) => !confirmWords[idx]) || isProvisioning
	                  }
	                  style={{
	                    ...styles.button,
	                    opacity:
	                      selectedIndexes.some((idx) => !confirmWords[idx]) || isProvisioning
	                        ? 0.5
	                        : 1,
	                  }}
	                  onMouseEnter={(e) => {
	                    if (
	                      !selectedIndexes.some((idx) => !confirmWords[idx]) &&
	                      !isProvisioning
	                    ) {
	                      e.currentTarget.style.transform = 'translateY(-2px)';
	                    }
	                  }}
	                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
	                >
	                  {isProvisioning ? 'Provisioning Wallet...' : 'Verify & Continue'}
	                </button>

	                <button
	                  onClick={() => setStep('generate')}
	                  style={{...styles.button, ...styles.buttonSecondary}}
	                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
	                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
	                >
	                  Back
	                </button>
	              </>
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
