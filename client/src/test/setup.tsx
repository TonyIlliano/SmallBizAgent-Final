import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/dashboard', vi.fn()],
  useRoute: () => [false, {}],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
  Route: ({ children }: any) => children,
  Router: ({ children }: any) => children,
  Redirect: () => null,
}));
