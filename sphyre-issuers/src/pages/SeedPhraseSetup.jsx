import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import issuerAuthService from '../services/issuerAuthService';

export default function SeedPhraseSetup() {
  const navigate = useNavigate();
  
  const [issuerData, setIssuerData] = useState(null);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [seedWords, setSeedWords] = useState([]);
  const [showSeed, setShowSeed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState('display'); 
  const [selectedIndexes, setSelectedIndexes] = useState([]);
  const [confirmWords, setConfirmWords] = useState({});
  const [error, setError] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [initError, setInitError] = useState('');

  useEffect(() => {
    try {
      // Check for issuer DID
      const issuerDID = localStorage.getItem('issuerDID');
      if (!issuerDID) {
        setIsRedirecting(true);
        navigate('/onboarding');
        return;
      }

      setIssuerData({ did: issuerDID });

      // Generate seed phrase
      const phrase = issuerAuthService.generateNewSeedPhrase();
      if (!phrase) throw new Error('Failed to generate seed phrase');
      
      setSeedPhrase(phrase);
      setSeedWords(phrase.split(' '));

      // Select 3 random word indexes for confirmation
      const words = phrase.split(' ');
      const indexes = [];
      while (indexes.length < 3) {
        const idx = Math.floor(Math.random() * words.length);
        if (!indexes.includes(idx)) indexes.push(idx);
      }
      setSelectedIndexes(indexes.sort((a, b) => a - b));
    } catch (err) {
      setInitError(err.message || 'Failed to initialize seed phrase setup');
    }
  }, [navigate]);

  const handleCopy = () => {
    const numbered = seedWords.length
      ? seedWords.map((word, idx) => `${idx + 1}. ${word}`).join('\n')
      : seedPhrase;
    navigator.clipboard.writeText(numbered);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    if (!showSeed) {
      setError('Please reveal and write down your seed phrase');
      return;
    }
    setError('');
    setStep('confirm');
  };

  const handleConfirmWord = (index, value) => {
    setConfirmWords({ ...confirmWords, [index]: value });
    setError('');
  };

  const handleVerifyAndContinue = () => {
    const allCorrect = selectedIndexes.every(idx => 
      confirmWords[idx]?.toLowerCase().trim() === seedWords[idx].toLowerCase()
    );

    if (!allCorrect) {
      setError('Some words are incorrect. Please check and try again.');
      return;
    }

    sessionStorage.setItem('temp_seed_phrase', seedPhrase);
    navigate('/setup-pin');
  };

  // Styles matching OnboardingPage
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #090909 0%, #0a0a0f 50%, #090909 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    },
    backgroundPattern: {
      position: 'absolute',
      inset: 0,
      background: 'radial-gradient(circle at 20% 50%, rgba(0, 5, 255, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(0, 5, 255, 0.1) 0%, transparent 50%)',
      zIndex: 0,
    },
    wrapper: {
      maxWidth: '700px',
      width: '100%',
      position: 'relative',
      zIndex: 1,
      animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    header: {
      textAlign: 'center',
      marginBottom: '48px',
    },
    brandContainer: {
      marginBottom: '32px',
      display: 'flex',
      flexDirection: 'column',
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
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: '-0.02em',
      margin: 0,
    },
    brandSubtitle: {
      fontSize: '13px',
      color: '#52525E',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    headerTitle: {
      fontSize: '32px',
      fontWeight: '700',
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
    warning: {
      background: 'rgba(251, 191, 36, 0.1)',
      border: '1px solid rgba(251, 191, 36, 0.3)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '32px',
    },
    warningIcon: {
      color: '#FBB F24',
      marginBottom: '12px',
      fontSize: '24px',
    },
    warningText: {
      fontSize: '13px',
      color: '#FBB F24',
      lineHeight: '1.6',
      margin: '8px 0',
    },
    seedGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '12px',
      marginBottom: '32px',
    },
    seedWord: {
      background: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '16px 12px',
      textAlign: 'center',
      position: 'relative',
    },
    seedNumber: {
      fontSize: '11px',
      color: '#FFFFFF',
      marginBottom: '8px',
      fontWeight: '600',
      letterSpacing: '0.05em',
    },
    seedText: {
      fontSize: '15px',
      color: '#FFFFFF',
      fontFamily: 'monospace',
      fontWeight: '600',
    },
    button: {
      width: '100%',
      padding: '16px',
      background: 'linear-gradient(135deg, #0005FF 0%, #0003CC 100%)',
      border: 'none',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: '0 4px 20px rgba(0, 5, 255, 0.3)',
      marginTop: '16px',
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
    input: {
      width: '100%',
      padding: '16px',
      background: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '15px',
      fontFamily: 'monospace',
      transition: 'all 0.3s ease',
    },
    inputLabel: {
      fontSize: '13px',
      color: '#8B8B9E',
      fontWeight: '600',
      marginBottom: '8px',
      display: 'block',
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
  `;

  // Error state
  if (initError) {
    return (
      <>
        <style>{animationStyles}</style>
        <div style={styles.container}>
          <div style={styles.backgroundPattern} />
          <div style={{...styles.wrapper, maxWidth: '500px'}}>
            <div style={styles.card}>
              <div style={{textAlign: 'center'}}>
                <div style={{width: '48px', height: '48px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px'}}>
                  <svg width="24" height="24" fill="none" stroke="#EF4444" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h2 style={{...styles.headerTitle, fontSize: '24px', marginBottom: '12px'}}>Initialization Error</h2>
                <p style={{...styles.errorText, marginBottom: '32px'}}>{initError}</p>
                <button onClick={() => navigate('/onboarding')} style={styles.button}>
                  Back to Onboarding
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Loading state
  if (isRedirecting || !seedPhrase) {
    return (
      <>
        <style>{animationStyles}</style>
        <div style={styles.container}>
          <div style={styles.backgroundPattern} />
          <div style={{textAlign: 'center'}}>
            <div style={{width: '48px', height: '48px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #0005FF', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px'}}></div>
            <p style={{...styles.headerSubtitle, animation: 'pulse 2s ease-in-out infinite'}}>
              {isRedirecting ? 'Redirecting...' : 'Generating your seed phrase...'}
            </p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  // Display step
  if (step === 'display') {
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
                <div style={styles.brandSubtitle}>Issuer Platform</div>
              </div>
              <h2 style={styles.headerTitle}>Your Recovery Seed Phrase</h2>
              <p style={styles.headerSubtitle}>
                Write down these 12 words in order. This is your backup key.
              </p>
            </div>

            {/* Progress */}
            <div style={styles.progressContainer}>
              {['complete', 'complete', 'in_progress', 'pending'].map((s, i) => (
                <React.Fragment key={i}>
                  <div style={{
                    ...styles.progressDot,
                    background: s === 'pending' ? 'rgba(255, 255, 255, 0.1)' : '#0005FF',
                    transform: s === 'in_progress' ? 'scale(1.5)' : 'scale(1)',
                  }} />
                  {i < 3 && <div style={{
                    ...styles.progressLine,
                    background: s === 'pending' ? 'rgba(255, 255, 255, 0.1)' : '#0005FF',
                  }} />}
                </React.Fragment>
              ))}
            </div>

            <div style={styles.card}>
              {/* Seed Phrase */}
              <div style={{marginBottom: '24px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                  <label style={styles.inputLabel}>Your 12-Word Seed Phrase</label>
                  <button
                    onClick={() => setShowSeed(!showSeed)}
                    style={{background: 'none', border: 'none', color: '#0005FF', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showSeed ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      )}
                    </svg>
                    {showSeed ? 'Hide' : 'Reveal'}
                  </button>
                </div>

                <div style={{position: 'relative'}}>
                  <div style={{...styles.seedGrid, filter: showSeed ? 'none' : 'blur(8px)'}}>
                    {seedWords.map((word, index) => (
                      <div key={index} style={styles.seedWord}>
                        <div style={styles.seedNumber}>{index + 1}</div>
                        <div style={styles.seedText}>{word}</div>
                      </div>
                    ))}
                  </div>
                  
                  {!showSeed && (
                    <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                      <button onClick={() => setShowSeed(true)} style={styles.button}>
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '8px'}}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Click to Reveal
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Copy Button */}
              {showSeed && (
                <button
                  onClick={handleCopy}
                  style={{...styles.button, ...styles.buttonSecondary}}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
              )}

              {/* Error */}
              {error && (
                <div style={styles.errorBox}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: '#EF4444'}}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span style={styles.errorText}>{error}</span>
                </div>
              )}

              {/* Continue */}
              <button
                onClick={handleContinue}
                disabled={!showSeed}
                style={{
                  ...styles.button,
                  ...(showSeed ? {} : styles.buttonDisabled)
                }}
                onMouseEnter={(e) => { if (showSeed) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                I've Written It Down →
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Confirmation step
  return (
    <>
      <style>{animationStyles}</style>
      <div style={styles.container}>
        <div style={styles.backgroundPattern} />
        <div style={{...styles.wrapper, maxWidth: '600px'}}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.brandContainer}>
              <div style={styles.brandLine} />
              <h1 style={styles.brandName}>Sphyre</h1>
              <div style={styles.brandSubtitle}>Issuer Platform</div>
            </div>
            <h2 style={styles.headerTitle}>Verify Your Seed Phrase</h2>
            <p style={styles.headerSubtitle}>
              Enter the following words to confirm you've written them down
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
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: '#EF4444'}}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={styles.errorText}>{error}</span>
              </div>
            )}

            {/* Word Inputs */}
            <div style={{display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px'}}>
              {selectedIndexes.map((idx) => (
                <div key={idx}>
                  <label style={styles.inputLabel}>Word #{idx + 1}</label>
                  <input
                    type="text"
                    value={confirmWords[idx] || ''}
                    onChange={(e) => handleConfirmWord(idx, e.target.value)}
                    placeholder={`Enter word #${idx + 1}`}
                    style={styles.input}
                    onFocus={(e) => { e.target.style.borderColor = '#0005FF'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                  />
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div style={{display: 'flex', gap: '12px'}}>
              <button
                onClick={() => {setStep('display'); setError('');}}
                style={{...styles.button, ...styles.buttonSecondary, flex: 1}}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                Back
              </button>
              <button
                onClick={handleVerifyAndContinue}
                style={{...styles.button, flex: 1}}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                Continue to PIN Setup
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
