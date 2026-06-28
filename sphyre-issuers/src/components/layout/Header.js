import React from 'react';
import { SearchIcon } from '@heroicons/react/outline';

const Header = ({ title }) => {
  const styles = {
    header: {
      padding: '20px 24px',
      borderBottom: 'none',
      background: '#131313',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
    },
    title: {
      fontSize: '20px',
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: '-0.02em',
      display: 'none',
    },
    titleMobile: {
      fontSize: '18px',
      fontWeight: '700',
      color: '#FFFFFF',
      display: 'block',
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginLeft: 'auto',
    },
    searchContainer: {
      position: 'relative',
      display: 'none',
    },
    searchInput: {
      width: '300px',
      padding: '10px 16px 10px 40px',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '10px',
      color: '#FFFFFF',
      fontSize: '14px',
      outline: 'none',
      transition: 'all 0.2s ease',
    },
    searchIcon: {
      position: 'absolute',
      left: '12px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '18px',
      height: '18px',
      color: '#8B8B9E',
      pointerEvents: 'none',
    },
    iconButton: {
      width: '40px',
      height: '40px',
      borderRadius: '10px',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
  };

  return (
    <header style={styles.header}>
      <h1 style={styles.title} className="hidden lg:block">
        {title || 'Dashboard'}
      </h1>
      <h1 style={styles.titleMobile} className="lg:hidden">
        {title || 'Dashboard'}
      </h1>

      <div style={styles.actions}>
        <div style={styles.searchContainer} className="hidden lg:block">
          <SearchIcon style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search credentials..."
            style={styles.searchInput}
            onFocus={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.08)';
              e.target.style.borderColor = 'rgba(0, 5, 255, 0.3)';
            }}
            onBlur={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.05)';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          />
        </div>

      </div>
    </header>
  );
};

export default Header;
