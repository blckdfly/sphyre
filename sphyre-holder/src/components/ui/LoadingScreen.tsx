'use client';

import React from 'react';
import { Shield, LockKeyhole, Fingerprint } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
  progress?: number;
}

export default function LoadingScreen({ message = 'Initializing Sphyre Wallet', subMessage = 'Securing your identity with post-quantum cryptography', progress }: LoadingScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.backgroundPattern} />

      <div style={styles.content}>
        <div style={styles.logoContainer}>
          <div style={styles.pingCircle} />
          <div style={styles.iconWrapper}>
            <Shield size={80} color="#0005FF" style={styles.mainIcon} />
            <div style={styles.topRightIcon}>
              <LockKeyhole size={28} color="#0005FF" style={styles.bounceIcon} />
            </div>
            <div style={styles.bottomLeftIcon}>
              <Fingerprint size={28} color="#0005FF" style={styles.pulseIcon} />
            </div>
          </div>
        </div>

        {/* Loading text */}
        <h2 style={styles.title}>
          {message}
        </h2>
        <p style={styles.subtitle}>
          {subMessage}
        </p>

        {/* Progress bar */}
        <div style={styles.progressContainer}>
          <div style={styles.progressTrack}>
            <div style={{
              ...styles.progressBar,
              width: progress ? `${progress}%` : '100%'
            }}>
              <div style={styles.progressShimmer} />
            </div>
          </div>
          {!progress && (
            <div style={styles.progressPulse} />
          )}
        </div>

        <div style={styles.badges}>
          <span style={styles.badge}>did:alyra</span>
          <span style={styles.badge}>post-quantum</span>
          <span style={styles.badge}>bbs+</span>
        </div>
      </div>

      <style jsx>{`
        @keyframes ping {
          0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #090909 0%, #0a0a0f 50%, #090909 100%)',
    overflow: 'hidden',
  },
  backgroundPattern: {
    position: 'absolute' as const,
    inset: 0,
    backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0, 5, 255, 0.1) 1px, transparent 0)',
    backgroundSize: '48px 48px',
    opacity: 0.3,
  },
  content: {
    position: 'relative' as const,
    zIndex: 10,
    textAlign: 'center' as const,
    padding: '0 24px',
    maxWidth: '480px',
  },
  logoContainer: {
    marginBottom: '32px',
    position: 'relative' as const,
  },
  pingCircle: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '128px',
    height: '128px',
    background: 'rgba(0, 5, 255, 0.1)',
    borderRadius: '50%',
    animation: 'ping 2s ease-in-out infinite',
  },
  iconWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainIcon: {
    animation: 'pulse 2s ease-in-out infinite',
  },
  topRightIcon: {
    position: 'absolute' as const,
    top: '-8px',
    right: '-8px',
  },
  bounceIcon: {
    animation: 'bounce 1s ease-in-out infinite',
  },
  bottomLeftIcon: {
    position: 'absolute' as const,
    bottom: '-8px',
    left: '-8px',
  },
  pulseIcon: {
    animation: 'pulse 2s ease-in-out infinite',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginBottom: '8px',
    animation: 'fadeIn 0.5s ease-out',
  },
  subtitle: {
    fontSize: '14px',
    color: '#8B8B9E',
    marginBottom: '24px',
    animation: 'fadeIn 0.5s ease-out 0.2s both',
  },
  progressContainer: {
    position: 'relative' as const,
  },
  progressTrack: {
    height: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: '#0005FF',
    borderRadius: '12px',
    transition: 'all 0.3s ease-out',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  progressShimmer: {
    position: 'absolute' as const,
    inset: 0,
    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
    animation: 'shimmer 2s linear infinite',
  },
  progressPulse: {
    position: 'absolute' as const,
    inset: 0,
    height: '8px',
    background: '#0005FF',
    borderRadius: '12px',
    animation: 'pulse 2s ease-in-out infinite',
    opacity: 0.5,
  },
  badges: {
    marginTop: '32px',
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  badge: {
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '600' as const,
    background: 'rgba(0, 5, 255, 0.1)',
    color: '#0005FF',
    borderRadius: '20px',
    border: '1px solid rgba(0, 5, 255, 0.2)',
  },
};
