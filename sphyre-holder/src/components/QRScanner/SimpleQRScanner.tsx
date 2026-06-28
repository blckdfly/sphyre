'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { useCamera } from '@/hooks/useCamera';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface SimpleQRScannerProps {
  onScan: (data: string) => void;
  onError?: (error: Error) => void;
  facingMode?: 'user' | 'environment';
}

export function SimpleQRScanner({ onScan, onError, facingMode = 'environment' }: SimpleQRScannerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const {
    videoRef,
    isLoading,
    error,
    hasPermission,
    startCamera,
    requestPermission,
  } = useCamera({
    facingMode,
    onError,
  });

  // Scan QR code from video stream
  const scanQRCode = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get image data and scan for QR code
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    
    if (qrCode) {
      console.log('QR Code detected:', qrCode.data);
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      onScan(qrCode.data);
    }
  }, [onScan, videoRef]);

  // Start scanning when video is ready
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    
    const handleVideoReady = () => {
      console.log('Video ready, starting QR scanner');
      scanIntervalRef.current = setInterval(scanQRCode, 250);
    };

    video.addEventListener('loadeddata', handleVideoReady);
    
    // If video is already ready
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      handleVideoReady();
    }

    return () => {
      video.removeEventListener('loadeddata', handleVideoReady);
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [scanQRCode, videoRef]);

  useEffect(() => {
    startCamera();
  }, [startCamera]);

  if (hasPermission === false) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-light-100 rounded-lg">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-dark-500 mb-2">Camera Permission Required</h3>
        <p className="text-dark-300 text-center mb-4">
          Please allow camera access to scan QR codes
        </p>
        <button
          onClick={requestPermission}
          className="px-6 py-3 bg-primary-500 text-light-50 rounded-lg hover:bg-primary-600 font-medium transition-colors"
          disabled={isLoading}
        >
          {isLoading ? 'Requesting...' : 'Request Permission'}
        </button>
      </div>
    );
  }

  // Error state
  if (error && !hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-light-100 rounded-lg">
        <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold text-dark-500 mb-2">Camera Access Issue</h3>
        <p className="text-dark-300 text-center mb-4">
          {error.message}
        </p>
        <p className="text-sm text-dark-300 text-center mb-4">
          {error.message.includes('HTTPS') && (
            'Camera access requires a secure HTTPS connection. This will work once deployed to https://app.sphyre.tech'
          )}
        </p>
        <button
          onClick={startCamera}
          className="px-6 py-3 bg-primary-500 text-light-50 rounded-lg hover:bg-primary-600 font-medium transition-colors"
          disabled={isLoading}
        >
          <RefreshCw className="w-5 h-5 inline mr-2" />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-500 bg-opacity-50 z-10 rounded-lg">
          <div className="bg-light-50 p-4 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
            <p className="mt-2 text-sm">Initializing camera...</p>
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full max-w-lg mx-auto rounded-lg bg-dark-500 aspect-video"
        style={{ minHeight: '300px', objectFit: 'cover' }}
        playsInline
        autoPlay
        muted
      />

      <canvas ref={canvasRef} className="hidden" />

      {!isLoading && hasPermission === true && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-80 h-80 md:w-96 md:h-96 border-4 border-white rounded-2xl shadow-lg"></div>
          </div>
          <div className="absolute bottom-6 left-0 right-0 text-center">
            <p className="text-light-50 text-base font-medium bg-dark-500 bg-opacity-80 inline-block px-4 py-2 rounded-lg">
              Position QR code within the frame
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
