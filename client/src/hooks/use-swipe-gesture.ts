import { useRef, useCallback } from "react";

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

interface UseSwipeGestureOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
  maxVertical?: number;
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  maxVertical = 30,
}: UseSwipeGestureOptions): SwipeHandlers {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchMove = useCallback((_e: React.TouchEvent) => {
    // Intentionally minimal — we only evaluate on touchEnd
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = Math.abs(touch.clientY - touchStart.current.y);
      touchStart.current = null;

      if (Math.abs(dx) >= threshold && dy < maxVertical) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      }
    },
    [onSwipeLeft, onSwipeRight, threshold, maxVertical]
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}
