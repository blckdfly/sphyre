export function shortenDID(did: string, startChars: number = 6, endChars: number = 6): string {
  if (!did) return '';
  const parts = did.split(':');
  
  if (parts.length < 3) {
    return did.length > 20 ? `${did.slice(0, 10)}...${did.slice(-6)}` : did;
  }
  
  const method = parts[1]; 
  const identifier = parts.slice(2).join(':');
  
  if (identifier.length <= (startChars + endChars + 3)) {
    return `did:${method}:${identifier}`;
  }

  const shortened = `${identifier.slice(0, startChars)}...${identifier.slice(-endChars)}`;
  return `did:${method}:${shortened}`;
}

export function ultraShortenDID(did: string): string {
  if (!did) return '';
  
  const parts = did.split(':');
  
  if (parts.length < 3) {
    return did.length > 12 ? `${did.slice(0, 8)}...` : did;
  }
  
  const method = parts[1].slice(0, 3); 
  const identifier = parts.slice(2).join(':');
  const lastChars = identifier.slice(-3);
  
  return `did:${method}...${lastChars}`;
}

export function getDIDDisplayName(did: string): string {
  if (!did) return '';
  
  const parts = did.split(':');
  
  if (parts.length < 3) {
    return did;
  }
  
  const method = parts[1];
  const identifier = parts.slice(2).join(':');
  
  if (identifier.length <= 16) {
    return `${method}:${identifier}`;
  }
  
  const shortened = `${identifier.slice(0, 8)}...${identifier.slice(-6)}`;
  return `${method}:${shortened}`;
}

export async function copyDIDToClipboard(did: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(did);
    return true;
  } catch (error) {
    console.error('Failed to copy DID:', error);
    return false;
  }
}

export function isValidDID(did: string): boolean {
  if (!did) return false;

  const didPattern = /^did:[a-z0-9]+:.+$/i;
  return didPattern.test(did);
}

export function getDIDMethod(did: string): string {
  if (!did) return '';
  
  const parts = did.split(':');
  return parts.length >= 2 ? parts[1] : '';
}

export function formatDIDForContext(
  did: string,
  context: 'full' | 'short' | 'ultra' | 'display' = 'short'
): string {
  switch (context) {
    case 'full':
      return did;
    case 'ultra':
      return ultraShortenDID(did);
    case 'display':
      return getDIDDisplayName(did);
    case 'short':
    default:
      return shortenDID(did);
  }
}