'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseCameraOptions {
  facingMode?: 'user' | 'environment';
  onStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
}

export function useCamera(options: UseCameraOptions = {}) {
  const { facingMode = 'environment', onStream, onError } = options;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped track: ${track.kind}`);
      });
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Stop any existing stream
      stopStream();

      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available. Please use HTTPS connection.');
      }

      console.log('Requesting camera access...');
      
      // Try different constraint sets
      const constraintSets = [
        {
          video: {
            facingMode: { exact: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        },
        {
          video: {
            facingMode: facingMode,
            width: { min: 640 },
            height: { min: 480 }
          },
          audio: false
        },
        // Fallback to any camera
        {
          video: true,
          audio: false
        }
      ];

      let newStream: MediaStream | null = null;
      let lastError: Error | null = null;

      // Try each constraint set
      for (const constraints of constraintSets) {
        try {
          console.log('Trying constraints:', constraints);
          newStream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log('Successfully got stream with constraints:', constraints);
          break;
        } catch (err) {
          console.log('Failed with constraints:', constraints, err);
          lastError = err as Error;
        }
      }

      if (!newStream) {
        throw lastError || new Error('Could not access camera');
      }

      streamRef.current = newStream;
      setStream(newStream);
      setHasPermission(true);
      
      // Attach to video element if available
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        // Important for iOS
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.muted = true;
        
        try {
          await videoRef.current.play();
          console.log('Video playback started');
        } catch (playError) {
          console.warn('Video autoplay failed, user interaction may be needed:', playError);
        }
      }

      onStream?.(newStream);
    } catch (err) {
      const error = err as Error;
      console.error('Camera error:', error);
      
      // Determine permission status from error
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setHasPermission(false);
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setError(new Error('No camera found on this device'));
      } else {
        setError(error);
      }
      
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [facingMode, onStream, onError, stopStream]);

  const requestPermission = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Direct permission request
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Stop the temporary stream
      tempStream.getTracks().forEach(track => track.stop());
      
      // Now start the actual camera
      await startCamera();
    } catch (err) {
      const error = err as Error;
      if (error.name === 'NotAllowedError') {
        setHasPermission(false);
      }
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [startCamera, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return {
    videoRef,
    stream,
    isLoading,
    error,
    hasPermission,
    startCamera,
    stopStream,
    requestPermission,
  };
}
