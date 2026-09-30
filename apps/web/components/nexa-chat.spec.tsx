import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NexaChat from './nexa-chat';
import type { NexaCapabilities } from '@/lib/nexa';

const mockFetchStatus = vi.fn<() => Promise<NexaCapabilities | null>>();
const mockTranscribeAudio = vi.fn<() => Promise<string>>();

vi.mock('@/lib/nexa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nexa')>();
  return {
    ...actual,
    fetchNexaStatus: () => mockFetchStatus(),
    transcribeAudio: (_base64: string) => mockTranscribeAudio(),
    speakNexa: vi.fn().mockResolvedValue(undefined),
    sendNexaMessage: vi
      .fn()
      .mockResolvedValue({ message: 'Lampu menyala.', state: 'SUCCESS' }),
  };
});

vi.mock('@/lib/socket', () => ({
  connectSocket: () => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

const FULL: NexaCapabilities = {
  aiProvider: 'deepseek',
  llm: 'live',
  tts: 'live',
  stt: { configured: true, engine: 'whisper.cpp' },
  degraded: false,
};

const LIMITED: NexaCapabilities = {
  aiProvider: 'mock',
  llm: 'mock',
  tts: 'mock',
  stt: { configured: false, engine: 'whisper.cpp' },
  degraded: true,
};

/** jsdom tidak punya MediaRecorder; cukup fake yang bisa di-trigger manual. */
function stubRecorder() {
  const state: { instance: { start: () => void; stop: () => void } | null } = {
    instance: null,
  };
  class FakeMediaRecorder {
    onstop: (() => void) | null = null;
    ondataavailable: ((e: { data: { size: number } }) => void) | null = null;
    stream = { getTracks: () => [{ stop: vi.fn() }] };
    start() {
      state.instance = this as never;
    }
    stop() {
      this.ondataavailable?.({ data: { size: 10 } });
      this.onstop?.();
    }
  }
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal(
    'navigator',
    Object.assign(navigator, {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({}) },
    }),
  );
  vi.stubGlobal('FileReader', class {
    result = 'data:audio/webm;base64,QUJD';
    onloadend: (() => void) | null = null;
    onerror: unknown = null;
    readAsDataURL() {
      this.onloadend?.();
    }
  });
  return state;
}

describe('NexaChat — mode terbatas', () => {
  beforeEach(() => {
    mockFetchStatus.mockReset();
    mockTranscribeAudio.mockReset();
    mockFetchStatus.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('memberi tahu mode demo dan voice nonaktif saat degraded', async () => {
    mockFetchStatus.mockResolvedValue(LIMITED);

    render(<NexaChat homeId="home_1" />);

    const note = await screen.findByText(/mode demo/i);
    expect(note).toHaveTextContent(/WHISPER_MODEL/);
  });

  it('menonaktifkan tombol mikrofon saat STT belum dikonfigurasi', async () => {
    mockFetchStatus.mockResolvedValue(LIMITED);

    render(<NexaChat homeId="home_1" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /mulai bicara/i }),
      ).toBeDisabled();
    });
  });

  it('menyediakan mikrofon saat STT siap', async () => {
    mockFetchStatus.mockResolvedValue(FULL);

    render(<NexaChat homeId="home_1" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /mulai bicara/i }),
      ).toBeEnabled();
    });
  });

  it('tetap bisa mengirim pesan teks saat voice gagal', async () => {
    mockFetchStatus.mockResolvedValue(FULL);
    stubRecorder();
    mockTranscribeAudio.mockRejectedValue(
      new Error('STT belum dikonfigurasi (WHISPER_MODEL kosong).'),
    );
    const user = userEvent.setup();
    render(<NexaChat homeId="home_1" />);

    // Rekam lalu hentikan → STT ditolak backend.
    await user.click(screen.getByRole('button', { name: /mulai bicara/i }));
    await user.click(screen.getByRole('button', { name: /berhenti merekam/i }));
    expect(
      await screen.findByText(/WHISPER_MODEL kosong/i),
    ).toBeInTheDocument();

    // Input teks tetap berfungsi.
    const input = screen.getByPlaceholderText(/tanya nexa/i);
    await user.type(input, 'nyalakan lampu');
    await user.click(screen.getByRole('button', { name: /kirim/i }));
    expect(await screen.findByText('Lampu menyala.')).toBeInTheDocument();
  });
});
