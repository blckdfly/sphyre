// This file patches the ReactBits library to fix import issues
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

// Create enhanced mock exports for missing components
export const AnimatedContent = ({ children, style }) => {
  const contentRef = useRef(null);
  
  useEffect(() => {
    if (contentRef.current) {
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: 50 },
        { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }
      );
    }
  }, []);
  
  return <div ref={contentRef} style={style}>{children}</div>;
};

export const GradientText = ({ text, colors, style }) => {
  const [gradientId] = useState(`gradient-${Math.random().toString(36).substr(2, 9)}`);
  
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            {colors.map((color, index) => (
              <stop 
                key={index} 
                offset={`${(index / (colors.length - 1)) * 100}%`} 
                stopColor={color} 
              />
            ))}
          </linearGradient>
        </defs>
      </svg>
      <h1 
        style={{
          ...style,
          backgroundImage: `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Crect fill='url(%23${gradientId})' /%3E%3C/svg%3E")`,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          animation: 'gradientMove 3s ease infinite'
        }}
      >
        {text}
      </h1>
      <style>
        {`
          @keyframes gradientMove {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}
      </style>
    </>
  );
};

export const ScrollReveal = ({ children }) => {
  const revealRef = useRef(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            gsap.fromTo(
              entry.target,
              { opacity: 0, y: 50 },
              { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }
            );
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    
    if (revealRef.current) {
      observer.observe(revealRef.current);
    }
    
    return () => {
      if (revealRef.current) {
        observer.unobserve(revealRef.current);
      }
    };
  }, []);
  
  return <div ref={revealRef}>{children}</div>;
};

export const particles = {
  init: () => {},
  animate: () => {}
};

export const ParticleBackground = ({ children, style }) => {
  return <div className="particles-container" style={style}>{children}</div>;
};

export const FloatingCard = ({ children, style, className }) => {
  return <div className={`floating-card ${className || ''}`} style={style}>{children}</div>;
};

export const GlowButton = ({ children, onClick, style }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <button 
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="glow-button"
      style={{
        ...style,
        padding: '12px 24px',
        backgroundColor: '#0056b3',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        boxShadow: isHovered ? '0 0 8px rgba(0, 86, 179, 0.6)' : '0 2px 4px rgba(0, 86, 179, 0.3)',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.2s ease'
      }}
    >
      {children}
    </button>
  );
};

export const AnimatedCard = ({ children, style, className }) => {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  
  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", delay: Math.random() * 0.2 }
      );
    }
  }, []);
  
  return (
    <div 
      ref={cardRef}
      className={`${className || ''}`}
      style={{
        ...style,
        transform: isHovered ? 'translateY(-5px)' : 'translateY(0)',
        boxShadow: isHovered 
          ? '0 8px 20px rgba(0, 0, 0, 0.3)' 
          : '0 4px 12px rgba(0, 0, 0, 0.2)',
        border: isHovered 
          ? '1px solid rgba(255, 255, 255, 0.1)' 
          : '1px solid rgba(255, 255, 255, 0.05)',
        transition: 'all 0.2s ease',
        borderRadius: '8px'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </div>
  );
};