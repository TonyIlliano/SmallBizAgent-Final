import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OfflineBanner } from './offline-banner';

// Mock @capacitor/network to always reject (simulating web environment)
vi.mock('@capacitor/network', () => {
  throw new Error('Capacitor not available');
});

describe('OfflineBanner', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    // Restore original value
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      writable: true,
      configurable: true,
    });
  });

  it('does not render when online (default state)', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    const { container } = render(<OfflineBanner />);

    // Give the useEffect time to settle (Capacitor import rejects, falls back to navigator.onLine)
    await waitFor(() => {
      expect(container.querySelector('.fixed')).toBeNull();
    });
  });

  it('renders when offline event fires', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    render(<OfflineBanner />);

    // Wait for useEffect to settle first
    await waitFor(() => {
      expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    });

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event('offline'));

    await waitFor(() => {
      expect(screen.getByText(/You're offline/i)).toBeInTheDocument();
    });
  });

  it('shows correct message text', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });

    render(<OfflineBanner />);

    await waitFor(() => {
      expect(
        screen.getByText("You're offline. Some features may not work.")
      ).toBeInTheDocument();
    });
  });
});
