'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, User } from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  currentImageUrl?: string;
  onSave: (username: string, imageFile: File | null) => Promise<void>;
}

const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ 
  isOpen, 
  onClose, 
  currentUsername, 
  currentImageUrl,
  onSave 
}) => {
  const [username, setUsername] = useState(currentUsername);
  const [imagePreview, setImagePreview] = useState<string | null>(currentImageUrl || null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    try {
      let processedFile = file;

      if (file.size > 1024 * 1024) {
        console.log('Original size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
        
        const options = {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1024,
          useWebWorker: true,
          fileType: file.type,
        };

        processedFile = await imageCompression(file, options);
        console.log('Compressed size:', (processedFile.size / 1024 / 1024).toFixed(2), 'MB');
        
        alert(`Image compressed from ${(file.size / 1024 / 1024).toFixed(2)}MB to ${(processedFile.size / 1024 / 1024).toFixed(2)}MB`);
      }

      if (processedFile.size > 1024 * 1024) {
        alert('Image is still too large after compression. Please use a smaller image.');
        return;
      }

      setImageFile(processedFile);

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(processedFile);
    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process image. Please try another image.');
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
      alert('Username cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(username, imageFile);
      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-100">
          <h2 className="text-xl font-semibold text-dark-500">Edit Profile</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-light-200 transition-colors"
            disabled={isSaving}
          >
            <X size={24} className="text-dark-300" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Profile Picture */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-light-200 border-4 border-white shadow-lg">
                {imagePreview ? (
                  // Use img tag for base64 preview (from FileReader or API)
                  <img
                    src={imagePreview}
                    alt="Profile"
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-300">
                    <User size={40} className="text-dark-300" />
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 bg-primary-500 text-white rounded-full shadow-lg hover:bg-primary-600 transition-colors"
                disabled={isSaving}
              >
                <Upload size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-500 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-dark-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              placeholder="Enter username"
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="p-6 border-t border-dark-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-dark-100 text-dark-500 rounded-full font-medium hover:bg-light-100 transition-colors"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-primary-500 text-white rounded-full font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditModal;
