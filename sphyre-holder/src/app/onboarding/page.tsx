'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import walletService from '@/services/walletService';

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    if (walletService.isSessionAuthenticated()) {
      router.push('/SSIWalletIdentity');
      return;
    }
    if (walletService.isPersistentLoginEnabled()) {
      router.push('/unlock');
      return;
    }
  }, [router]);

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
      padding: '48px 40px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 5, 255, 0.1)',
      animation: 'fadeInScale 0.5s ease-out',
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '48px',
    },
    brandLine: {
      width: '60px',
      height: '3px',
      background: 'linear-gradient(90deg, transparent, #0005FF, transparent)',
      margin: '0 auto 20px',
      borderRadius: '2px',
    },
    brandName: {
      fontSize: '36px',
      fontWeight: '700' as const,
      color: '#FFFFFF',
      letterSpacing: '-0.03em',
      marginBottom: '12px',
      background: 'linear-gradient(135deg, #FFFFFF 0%, #8B8B9E 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    subtitle: {
      fontSize: '15px',
      color: '#8B8B9E',
      lineHeight: '1.6',
      marginBottom: '8px',
    },
    tagline: {
      fontSize: '13px',
      color: '#52525E',
      fontWeight: '500' as const,
      letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
    },
    buttonGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      marginBottom: '32px',
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
    buttonSecondary: {
      width: '100%',
      padding: '18px 24px',
      background: 'transparent',
      border: '2px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      color: '#FFFFFF',
      fontSize: '16px',
      fontWeight: '600' as const,
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    },
    warningBox: {
      padding: '20px',
      background: 'rgba(251, 191, 36, 0.05)',
      border: '1px solid rgba(251, 191, 36, 0.2)',
      borderRadius: '16px',
      display: 'flex',
      gap: '12px',
    },
    warningIcon: {
      width: '20px',
      height: '20px',
      color: '#FCD34D',
      flexShrink: 0,
      marginTop: '2px',
    },
    warningContent: {
      flex: 1,
    },
    warningTitle: {
      fontSize: '14px',
      fontWeight: '600' as const,
      color: '#FCD34D',
      marginBottom: '6px',
    },
    warningText: {
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
          <div style={styles.card}>
            <div style={styles.header}>
              <div style={styles.brandLine} />
              <h1 style={styles.brandName}>Sphyre</h1>
              <p style={styles.subtitle}>Your decentralized identity wallet</p>
              <p style={styles.tagline}>Secure • Private • Self-Sovereign</p>
            </div>

            <div style={styles.buttonGroup}>
              <button
                onClick={() => router.push('/create-wallet')}
                style={styles.buttonPrimary}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 30px rgba(0, 5, 255, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 5, 255, 0.3)';
                }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Wallet
              </button>

              <button
                onClick={() => router.push('/recovery')}
                style={styles.buttonSecondary}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(0, 5, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                I have a seed phrase
              </button>
            </div>

            <div style={styles.warningBox}>
              <svg style={styles.warningIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div style={styles.warningContent}>
                <div style={styles.warningTitle}>Important Security Notice</div>
                <div style={styles.warningText}>
                  Your seed phrase is the only way to recover your wallet. Keep it safe and never share it with anyone.
                </div>
              </div>
            </div>
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
