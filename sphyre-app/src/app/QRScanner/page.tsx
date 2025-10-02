'use client';

import React, {useEffect, useRef, useState, useCallback} from 'react';
import {AlertCircle, ArrowLeft, Camera, RefreshCw} from 'lucide-react';
import jsQR from 'jsqr';
import { useRouter } from 'next/navigation';

export default function QRScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scanned, setScanned] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [isPWA, setIsPWA] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isSecureContext, setIsSecureContext] = useState(true);
  const [browserInfo, setBrowserInfo] = useState<{name: string, version: string}>({name: 'unknown', version: 'unknown'});


  // Testing mode - set to true by default to avoid immediate camera permission requests
  const [testingMode] = useState(false);
  const [testQrUrl, setTestQrUrl] = useState('');
  const [pasteSuccess, setPasteSuccess] = useState(false);
  // Camera facing mode - 'environment' for back camera, 'user' for front camera
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  // Counter for failed camera access attempts
  const [failedAttempts, setFailedAttempts] = useState(0);
  // Maximum number of attempts before suggesting testing mode
  const MAX_FAILED_ATTEMPTS = 3;
  // File upload mode
  const [fileUploadMode, setFileUploadMode] = useState(false);

  useEffect(() => {
    // Check if app is running in standalone mode (PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    // Check if app was launched from homescreen (iOS PWA)
    // Use type assertion to handle Safari-specific property
    const isFromHomescreen = ((window.navigator as unknown) as { standalone?: boolean }).standalone === true;

    setIsPWA(isStandalone || isFromHomescreen);

    // Detect Android device
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(userAgent.indexOf('android') > -1);

    // Check if running in a secure context (HTTPS)
    if (typeof window !== 'undefined') {
      if ('isSecureContext' in window) {
        setIsSecureContext(window.isSecureContext);
        console.log('Secure context:', window.isSecureContext);
      } else {
        // Fallback check for older browsers
        // Use type assertion to ensure TypeScript recognizes window as Window object
        const win = window as Window & typeof globalThis;
        setIsSecureContext(win.location.protocol === 'https:');
        console.log('Secure context (fallback check):', win.location.protocol === 'https:');
      }
    }

    // Detect browser information
    const detectBrowser = () => {
      const ua = navigator.userAgent;
      let browserName = "unknown";
      let browserVersion = "unknown";

      // Detect Chrome
      if (ua.indexOf("Chrome") > -1 && ua.indexOf("Edg") === -1 && ua.indexOf("OPR") === -1) {
        browserName = "Chrome";
        const match = ua.match(/Chrome\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      }
      // Detect Firefox
      else if (ua.indexOf("Firefox") > -1) {
        browserName = "Firefox";
        const match = ua.match(/Firefox\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      }
      // Detect Safari
      else if (ua.indexOf("Safari") > -1 && ua.indexOf("Chrome") === -1) {
        browserName = "Safari";
        const match = ua.match(/Version\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      }
      // Detect Edge
      else if (ua.indexOf("Edg") > -1) {
        browserName = "Edge";
        const match = ua.match(/Edg\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      }
      // Detect Opera
      else if (ua.indexOf("OPR") > -1) {
        browserName = "Opera";
        const match = ua.match(/OPR\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      }
      // Detect Samsung Internet
      else if (ua.indexOf("SamsungBrowser") > -1) {
        browserName = "Samsung Internet";
        const match = ua.match(/SamsungBrowser\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      }
      // Detect UC Browser
      else if (ua.indexOf("UCBrowser") > -1) {
        browserName = "UC Browser";
        const match = ua.match(/UCBrowser\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      }

      console.log(`Browser detected: ${browserName} ${browserVersion}`);
      return { name: browserName, version: browserVersion };
    };

    setBrowserInfo(detectBrowser());

    // Listen for changes in display mode
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsPWA(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Function to open app settings on Android devices
  const openAppSettings = () => {
    if (isAndroid) {
      // For Android devices
      try {
        // This will open app settings on Android
        window.location.href = 'app-settings:';
      } catch (error) {
        console.error('Failed to open app settings:', error);
        // Fallback to manual instructions if the intent fails
        alert('Please open your device settings manually and enable camera permissions for this app.');
      }
    }
  };

  // Check camera permission status
  const checkCameraPermission = useCallback(async () => {
    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setPermissionState(permission.state);

        // Listen for permission changes
        permission.onchange = () => {
          setPermissionState(permission.state);
          if (permission.state === 'granted') {
            // We'll handle starting the camera in the effect that depends on permissionState
            setHasPermission(true);
          } else if (permission.state === 'denied') {
            setHasPermission(false);
          }
        };

        return permission.state;
      }
      return 'unknown';
    } catch (error) {
      console.error('Error checking camera permission:', error);
      return 'unknown';
    }
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);

      // Force a permission request by adding audio: false
      // This can help in PWA contexts where permissions might be cached incorrectly
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      let stream;

      try {
        // Try to get user media with a timeout to handle hanging requests
        stream = await Promise.race([
          navigator.mediaDevices.getUserMedia(constraints),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Camera access timeout')), 10000)
          )
        ]) as MediaStream;
      } catch (error) {
        console.log('Primary camera access method failed, trying alternatives:', error);

      }

      if (videoRef.current) {
        const videoEl = videoRef.current;
        videoEl.srcObject = stream;
        // Ensure mobile autoplay works and avoid iOS going fullscreen
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('autoplay', 'true');
        videoEl.setAttribute('muted', 'true');
        videoEl.playsInline = true;
        videoEl.muted = true;
        try {
          await videoEl.play();
        } catch (playErr) {
          console.warn('video.play() failed, will try after metadata is loaded:', playErr);
          videoEl.addEventListener('loadedmetadata', () => {
            videoEl.play().catch(err => console.error('video.play() after metadata failed:', err));
          }, { once: true });
        }
        setHasPermission(true);
        setPermissionState('granted');

        // Clear localStorage flag since camera access is now successful
        try {
          localStorage.removeItem('cameraAccessIssues');
          console.log('Cleared localStorage flag for camera access issues');
        } catch (error) {
          console.error('Error clearing localStorage flag:', error);
        }
      }
    } catch (error) {
      console.error('Error accessing camera:', error);

      // Check if this is a NotAllowedError, which indicates permission issues
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        console.log('Camera permission denied or dismissed');
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        console.log('No camera found on this device');
      } else if (error instanceof Error && error.message === 'Camera access timeout') {
        console.log('Camera access request timed out');
      }

      // Increment failed attempts counter
      const newFailedAttempts = failedAttempts + 1;
      setFailedAttempts(newFailedAttempts);
      console.log(`Camera access failed (attempt ${newFailedAttempts} of ${MAX_FAILED_ATTEMPTS})`);

      // If we've reached the maximum number of attempts, suggest testing mode
      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        console.log('Maximum failed attempts reached, suggesting testing mode');
        // We'll show a message to the user suggesting testing mode
        // but we won't automatically switch to avoid disrupting the user experience

        // Set localStorage flag to remember camera access issues for next time
        try {
          localStorage.setItem('cameraAccessIssues', 'true');
          console.log('Set localStorage flag for camera access issues');
        } catch (error) {
          console.error('Error setting localStorage flag:', error);
        }
      }

      setHasPermission(false);
      setPermissionState('denied');
    } finally {
      setIsLoading(false);
    }
  }, [facingMode, failedAttempts, MAX_FAILED_ATTEMPTS, videoRef]);

  // Request camera permission with automatic system prompt
  const requestCameraPermission = useCallback(async () => {
    try {
      setIsRequestingPermission(true);
      setIsLoading(true);

      console.log('Explicitly requesting camera permission...');

      // First try the most direct approach to trigger permission prompt
      try {
        // This is the most direct way to trigger the permission prompt
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

        // If we get here, permission was granted
        console.log('Direct permission request succeeded');

        // Stop the stream immediately as we'll restart it properly
        stream.getTracks().forEach(track => track.stop());

        // Now start the camera with our preferred settings
        await startCamera();
        return;
      } catch (directError) {
        console.log('Direct permission request failed, trying fallback:', directError);
      }

      // If direct approach failed, try the normal approach
      await startCamera();
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setHasPermission(false);
      setPermissionState('denied');
    } finally {
      setIsRequestingPermission(false);
      setIsLoading(false);
    }
  }, [startCamera]);

  // Show native permission request immediately
  const showNativePermissionPrompt = useCallback(async () => {
    try {
      // Request permission immediately when component mounts
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === 'videoinput');

      if (!hasCamera) {
        throw new Error('No camera found');
      }

      // This will trigger native permission prompt
      await requestCameraPermission();
    } catch (error) {
      console.error('Error showing native permission prompt:', error);
      setHasPermission(false);
      setIsLoading(false);
    }
  }, [requestCameraPermission]);

  // Force a complete reset and try multiple methods to request camera permission
  const forceResetAndRequestPermission = async () => {
    console.log('Forcing complete reset and trying multiple permission request methods');

    // Reset all state
    setIsLoading(true);
    setHasPermission(null);
    setPermissionState('unknown');

    // Stop any existing camera stream
    const video = videoRef.current;
    if (video && video.srcObject) {
      const tracks = (video.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      video.srcObject = null;
    }

    try {
      // Method 1: Direct minimal request
      try {
        console.log('Trying method 1: Direct minimal request');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('Method 1 succeeded');

        // If successful, start camera properly
        await startCamera();
        return;
      } catch (error1) {
        console.log('Method 1 failed:', error1);
      }

      // Method 2: Request with audio false to force a new prompt
      try {
        console.log('Trying method 2: With audio false');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach(track => track.stop());
        console.log('Method 2 succeeded');

        // If successful, start camera properly
        await startCamera();
        return;
      } catch (error2) {
        console.log('Method 2 failed:', error2);
      }

      // Method 3: Try with front camera
      try {
        console.log('Trying method 3: Front camera');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' } 
        });
        stream.getTracks().forEach(track => track.stop());
        console.log('Method 3 succeeded');

        // If successful, start camera properly
        await startCamera();
        return;
      } catch (error3) {
        console.log('Method 3 failed:', error3);
      }

      // If all direct methods failed, try the standard approach
      console.log('All direct methods failed, trying standard approach');
      await requestCameraPermission();

    } catch (error) {
      console.error('All permission request methods failed:', error);
      setHasPermission(false);
      setPermissionState('denied');
      setIsLoading(false);
    }
  };

  // Initialize camera on component mount
  useEffect(() => {
    // If in testing mode, skip camera initialization and set permission as granted
    if (testingMode) {
      console.log('Testing mode enabled, bypassing camera permissions');
      setHasPermission(true);
      setPermissionState('granted');
      setIsLoading(false);
      // Reset failed attempts counter when switching to testing mode
      setFailedAttempts(0);
      return;
    }

    const initializeCamera = async () => {
      try {
        console.log('Initializing camera...');

        // Always try to directly request permission first in PWA mode
        // This is more aggressive but ensures the permission prompt is shown
        if (isPWA) {
          console.log('PWA mode detected, using direct permission request approach');
          try {
            // Force a permission request
            await requestCameraPermission();
            return;
          } catch (pwaError) {
            console.error('PWA direct permission request failed:', pwaError);
            // Continue with normal flow if direct request fails
          }
        }

        // Check if we already have permission
        const permission = await checkCameraPermission();
        console.log('Current camera permission state:', permission);

        if (permission === 'granted') {
          // Even if permission is granted, we need to handle PWA-specific issues
          try {
            await startCamera();
          } catch (error) {
            console.error('Failed to start camera despite having permission:', error);
            // If we're in PWA mode, this might be a PWA-specific permission issue
            if (isPWA) {
              setHasPermission(false);
              setPermissionState('denied');
            }
          }
        } else if (permission === 'prompt' || permission === 'unknown') {
          // Automatically show permission prompt
          console.log('Permission state is prompt/unknown, showing native permission prompt');
          showNativePermissionPrompt();
        } else if (permission === 'denied') {
          console.log('Permission already denied');
          setHasPermission(false);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error during camera initialization:', error);
        setHasPermission(false);
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      initializeCamera();
    }, 500);

    // Capture ref value inside effect scope for cleanup
    const video = videoRef.current;
    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
      if (video && video.srcObject) {
        const tracks = (video.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [checkCameraPermission, showNativePermissionPrompt, isPWA, requestCameraPermission, testingMode, startCamera, facingMode]);

  // Effect to start camera when permission state changes to granted
  useEffect(() => {
    if (permissionState === 'granted' && hasPermission === true && !testingMode && !isLoading) {
      startCamera();
    }
  }, [permissionState, hasPermission, testingMode, isLoading, startCamera]);

  useEffect(() => {
    if (pasteSuccess) {
      const timer = setTimeout(() => {
        setPasteSuccess(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [pasteSuccess]);

  // Function to toggle camera facing mode
  const toggleCameraFacingMode = async () => {

    const video = videoRef.current;
    if (video && video.srcObject) {
      const tracks = (video.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      video.srcObject = null;
    }

    // Toggle facing mode
    setFacingMode(prevMode => prevMode === 'environment' ? 'user' : 'environment');

    // Reset scanning state
    setScanned(false);

    // Restart camera with new facing mode
    setIsLoading(true);
    try {
      await startCamera();
    } catch (error) {
      console.error('Error switching camera:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle file selection for QR code image upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      console.log('No file selected');
      return;
    }

    const file = files[0];
    console.log('File selected:', file.name);

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setIsLoading(true);
    processQRCodeImage(file);
  };

  // Function to process QR code image
  const processQRCodeImage = (file: File) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target || !e.target.result) {
        console.error('Error reading file');
        setIsLoading(false);
        return;
      }

      const img = new Image();
      img.onload = () => {
        // Create a canvas to draw the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          console.error('Could not get canvas context');
          setIsLoading(false);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image to canvas
        ctx.drawImage(img, 0, 0);

        // Get image data for QR code scanning
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Use jsQR to detect QR code
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (qrCode) {
          console.log('QR code detected in image:', qrCode.data);
          setScanned(true);

          // Process the QR code data (URL)
          handlePayload(qrCode.data);
        } else {
          console.error('No QR code found in image');
          alert('No QR code found in the uploaded image. Please try another image or use a different method.');
        }

        setIsLoading(false);
      };

      img.onerror = () => {
        console.error('Error loading image');
        alert('Error loading image. Please try another image.');
        setIsLoading(false);
      };

      img.src = e.target.result as string;
    };

    reader.onerror = () => {
      console.error('Error reading file');
      alert('Error reading file. Please try again.');
      setIsLoading(false);
    };

    // Read the file as a data URL
    reader.readAsDataURL(file);
  };

  // Define interface for payload response
  interface PayloadResponse {
    type: 'credential_offer' | 'presentation_request';
    [key: string]: unknown;
  }

  // Function to check URL format for type indication
  const checkUrlFormat = useCallback((url: string): 'credential_offer' | 'presentation_request' | null => {
    try {
      const urlObj = new URL(url);

      // Check for specific path patterns
      if (urlObj.pathname.includes('/offer/') || urlObj.pathname.startsWith('/offer') || 
          urlObj.pathname.includes('/credential/') || urlObj.pathname.startsWith('/credential')) {
        return 'credential_offer';
      }

      if (urlObj.pathname.includes('/request/') || urlObj.pathname.startsWith('/request') || 
          urlObj.pathname.includes('/presentation/') || urlObj.pathname.startsWith('/presentation')) {
        return 'presentation_request';
      }

      // Check for query parameters
      const params = new URLSearchParams(urlObj.search);
      if (params.get('type') === 'offer' || params.get('type') === 'credential_offer') {
        return 'credential_offer';
      }
      if (params.get('type') === 'request' || params.get('type') === 'presentation_request') {
        return 'presentation_request';
      }

      return null;
    } catch (error) {
      console.error('Error parsing URL:', error);
      return null;
    }
  }, []);

  // Function to fetch payload from URL
  const fetchPayload = useCallback(async (url: string): Promise<PayloadResponse> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching payload:', error);
      throw error;
    }
  }, []);

  // Function to handle different payload types
  const handlePayload = useCallback(async (url: string) => {
    try {
      console.log('Processing URL:', url);

      const urlFormatType = checkUrlFormat(url);
      if (urlFormatType) {
        console.log(`URL format indicates type: ${urlFormatType}`);
      }

      // Fetch the payload regardless of URL format
      console.log('Fetching payload from URL:', url);
      let payload: PayloadResponse;

      try {
        payload = await fetchPayload(url);
        console.log('Payload received:', payload);
      } catch (error) {
        console.error('Error fetching payload:', error);

        // If we couldn't fetch the payload but have a URL format type, create a basic payload
        if (urlFormatType) {
          console.log(`Using URL format type: ${urlFormatType} as fallback`);
          payload = { type: urlFormatType };
        } else {
          throw error; // Re-throw if we have no fallback
        }
      }

      // Determine the type from payload or URL format
      const type = payload.type || urlFormatType;

      // Handle different payload types
      if (type === 'credential_offer') {
        console.log('Processing credential offer');
        sessionStorage.setItem('credential_offer', JSON.stringify(payload));

        // Navigate directly to the Collect Credentials page
        router.push('/CollectCredentials');
      } else if (type === 'presentation_request') {
        console.log('Processing presentation request');
        // Store the presentation request data in localStorage or sessionStorage
        // so it can be accessed by the CredentialRequest page
        sessionStorage.setItem('presentation_request', JSON.stringify(payload));

        // Navigate to the Credential Request page
        router.push('/CredentialRequest');
      } else {
        console.warn('Unknown payload type:', type);
        // For unknown types, just go back to the previous page
        router.back();
      }
    } catch (error) {
      console.error('Error handling payload:', error);
      // If there's an error, go back to the previous page
      router.back();
    }
  }, [router, checkUrlFormat, fetchPayload]);

  // Function to handle back button click
  const handleBack = () => {
    // Stop any active camera stream
    const video = videoRef.current;
    if (video && video.srcObject) {
      const tracks = (video.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }

    // Navigate back to the previous page
    router.back();
  };

  // QR code detection logic
  useEffect(() => {
    // Skip if in testing mode
    if (testingMode) return;

    if (!videoRef.current || !canvasRef.current || isLoading || scanned) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const scanInterval = setInterval(() => {
        if (scanned) {
          clearInterval(scanInterval);
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data for QR code scanning
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Use jsQR to detect QR code
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (qrCode) {
          console.log('QR code detected:', qrCode.data);
          setScanned(true);

          // Process the QR code data (URL)
          handlePayload(qrCode.data);
        }
      }, 500);

      return () => clearInterval(scanInterval);
    };
  }, [isLoading, scanned, videoRef, canvasRef, handlePayload, testingMode]);

  // Permission denied screen
  if (hasPermission === false || permissionState === 'denied') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-white p-4">
        <div className="text-center max-w-sm">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-bold mb-4">Camera Access Required</h2>

          {/* Secure context warning */}
          {!isSecureContext && (
            <div className="bg-red-500/20 border border-red-500 rounded-md p-4 mb-6">
              <p className="text-red-300 font-medium mb-2">
                Non-Secure Connection Detected
              </p>
              <p className="text-gray-300 text-sm mb-3">
                Camera access requires a secure connection (HTTPS). Your current connection is not secure, which may be preventing camera access.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (window.location.protocol === 'http:') {
                      window.location.href = window.location.href.replace('http:', 'https:');
                    }
                  }}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-full font-medium transition-colors text-sm"
                >
                  Try Secure Connection
                </button>
              </div>
            </div>
          )}

          {/* Browser-specific guidance */}
          {browserInfo.name !== 'unknown' && (
            <div className="bg-blue-500/20 border border-blue-500 rounded-md p-4 mb-6">
              <p className="text-blue-300 font-medium mb-2">
                {browserInfo.name} Browser Detected
              </p>
              <p className="text-gray-300 text-sm mb-3">
                {browserInfo.name === 'Safari' && 'Safari may require explicit permission in Settings. Check both website settings and camera permissions.'}
                {browserInfo.name === 'Chrome' && 'Chrome requires HTTPS for camera access. Check the camera icon in the address bar to manage permissions.'}
                {browserInfo.name === 'Firefox' && 'Firefox may block camera access. Click the camera icon in the address bar to allow access.'}
                {browserInfo.name === 'Edge' && 'Edge requires permission to be granted. Check the camera icon in the address bar.'}
                {browserInfo.name === 'Samsung Internet' && 'Samsung Internet may require permissions to be set in both browser and device settings.'}
                {browserInfo.name === 'UC Browser' && 'UC Browser may have additional security settings blocking camera access.'}
              </p>
            </div>
          )}

          {failedAttempts >= MAX_FAILED_ATTEMPTS ? (
            <div className="bg-yellow-500/20 border border-yellow-500 rounded-md p-4 mb-6">
              <p className="text-yellow-300 font-medium mb-2">
                Multiple camera access attempts failed
              </p>
              <p className="text-gray-300 text-sm mb-3">
                Having trouble accessing your camera. Try one of these alternative methods:
              </p>

            </div>
          ) : (
            <p className="text-center mb-6 text-gray-300">
              To scan QR codes, this app needs access to your camera.
              Please allow camera permission when prompted by your device.
            </p>
          )}

          <div className="space-y-4">
            <button
              onClick={forceResetAndRequestPermission}
              disabled={isRequestingPermission}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-full w-full transition-colors"
            >
              <Camera size={20} />
              {isRequestingPermission ? 'Requesting Permission...' : 'Force Camera Access'}
            </button>

            <div className="text-sm text-gray-400">
              {!isPWA ? (
                <>
                  <p className="mb-2">If permission was denied in browser:</p>
                  <ol className="list-decimal list-inside text-left space-y-1">
                    <li>Look for camera icon in your browser address bar</li>
                    <li>Click it and select Allow</li>
                    <li>Or refresh the page and try again</li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="mb-2">Since using the installed app:</p>
                  <ol className="list-decimal list-inside text-left space-y-1">
                    <li>Go to your device Settings</li>
                    <li>Find Apps or Application Manager</li>
                    <li>Find Sphyre in the list</li>
                    <li>Go to Permissions</li>
                    <li>Enable Camera access</li>
                    <li>Return to app and try again</li>
                  </ol>
                  <p className="mt-2 text-yellow-400">
                    Note: Even if you allowed camera access in browser settings, 
                    you need to also allow it in device settings when using as an installed app.
                  </p>

                  {isPWA && isAndroid && (
                    <button
                      onClick={openAppSettings}
                      className="mt-3 w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded-full transition-colors flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                      Open Device Settings
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-full flex-1 transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-full flex-1 transition-colors"
              >
                Go Back
              </button>
            </div>

            <button
              onClick={forceResetAndRequestPermission}
              className="mt-4 w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-full transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
              Try Multiple Methods
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main scanner interface
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={handleBack} className="text-white hover:text-gray-300 transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-white text-lg font-medium ml-4">
            {testingMode ? 'Test QR Code' : 'Scan QR Code'}
          </h1>
        </div>

      </div>

      {false ? (
        // Testing Mode UI
        <div className="flex-grow flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm bg-gray-800 rounded-lg p-6">
            <h2 className="text-white text-lg font-medium mb-2">Alternative Methods</h2>

            {/* Mode tabs */}
            <div className="flex mb-6 bg-gray-700 rounded-lg p-1">
              <button 
                onClick={() => setFileUploadMode(false)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${!fileUploadMode ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'}`}
              >
                Manual URL Entry
              </button>
              <button 
                onClick={() => setFileUploadMode(true)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${fileUploadMode ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'}`}
              >
                Upload QR Image
              </button>
            </div>

            {!fileUploadMode ? (
              // Manual URL Entry Mode
              <div className="space-y-4">
                <p className="text-gray-300 text-sm mb-2">
                  Enter a URL that would normally be encoded in a QR code:
                </p>

                <input
                  type="text"
                  value={testQrUrl}
                  onChange={(e) => setTestQrUrl(e.target.value)}
                  onPaste={(e) => {
                    const pasteData = e.clipboardData.getData('text');
                    setTestQrUrl(pasteData);
                    setPasteSuccess(true);
                    console.log('Pasted data:', pasteData);
                  }}
                  placeholder="Enter QR URL"
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent z-10"
                />
                <div className="flex items-center gap-2">
                  <p className="text-gray-400 text-xs italic flex-1">
                    Tip: You can copy-paste links directly into this field
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        // Check if Clipboard API is available
                        if (!navigator.clipboard) {
                          throw new Error('Clipboard API not available');
                        }

                        const text = await navigator.clipboard.readText();
                        setTestQrUrl(text);
                        setPasteSuccess(true);
                        console.log('Clipboard content pasted:', text);
                      } catch (err) {
                        console.error('Failed to read clipboard:', err);

                        if (err instanceof Error && err.message === 'Clipboard API not available') {
                          alert('Your browser does not support automatic clipboard access. Please use Ctrl+V or long-press and paste manually.');
                        } else {
                          alert('Could not access clipboard. Please paste manually using Ctrl+V (desktop) or long-press and paste (mobile).');
                        }
                      }
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white transition-colors"
                  >
                    Paste from Clipboard
                  </button>
                </div>

                {pasteSuccess && (
                  <div className="bg-green-600 bg-opacity-20 border border-green-500 rounded-md p-2 mt-2 mb-2 flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-500 text-sm">Link pasted successfully!</span>
                  </div>
                )}
              </div>
            ) : (
              // File Upload Mode
              <div className="space-y-4">
                <p className="text-gray-300 text-sm mb-2">
                  Upload an image containing a QR code:
                </p>

                <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*"
                    className="hidden"
                    id="qr-file-input"
                  />
                  <label 
                    htmlFor="qr-file-input"
                    className="cursor-pointer flex flex-col items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-300 text-sm font-medium mb-1">Click to select an image</span>
                    <span className="text-gray-400 text-xs">or drag and drop</span>
                  </label>
                </div>

                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  Select Image File
                </button>

                {isLoading && (
                  <div className="bg-blue-600 bg-opacity-20 border border-blue-500 rounded-md p-3 mt-2 mb-2 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-3"></div>
                    <span className="text-blue-500 text-sm">Processing image...</span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 p-4 bg-gray-700 rounded-lg">
              <h3 className="text-white text-sm font-medium mb-2">Instructions:</h3>
              {!fileUploadMode ? (
                <ol className="text-gray-300 text-xs space-y-1 list-decimal list-inside">
                  <li>Enter a URL that points to a JSON endpoint</li>
                  <li>The JSON should have a type field with value credential_offer or presentation_request</li>
                  <li>Alternatively, use URL format to indicate type:</li>
                  <ul className="text-gray-300 text-xs space-y-1 list-disc list-inside ml-4 mt-1">
                    <li>For credential offers: /offer/... or ?type=offer</li>
                    <li>For presentation requests: /request/... or ?type=request</li>
                  </ul>
                  <li>Click Process QR URL to simulate scanning a QR code</li>
                </ol>
              ) : (
                <ol className="text-gray-300 text-xs space-y-1 list-decimal list-inside">
                  <li>Select or drag an image containing a QR code</li>
                  <li>The image should be clear and well-lit</li>
                  <li>The QR code should contain a URL that follows the format described in the URL entry tab</li>
                  <li>The system will automatically process the QR code once uploaded</li>
                </ol>
              )}
            </div>

            {scanned && (
              <p className="mt-4 text-green-400 text-sm text-center">
                QR code processed! Redirecting...
              </p>
            )}
          </div>
        </div>
      ) : (
        // Regular Camera View
        <div className="flex-grow flex items-center justify-center p-6">
          <div className="relative w-full max-w-sm aspect-square">
            {/* Frame border */}
            <div className="absolute inset-0 border-8 border-blue-600 rounded-lg z-10"></div>

            {/* Camera feed */}
            <div className="absolute inset-0 overflow-hidden rounded-lg">
              {isLoading ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-black">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
                  <p className="text-white text-sm mb-4">
                    {isRequestingPermission ? 'Requesting camera access...' : 'Loading camera...'}
                  </p>

                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        console.log('Manual permission request triggered by user');
                        forceResetAndRequestPermission();
                      }}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-full text-sm transition-colors"
                    >
                      Tap to Force Camera Access
                    </button>

                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Hidden canvas for QR detection */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Scan area indicator */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3/4 h-3/4 border-2 border-white/50 rounded-lg">
                {/* Scanning animation */}
                <div className="relative w-full h-full">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-green-500 animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Camera switch button */}
            <button 
              onClick={toggleCameraFacingMode}
              className="absolute bottom-4 right-4 px-4 py-2 bg-gray-800 bg-opacity-70 rounded-full text-white hover:bg-gray-700 transition-colors z-20 pointer-events-auto flex items-center gap-2"
              aria-label={`Switch to ${facingMode === 'environment' ? 'front' : 'back'} camera`}
            >
              <RefreshCw size={20} />
              <span className="text-sm">Switch Camera</span>
            </button>
          </div>
        </div>
      )}

      {/* Instructions and Alternative Methods */}
      <div className="p-6 text-center">
        {!testingMode && (
          <>
            {/* Secure context warning in camera mode */}
            {!isSecureContext && (
              <div className="bg-red-500/20 border border-red-500 rounded-md p-3 mb-4">
                <p className="text-red-300 text-sm font-medium mb-1">
                  Non-Secure Connection Detected
                </p>
                <p className="text-gray-300 text-xs mb-2">
                  Camera access requires HTTPS. Your connection is not secure.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
              
                      if (window.location.protocol === 'http:') {
                        window.location.href = window.location.href.replace('http:', 'https:');
                      }
                    }}
                    className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 rounded-md text-xs transition-colors"
                  >
                    Try Secure Connection
                  </button>
                </div>
              </div>
            )}

            <p className="text-white text-sm">
              {scanned ? 'QR code detected!' : 'Position the QR code within the frame to scan'}
            </p>
            {permissionState === 'granted' && (
              <div>
                <p className="text-green-400 text-xs mt-2">Camera access granted</p>
                <p className="text-gray-300 text-xs mt-1">
                  Using {facingMode === 'environment' ? 'back' : 'front'} camera
                </p>
              </div>
            )}

            {/* Add a button to force camera permission if needed */}
            {!isLoading && permissionState !== 'granted' && (
              <div className="space-y-3 mt-4">
                <button
                  onClick={() => {
                    console.log('Force camera permission button clicked');
                    forceResetAndRequestPermission();
                  }}
                  className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-full text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Camera size={16} />
                  Try All Camera Methods
                </button>

              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
