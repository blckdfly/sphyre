import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || 'https://api.sphyre.tech';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', domain: '', description: '', website: '', logo_url: '' });
  const [verificationMethod, setVerificationMethod] = useState('DnsTxt');
  const [challenge, setChallenge] = useState(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [issuerDID, setIssuerDID] = useState('');

  const handleRequestChallenge = async () => {
    if (!formData.domain) { setError('Please enter your domain'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/api/domain/challenge/issuer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: formData.domain, method: verificationMethod }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to request challenge');
      setChallenge(data.challenge); setStep('challenge');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const handleVerifyAndCreate = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/api/issuer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, challenge_token: challenge?.challenge_token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create issuer');
      const issuer = data.issuer || data;
      const did = issuer.id || issuer.did;
      setIssuerDID(did);
      sessionStorage.setItem('temp_issuer_data', JSON.stringify(issuer));
      localStorage.setItem('issuerDID', did);
      setStep('complete');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const copyToken = (text) => { navigator.clipboard.writeText(text); setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000); };

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
      backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0, 5, 255, 0.1) 1px, transparent 0)',
      backgroundSize: '48px 48px',
      opacity: 0.3,
    },
    wrapper: {
      width: '100%',
      maxWidth: '600px',
      position: 'relative',
      zIndex: 1,
    },
    header: {
      textAlign: 'center',
      marginBottom: '48px',
      animation: 'fadeInUp 0.6s ease-out',
    },
    brandContainer: {
      marginBottom: '24px',
    },
    brandLine: {
      width: '60px',
      height: '3px',
      background: 'linear-gradient(90deg, transparent, #0005FF, transparent)',
      margin: '0 auto 16px',
      borderRadius: '2px',
    },
    brandName: {
      fontSize: '32px',
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: '-0.03em',
      marginBottom: '8px',
      background: 'linear-gradient(135deg, #FFFFFF 0%, #8B8B9E 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    brandSubtitle: {
      fontSize: '14px',
      color: '#8B8B9E',
      fontWeight: '500',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    },
    headerTitle: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#FFFFFF',
      marginBottom: '12px',
      letterSpacing: '-0.02em',
    },
    headerSubtitle: {
      fontSize: '15px',
      color: '#8B8B9E',
      lineHeight: '1.6',
    },
    progressContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: '40px',
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
    card: {
      background: 'rgba(15, 15, 15, 0.8)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '24px',
      padding: '40px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 5, 255, 0.1)',
      animation: 'fadeInScale 0.5s ease-out',
    },
    inputGroup: {
      marginBottom: '24px',
    },
    label: {
      display: 'block',
      fontSize: '13px',
      fontWeight: '600',
      color: '#FFFFFF',
      marginBottom: '10px',
      letterSpacing: '0.02em',
    },
    input: {
      width: '100%',
      padding: '14px 18px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '15px',
      outline: 'none',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      fontFamily: 'inherit',
    },
    textarea: {
      resize: 'vertical',
      minHeight: '100px',
      fontFamily: 'inherit',
    },
    hint: {
      fontSize: '12px',
      color: '#52525E',
      marginTop: '8px',
    },
    verificationGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '16px',
      marginBottom: '32px',
    },
    verificationCard: {
      padding: '20px',
      background: 'rgba(255, 255, 255, 0.02)',
      border: '2px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      position: 'relative',
      overflow: 'hidden',
    },
    verificationIcon: {
      width: '48px',
      height: '48px',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '16px',
      transition: 'all 0.3s ease',
    },
    verificationTitle: {
      fontSize: '15px',
      fontWeight: '600',
      color: '#FFFFFF',
      marginBottom: '6px',
    },
    verificationDesc: {
      fontSize: '13px',
      color: '#8B8B9E',
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
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: '0 4px 20px rgba(0, 5, 255, 0.3)',
      position: 'relative',
      overflow: 'hidden',
    },
    buttonSecondary: {
      background: 'transparent',
      border: '2px solid rgba(255, 255, 255, 0.1)',
      boxShadow: 'none',
    },
    buttonGroup: {
      display: 'flex',
      gap: '12px',
      marginTop: '24px',
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
      lineHeight: '1.5',
    },
    challengeBox: {
      background: 'rgba(0, 5, 255, 0.05)',
      border: '1px solid rgba(0, 5, 255, 0.2)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '24px',
    },
    challengeHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12px',
    },
    challengeLabel: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#8B8B9E',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    copyButton: {
      padding: '8px 16px',
      background: 'rgba(255, 255, 255, 0.1)',
      border: 'none',
      borderRadius: '8px',
      color: '#FFFFFF',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    code: {
      padding: '14px',
      background: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '10px',
      color: '#FFFFFF',
      fontSize: '13px',
      fontFamily: 'monospace',
      wordBreak: 'break-all',
      lineHeight: '1.6',
    },
    instructionsBox: {
      background: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '24px',
    },
    instructionsTitle: {
      fontSize: '15px',
      fontWeight: '600',
      color: '#FFFFFF',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    instructionsList: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
    },
    instructionItem: {
      display: 'flex',
      gap: '12px',
      marginBottom: '12px',
      fontSize: '14px',
      color: '#8B8B9E',
      lineHeight: '1.6',
    },
    instructionNumber: {
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      background: 'rgba(0, 5, 255, 0.1)',
      border: '1px solid rgba(0, 5, 255, 0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      fontWeight: '700',
      color: '#0005FF',
      flexShrink: 0,
    },
    successIcon: {
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
    didBox: {
      background: 'rgba(0, 5, 255, 0.05)',
      border: '1px solid rgba(0, 5, 255, 0.2)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '32px',
      textAlign: 'center',
    },
    didLabel: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#8B8B9E',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: '12px',
    },
    did: {
      padding: '12px',
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '10px',
      color: '#0005FF',
      fontSize: '13px',
      fontFamily: 'monospace',
      wordBreak: 'break-all',
      lineHeight: '1.6',
    },
    footer: {
      marginTop: '48px',
      paddingTop: '24px',
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      textAlign: 'center',
      color: '#FFFFFF',
    },
  };

  // Animation keyframes
  const animationStyles = `
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeInScale {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes scaleIn {
      from { transform: scale(0); }
      to { transform: scale(1); }
    }
  `;

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
            <h2 style={styles.headerTitle}>
              {step === 'info' ? 'Create Your Profile' : step === 'challenge' ? 'Verify Domain' : 'Welcome Aboard'}
            </h2>
            <p style={styles.headerSubtitle}>
              {step === 'info' ? 'Set up your issuer credentials in minutes' : step === 'challenge' ? 'Prove ownership of your domain' : 'Your issuer profile is ready'}
            </p>
          </div>

          {/* Progress */}
          <div style={styles.progressContainer}>
            {['info', 'challenge', 'complete'].map((s, i) => (
              <React.Fragment key={s}>
                <div style={{
                  ...styles.progressDot,
                  background: step === s || ['info', 'challenge', 'complete'].indexOf(step) > i ? '#0005FF' : 'rgba(255, 255, 255, 0.1)',
                  transform: step === s ? 'scale(1.5)' : 'scale(1)',
                }} />
                {i < 2 && <div style={{
                  ...styles.progressLine,
                  background: ['info', 'challenge', 'complete'].indexOf(step) > i ? '#0005FF' : 'rgba(255, 255, 255, 0.1)',
                }} />}
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

            {step === 'info' && (
              <div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Organization Name</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Acme University" style={styles.input} onFocus={(e) => e.target.style.borderColor = '#0005FF'} onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'} />
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Domain</label>
                  <input type="text" value={formData.domain} onChange={(e) => setFormData({...formData, domain: e.target.value})} placeholder="acme.edu" style={styles.input} onFocus={(e) => e.target.style.borderColor = '#0005FF'} onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'} />
                  <div style={styles.hint}>We&apos;ll verify you own this domain</div>
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Description</label>
                  <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Brief description..." style={{...styles.input, ...styles.textarea}} onFocus={(e) => e.target.style.borderColor = '#0005FF'} onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'} />
                </div>
                
                <div style={{marginBottom: '32px'}}>
                  <label style={{...styles.label, marginBottom: '16px'}}>Verification Method *</label>
                  <div style={styles.verificationGrid}>
                    {[
                      {id: 'DnsTxt', icon: 'DNS', title: 'DNS TXT Record', desc: 'Add to your DNS'},
                      {id: 'WellKnown', icon: 'File', title: 'HTTPS File', desc: 'Upload to server'}
                    ].map(method => (
                      <div key={method.id} style={{
                        ...styles.verificationCard,
                        borderColor: verificationMethod === method.id ? '#0005FF' : 'rgba(255, 255, 255, 0.08)',
                        background: verificationMethod === method.id ? 'rgba(0, 5, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      }} 
                      onClick={() => setVerificationMethod(method.id)} 
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; }} 
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                        <div style={{...styles.verificationIcon, background: verificationMethod === method.id ? 'rgba(0, 5, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)'}}>
                          <span style={{fontSize: '24px'}}>{method.icon}</span>
                        </div>
                        <div style={styles.verificationTitle}>{method.title}</div>
                        <div style={styles.verificationDesc}>{method.desc}</div>
                        {verificationMethod === method.id && (
                          <div style={{position: 'absolute', top: '12px', right: '12px'}}>
                            <svg width="20" height="20" fill="#0005FF" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleRequestChallenge} 
                  disabled={loading || !formData.name || !formData.domain} 
                  style={{...styles.button, opacity: loading || !formData.name || !formData.domain ? 0.5 : 1}}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {loading ? 'Processing...' : 'Continue to Verification →'}
                </button>

                {/* Already have an account link */}
                <div style={{textAlign: 'center', marginTop: '20px'}}>
                  <button
                    onClick={() => navigate('/recover-seed-phrase')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0005FF',
                      fontSize: '14px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: '8px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#0003CC'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#0005FF'; }}
                  >
                    Already have an account? Login with seed phrase →
                  </button>
                </div>
              </div>
            )}

            {step === 'challenge' && challenge && (
              <div>
                <div style={styles.challengeBox}>
                  <div style={styles.challengeHeader}>
                    <span style={styles.challengeLabel}>Verification Token</span>
                    <button 
                      onClick={() => copyToken(challenge.challenge_token)} 
                      style={styles.copyButton}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
                    >
                      {copiedToken ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={styles.code}>{challenge.challenge_token}</div>
                </div>

                <div style={styles.instructionsBox}>
                  <h3 style={styles.instructionsTitle}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {verificationMethod === 'DnsTxt' ? 'DNS Setup' : 'HTTPS File Setup'}
                  </h3>
                  <ul style={styles.instructionsList}>
                    {verificationMethod === 'DnsTxt' ? (
                      <>
                        <li style={styles.instructionItem}><span style={styles.instructionNumber}>1</span><span>Add TXT record: <code style={{color: '#FFFFFF'}}>_sphyre-verify</code></span></li>
                        <li style={styles.instructionItem}><span style={styles.instructionNumber}>2</span><span>Value: <code style={{color: '#FFFFFF', fontSize: '12px'}}>{challenge.challenge_token}</code></span></li>
                        <li style={styles.instructionItem}><span style={styles.instructionNumber}>3</span><span>Wait 5-10 minutes for DNS propagation</span></li>
                      </>
                    ) : (
                      <>
                        <li style={styles.instructionItem}><span style={styles.instructionNumber}>1</span><span>Create: <code style={{color: '#0005FF'}}>/.well-known/sphyre-verify.txt</code></span></li>
                        <li style={styles.instructionItem}><span style={styles.instructionNumber}>2</span><span>Content: {challenge.challenge_token}</span></li>
                        <li style={styles.instructionItem}><span style={styles.instructionNumber}>3</span><span>Make accessible via HTTPS</span></li>
                      </>
                    )}
                  </ul>
                </div>

                <div style={styles.buttonGroup}>
                  <button 
                    onClick={() => setStep('info')} 
                    style={{...styles.button, ...styles.buttonSecondary, flex: 1}}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    Back
                  </button>
                  <button 
                    onClick={handleVerifyAndCreate} 
                    disabled={loading} 
                    style={{...styles.button, flex: 2, opacity: loading ? 0.5 : 1}}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    {loading ? 'Verifying...' : 'Verify & Create'}
                  </button>
                </div>
              </div>
            )}

            {step === 'complete' && (
              <div style={{textAlign: 'center'}}>
                <div style={styles.successIcon}>
                  <svg width="40" height="40" fill="none" stroke="white" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 style={{...styles.headerTitle, marginBottom: '12px'}}>Success!</h2>
                <p style={{...styles.headerSubtitle, marginBottom: '32px'}}>Your issuer profile is verified and ready</p>
                
                <div style={styles.didBox}>
                  <div style={styles.didLabel}>Your Issuer DID</div>
                  <div style={styles.did}>{issuerDID}</div>
                </div>

                <button 
                  onClick={() => navigate('/seed-phrase-setup')} 
                  style={styles.button}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  Continue to Seed Phrase Setup
                </button>
              </div>
            )}
          </div>

          <p style={styles.footer}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                lineHeight: 1,
              }}
            >
              <span style={{ paddingBottom: '2px', display: 'inline-block', color: '#FFFFFF' }}>Powered by</span>
              <img
                src="/assets/sphyre-text.png"
                alt="Sphyre logo"
                width={72}
                height={18}
                style={{ objectFit: 'contain', display: 'block' }}
                loading="lazy"
              />
            </span>
          </p>
        </div>
      </div>
    </>
  );
}
