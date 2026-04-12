import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from '@/test/test-utils';
import { SupportChat } from './support-chat';

// Mock useAuth — controls whether a user is logged in
const mockUseAuth = vi.fn();
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock fetch globally for suggestions / chat endpoints
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/support/suggestions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ suggestions: ['How do I set up?'] }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/support/chat')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ answer: 'Here is your answer.', tokensUsed: 10 }),
      });
    }
    // Default: return 401 for /api/user or any other call
    return Promise.resolve({ ok: false, status: 401 });
  }));
});

describe('SupportChat', () => {
  it('does not render when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, error: null });
    const { container } = renderWithProviders(<SupportChat />);
    expect(container.innerHTML).toBe('');
  });

  it('renders floating chat button when user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isLoading: false,
      error: null,
    });
    renderWithProviders(<SupportChat />);
    // The floating button should be in the document
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('opens chat panel when button is clicked', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isLoading: false,
      error: null,
    });
    renderWithProviders(<SupportChat />);

    // Click the floating button (it's the only button initially)
    const floatingButton = screen.getAllByRole('button')[0];
    fireEvent.click(floatingButton);

    // The chat panel header should now be visible
    await waitFor(() => {
      expect(screen.getByText('SmallBizAgent Support')).toBeInTheDocument();
    });
  });

  it('shows welcome message when chat opens', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isLoading: false,
      error: null,
    });
    renderWithProviders(<SupportChat />);

    const floatingButton = screen.getAllByRole('button')[0];
    fireEvent.click(floatingButton);

    await waitFor(() => {
      expect(
        screen.getByText(/I'm your SmallBizAgent assistant/i)
      ).toBeInTheDocument();
    });
  });

  it('input field is present and accepts text', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isLoading: false,
      error: null,
    });
    renderWithProviders(<SupportChat />);

    // Open the chat
    const floatingButton = screen.getAllByRole('button')[0];
    fireEvent.click(floatingButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask a question...')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Ask a question...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hello there' } });
    expect(input.value).toBe('Hello there');
  });

  it('close button closes the chat panel', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isLoading: false,
      error: null,
    });
    renderWithProviders(<SupportChat />);

    // Open the chat
    const floatingButton = screen.getAllByRole('button')[0];
    fireEvent.click(floatingButton);

    await waitFor(() => {
      expect(screen.getByText('SmallBizAgent Support')).toBeInTheDocument();
    });

    // The chat panel header has a close button (X icon).
    // The header is the parent container with bg-black class.
    // We find it by traversing up from "SmallBizAgent Support" text to the header div,
    // then finding the button inside that header.
    const headerText = screen.getByText('SmallBizAgent Support');
    // Walk up to the header container (bg-black div that contains both the title and close button)
    let headerDiv = headerText.parentElement;
    while (headerDiv && !headerDiv.className.includes('bg-black')) {
      headerDiv = headerDiv.parentElement;
    }
    const closeButton = headerDiv!.querySelector('button')!;
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('SmallBizAgent Support')).not.toBeInTheDocument();
    });
  });
});
