import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ children, title }) => {
  return (
    <div style={{ minHeight: '100vh', background: '#131313', display: 'flex' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', marginLeft: '256px' }} className="lg:ml-64">
        <Header title={title} />
        <main style={{ flex: 1, padding: '24px' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;