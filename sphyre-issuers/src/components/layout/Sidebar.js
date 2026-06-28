import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon, 
  DocumentTextIcon, 
  ShieldCheckIcon, 
  CogIcon,
  MenuIcon,
  XIcon
} from '@heroicons/react/outline';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Credentials', href: '/credentials', icon: DocumentTextIcon },
  { name: 'Verification', href: '/verification', icon: ShieldCheckIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
];

const Sidebar = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [issuerInfo, setIssuerInfo] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const storedInfo = localStorage.getItem('issuerInfo');
    if (storedInfo) {
      try {
        setIssuerInfo(JSON.parse(storedInfo));
      } catch (e) {
        console.error('Failed to parse issuer info:', e);
      }
    }
  }, []);

  const getInitials = (name) => {
    if (!name) return 'S';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const displayName = issuerInfo?.name || 'Sphyre Issuer';
  const displayDomain = issuerInfo?.domain || 'Not configured';
  const displayDID = issuerInfo?.id || issuerInfo?.did || 'No DID';

  const styles = {
    sidebar: {
      background: '#131313',
      borderRight: 'none',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      width: '256px',
    },
    logo: {
      padding: '24px 32px',
      borderBottom: 'none',
    },
    logoImage: {
      display: 'block',
      width: '140px',
      height: 'auto',
    },
    nav: {
      flex: 1,
      padding: '20px 12px',
      overflow: 'visible',
    },
    navItem: {
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      marginBottom: '4px',
      borderRadius: '10px',
      textDecoration: 'none',
      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      cursor: 'pointer',
    },
    navItemActive: {
      background: 'rgba(0, 5, 255, 0.1)',
      borderLeft: '3px solid #0005FF',
    },
    navItemInactive: {
      background: 'transparent',
      borderLeft: '3px solid transparent',
    },
    navItemHover: {
      background: 'rgba(255, 255, 255, 0.05)',
    },
    navIcon: {
      width: '20px',
      height: '20px',
      marginRight: '12px',
    },
    navText: {
      fontSize: '14px',
      fontWeight: '600',
      letterSpacing: '-0.01em',
    },
    footer: {
      padding: '20px',
      borderTop: 'none',
    },
    profile: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    avatar: {
      width: '40px',
      height: '40px',
      borderRadius: '10px',
      background: '#0005FF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#FFFFFF',
      fontSize: '14px',
      fontWeight: '700',
      flexShrink: 0,
    },
    profileInfo: {
      flex: 1,
      minWidth: 0,
    },
    profileName: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#FFFFFF',
      marginBottom: '2px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    profileDomain: {
      fontSize: '12px',
      color: '#8B8B9E',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    profileDID: {
      fontSize: '10px',
      color: '#52525E',
      fontFamily: 'monospace',
      marginTop: '2px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    mobileToggleWrapper: {
      position: 'fixed',
      top: '16px',
      left: '16px',
      zIndex: 60,
    },
    mobileButton: {
      width: '40px',
      height: '40px',
      borderRadius: '10px',
      background: '#090909',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: '#FFFFFF',
    },
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(4px)',
      zIndex: 40,
    },
    mobileSidebar: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '280px',
      height: '100vh',
      zIndex: 50,
      transform: 'translateX(0)',
      transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    },
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="lg:hidden" style={styles.mobileToggleWrapper}>
        <button style={styles.mobileButton} onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <XIcon style={{width: '20px', height: '20px'}} /> : <MenuIcon style={{width: '20px', height: '20px'}} />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <>
          <div style={styles.overlay} onClick={() => setSidebarOpen(false)} className="lg:hidden" />
          <div style={{...styles.sidebar, ...styles.mobileSidebar}} className="lg:hidden">
            <div style={styles.logo}>
              <img
                src="/assets/sphyre-text.png"
                alt="Sphyre Issuers"
                style={styles.logoImage}
              />
            </div>

            <div style={styles.nav}>
              {navigation.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    style={{
                      ...styles.navItem,
                      ...(isActive ? styles.navItemActive : styles.navItemInactive),
                    }}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon 
                      style={{
                        ...styles.navIcon, 
                        color: isActive ? '#0005FF' : '#8B8B9E'
                      }} 
                    />
                    <span style={{
                      ...styles.navText,
                      color: isActive ? '#FFFFFF' : '#8B8B9E'
                    }}>
                      {item.name}
                    </span>
                  </Link>
                );
              })}
            </div>

            <div style={styles.footer}>
              <div style={styles.profile}>
                <div style={styles.avatar}>{getInitials(displayName)}</div>
                <div style={styles.profileInfo}>
                  <div style={styles.profileName}>{displayName}</div>
                  <div style={styles.profileDomain}>{displayDomain}</div>
                  <div style={styles.profileDID} title={displayDID}>
                    {displayDID.slice(0, 24)}...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Desktop Sidebar */}
      <div style={styles.sidebar} className="hidden lg:flex lg:w-64">
        <div style={styles.logo}>
          <img
            src="/assets/sphyre-text.png"
            alt="Sphyre Issuers"
            style={styles.logoImage}
          />
        </div>

        <div style={styles.nav}>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                to={item.href}
                style={{
                  ...styles.navItem,
                  ...(isActive ? styles.navItemActive : styles.navItemInactive),
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <item.icon 
                  style={{
                    ...styles.navIcon, 
                    color: isActive ? '#0005FF' : '#8B8B9E'
                  }} 
                />
                <span style={{
                  ...styles.navText,
                  color: isActive ? '#FFFFFF' : '#8B8B9E'
                }}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>

        <div style={styles.footer}>
          <div style={styles.profile}>
            <div style={styles.avatar}>{getInitials(displayName)}</div>
            <div style={styles.profileInfo}>
              <div style={styles.profileName}>{displayName}</div>
              <div style={styles.profileDomain}>{displayDomain}</div>
              <div style={styles.profileDID} title={displayDID}>
                {displayDID.slice(0, 24)}...
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
