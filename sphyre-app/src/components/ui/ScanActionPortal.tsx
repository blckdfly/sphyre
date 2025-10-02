'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
}

const ScanActionPortal = ({ children }: PortalProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const portalRoot = document.getElementById('portal-root');
  return portalRoot ? createPortal(children, portalRoot) : null;
};

export default ScanActionPortal;