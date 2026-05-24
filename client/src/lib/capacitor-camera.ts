import { Capacitor } from '@capacitor/core';

export interface CapturedPhoto {
  /** Raw Blob ready for FormData upload. */
  blob: Blob;
  /** Suggested filename, including extension. */
  filename: string;
  /** MIME type (e.g. image/jpeg). */
  mimeType: string;
}

/**
 * Capture a photo using the device camera or photo library.
 *
 * On native (Capacitor iOS/Android): opens the platform Camera UI via the
 * @capacitor/camera plugin. The user picks Camera vs Photo Library.
 *
 * On web: falls back to a hidden <input type="file" capture="environment">
 * so the browser presents whatever the platform offers (mobile Chrome/Safari
 * will offer the camera, desktop will offer file picker).
 *
 * Returns `null` if the user cancels.
 */
export async function takeJobPhoto(): Promise<CapturedPhoto | null> {
  if (Capacitor.isNativePlatform()) {
    return takeNativePhoto();
  }
  return takeWebPhoto();
}

async function takeNativePhoto(): Promise<CapturedPhoto | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,
      saveToGallery: false,
      correctOrientation: true,
      // Cap to ~1600 on the long edge — keeps S3 uploads under a few hundred KB
      // while staying legible for documentation.
      width: 1600,
    });

    if (!photo.base64String) return null;

    const mimeType = `image/${photo.format || 'jpeg'}`;
    const blob = base64ToBlob(photo.base64String, mimeType);
    const filename = `job-photo-${Date.now()}.${photo.format || 'jpg'}`;
    return { blob, filename, mimeType };
  } catch (err: any) {
    // Capacitor throws when the user cancels — silently swallow.
    if (err?.message?.toLowerCase?.().includes('cancel')) return null;
    console.error('[Camera] Native capture failed:', err);
    throw err;
  }
}

function takeWebPhoto(): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) return resolve(null);
      resolve({
        blob: file,
        filename: file.name || `job-photo-${Date.now()}.jpg`,
        mimeType: file.type || 'image/jpeg',
      });
    };
    // If user cancels, oncancel fires on modern browsers; oninput won't.
    // Cleanup via abort listener as a fallback.
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}
