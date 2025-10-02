'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Camera, Upload, Check, X } from 'lucide-react';

export default function PhotoUploadPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [documentImage, setDocumentImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [verificationMethod, setVerificationMethod] = useState<string | null>(null);
  // Camera capture state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  useEffect(() => {
    setMounted(true);

    // Retrieve form data from sessionStorage
    const storedFormData = sessionStorage.getItem('identity_verification_form');
    if (storedFormData) {
      try {
        const parsedData = JSON.parse(storedFormData);
        if (parsedData.verificationMethod) {
          setVerificationMethod(parsedData.verificationMethod);
        }
        // Note: We can't retrieve the File object from sessionStorage
        // so we'll need to have the user upload it again
      } catch (error) {
        console.error('Error parsing stored form data:', error);
      }
    }
  }, []);

  // Camera controls
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('This device/browser does not support camera.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOpen(true);
    } catch (e: unknown) {
      console.error('Failed to start camera', e);
      if (e instanceof Error) {
        setCameraError(e.message);
      } else {
        setCameraError('Failed to open camera.');
      }
    }
  };

  const stopCamera = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } finally {
      setCameraOpen(false);
    }
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      // Create a File from the blob
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setDocumentImage(file);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      // Persist filename in session storage (cannot persist file)
      const storedFormData = sessionStorage.getItem('identity_verification_form');
      const formData = storedFormData ? JSON.parse(storedFormData) : {};
      formData.documentImageName = file.name;
      sessionStorage.setItem('identity_verification_form', JSON.stringify(formData));
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setDocumentImage(file);

      // Create a preview URL for the image
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      // Store the file name in sessionStorage (we can't store the actual File object)
      const storedFormData = sessionStorage.getItem('identity_verification_form');
      const formData = storedFormData ? JSON.parse(storedFormData) : {};
      formData.documentImageName = file.name;
      sessionStorage.setItem('identity_verification_form', JSON.stringify(formData));
    }
  };

  const handleSubmit = async () => {
    if (documentImage) {
      try {
        // In a real implementation, you would upload the image to a server here

        // Check if we have a pending credential offer
        const pendingCredentialOffer = sessionStorage.getItem('credential_offer_pending');

        if (pendingCredentialOffer) {
          console.log('Processing pending credential offer');

          // Retrieve the complete form data
          const formData = sessionStorage.getItem('identity_verification_form');
          if (formData) {
            const parsedFormData = JSON.parse(formData);
            console.log('Accepting credential offer with form data:', parsedFormData);

            // Show loading state or spinner here

            // Simulate API call to accept credential
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Clear the credential offers from sessionStorage
            sessionStorage.removeItem('credential_offer');
            sessionStorage.removeItem('credential_offer_pending');

            alert('Credential accepted successfully!');
          }
        } else {
          // Regular form submission without credential offer
          console.log('Identity verification completed successfully');
          alert('Identity verification submitted successfully!');
        }

        // Clear form data from sessionStorage
        sessionStorage.removeItem('identity_verification_form');

        // Navigate back to the identity page
        router.push('/SSIWalletIdentity');
      } catch (error) {
        console.error('Error processing submission:', error);
        alert('There was an error processing your submission. Please try again.');
      }
    }
  };

  const handleBack = () => {
    router.push('/VerificationMethodSelection');
  };

  const getDocumentTypeName = () => {
    switch (verificationMethod) {
      case 'passport':
        return 'Passport';
      case 'driverLicense':
        return 'Driver License';
      case 'identityCard':
        return 'Identity Card';
      case 'residencePermit':
        return 'Residence Permit';
      default:
        return 'Document';
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <p className="text-black">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
        <button onClick={handleBack} className="mr-3">
          <ArrowLeft size={24} className="text-black" />
        </button>
        <h1 className="text-lg font-semibold text-black">Upload Document Photo</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6 space-y-6">
        <h2 className="text-xl font-semibold text-black text-center">
          Upload Your {getDocumentTypeName()} Photo
        </h2>

        <p className="text-gray-600 text-center">
          Please make sure that the picture is clear and all information is readable
        </p>

        {/* Document Image Upload */}
        <div className="space-y-4">
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageUpload}
              className="hidden"
              id="document-upload"
            />
            <label
              htmlFor="document-upload"
              className={`w-full h-60 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors ${
                previewUrl 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-gray-300 bg-gray-100 hover:bg-gray-50'
              }`}
            >
              {previewUrl ? (
                <div className="relative w-full h-full p-2">
                  <Image 
                    src={previewUrl} 
                    alt="Document preview"
                    fill
                    style={{ objectFit: 'contain' }}
                  />
                  <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full">
                    <Check size={16} />
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-gray-400 mb-2">
                    <Camera size={48} />
                  </div>
                  <span className="text-sm text-gray-500 block mb-1">
                    Tap to upload {getDocumentTypeName().toLowerCase()} photo
                  </span>
                  <span className="text-xs text-gray-400">
                    Supported formats: JPG, PNG
                  </span>
                </div>
              )}
            </label>
          </div>

          {documentImage && (
            <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200">
              <div className="flex items-center">
                <div className="text-green-600 mr-2">
                  <Upload size={20} />
                </div>
                <span className="text-sm text-gray-700 truncate max-w-[200px]">
                  {documentImage.name}
                </span>
              </div>
              <span className="text-xs text-gray-500">
                {(documentImage.size / 1024).toFixed(0)} KB
              </span>
            </div>
          )}
        </div>

        {/* Camera Capture */}
        <div className="space-y-3">
          {!cameraOpen && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-black text-white hover:bg-gray-800"
              >
                <Camera size={18} /> Take photo with camera
              </button>
            </div>
          )}

          {cameraError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{cameraError}</div>
          )}

          {cameraOpen && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-64 object-contain bg-black" />
              </div>
              <div className="p-4 bg-black/90 border-t border-gray-800">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={stopCamera}
                    aria-label="Close camera"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20"
                  >
                    <X size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    aria-label="Shutter"
                    className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                  >
                    <span className="absolute inset-2 rounded-full border-4 border-black/80"></span>
                  </button>
                  <div className="w-10 h-10" aria-hidden="true"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-blue-800 font-medium mb-2">Tips for a good photo:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Ensure all text is clearly visible</li>
            <li>• Make sure the entire document is in the frame</li>
            <li>• Avoid glare or shadows on the document</li>
            <li>• Take the photo in good lighting</li>
          </ul>
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            onClick={handleSubmit}
            className={`w-full py-4 rounded-full font-medium text-lg transition-colors ${
              documentImage
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            disabled={!documentImage}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
