import { useEffect, useState } from 'react';

interface Profile {
  username: string;
  imageUrl: string;
  did?: string;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user_profile');
    if (stored) {
      try {
        setProfile(JSON.parse(stored));
      } catch {
        setProfile(null);
      }
    } else {
      const userDID = localStorage.getItem('userDID');
      const defaultProfile = {
        username: userDID ? `user_${userDID.slice(-8)}` : 'User',
        imageUrl: '/assets/profile.JPG',
        did: userDID || undefined,
      };
      setProfile(defaultProfile);
      localStorage.setItem('user_profile', JSON.stringify(defaultProfile));
    }
  }, []);

  const updateProfile = (updates: Partial<Profile>) => {
    if (!profile) return;
    const updated = { ...profile, ...updates };
    setProfile(updated);
    localStorage.setItem('user_profile', JSON.stringify(updated));
  };

  return { profile, updateProfile };
}
