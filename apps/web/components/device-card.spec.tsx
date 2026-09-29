import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeviceCard from './device-card';
import type { ApiDevice } from '@/lib/api';

const noop = () => {};

function makeDevice(overrides: Partial<ApiDevice> = {}): ApiDevice {
  return {
    id: 'dev-1',
    name: 'Lampu Teras',
    type: 'light',
    homeId: 'home-1',
    roomId: 'room-1',
    integrationId: null,
    externalId: null,
    capabilities: ['power'],
    state: { power: false },
    room: { id: 'room-1', name: 'Teras' },
    ...overrides,
  };
}

function setup(device: ApiDevice, busy = false) {
  const onToggle = vi.fn();
  const onBrightness = vi.fn();
  const onColor = vi.fn();
  const onDelete = vi.fn();
  const user = userEvent.setup();
  render(
    <DeviceCard
      device={device}
      busy={busy}
      onToggle={onToggle}
      onBrightness={onBrightness}
      onColor={onColor}
      onDelete={onDelete}
    />,
  );
  return { user, onToggle, onBrightness, onColor, onDelete };
}

afterEach(cleanup);

describe('DeviceCard', () => {
  describe('identity', () => {
    it('renders name, room, type and externalId', () => {
      setup(makeDevice({ externalId: '192.168.1.10' }));
      expect(screen.getByText('Lampu Teras')).toBeInTheDocument();
      const meta = document.querySelector('.mt-0\\.5') as HTMLElement;
      expect(meta.textContent).toContain('Teras');
      expect(meta.textContent).toContain('light');
      expect(meta.textContent).toContain('192.168.1.10');
    });

    it('falls back to "Tanpa ruangan" when there is no room', () => {
      setup(makeDevice({ room: null }));
      expect(screen.getByText(/Tanpa ruangan/)).toBeInTheDocument();
    });

    it('omits the externalId segment when null', () => {
      const { container } = render(
        <DeviceCard
          device={makeDevice({ externalId: null })}
          busy={false}
          onToggle={noop}
          onBrightness={noop}
          onColor={noop}
          onDelete={noop}
        />,
      );
      expect(container.textContent).not.toContain('null');
    });

    it('maps known types to icons and unknown types to a plug', () => {
      const { unmount } = render(
        <DeviceCard device={makeDevice({ type: 'light' })} busy={false} onToggle={noop} onBrightness={noop} onColor={noop} onDelete={noop} />,
      );
      expect(screen.getAllByText('💡')).toHaveLength(2); // badge + toggle button
      unmount();
      render(
        <DeviceCard device={makeDevice({ type: 'thermostat' })} busy={false} onToggle={noop} onBrightness={noop} onColor={noop} onDelete={noop} />,
      );
      expect(screen.getAllByText('🌡️')).toHaveLength(2);
    });
  });

  describe('power state', () => {
    it('shows "Mati" and a "Nyalakan" action when off', () => {
      setup(makeDevice({ state: { power: false } }));
      expect(screen.getByText('Mati')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nyalakan' })).toBeEnabled();
    });

    it('shows "Menyala" and a "Matikan" action when on', () => {
      setup(makeDevice({ state: { power: true } }));
      expect(screen.getByText('Menyala')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Matikan' })).toBeEnabled();
    });

    it('treats a missing power flag as off', () => {
      setup(makeDevice({ state: {} }));
      expect(screen.getByText('Mati')).toBeInTheDocument();
    });
  });

  describe('toggle callback', () => {
    it('fires onToggle once from the power button', async () => {
      const { user, onToggle } = setup(makeDevice());
      await user.click(screen.getByRole('button', { name: 'Nyalakan' }));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('fires onToggle when turning off too', async () => {
      const { user, onToggle } = setup(makeDevice({ state: { power: true } }));
      await user.click(screen.getByRole('button', { name: 'Matikan' }));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('busy / disabled', () => {
    it('disables the toggle while busy', () => {
      setup(makeDevice(), true);
      expect(screen.getByRole('button', { name: 'Nyalakan' })).toBeDisabled();
    });

    it('does not fire onToggle when clicked while busy', async () => {
      const { user, onToggle } = setup(makeDevice(), true);
      await user.click(screen.getByRole('button', { name: 'Nyalakan' }));
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('keeps the delete button enabled while busy', () => {
      setup(makeDevice(), true);
      expect(screen.getByRole('button', { name: 'Hapus perangkat' })).toBeEnabled();
    });
  });

  describe('delete', () => {
    it('fires onDelete from the ✕ button', async () => {
      const { user, onDelete } = setup(makeDevice());
      await user.click(screen.getByRole('button', { name: 'Hapus perangkat' }));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe('controls visibility', () => {
    it('hides brightness and colour when powered off', () => {
      setup(
        makeDevice({
          state: { power: false, brightness: 40 },
          capabilities: ['power', 'brightness', 'color'],
        }),
      );
      expect(screen.queryByRole('slider', { name: 'Kecerahan' })).toBeNull();
      expect(screen.queryByLabelText('Warna')).toBeNull();
    });

    it('hides controls for a plain on/off device', () => {
      setup(makeDevice({ state: { power: true }, capabilities: ['power'] }));
      expect(screen.queryByRole('slider', { name: 'Kecerahan' })).toBeNull();
      expect(screen.queryByLabelText('Warna')).toBeNull();
    });
  });

  describe('brightness', () => {
    it('renders the current brightness as a percentage', () => {
      setup(
        makeDevice({ state: { power: true, brightness: 42 }, capabilities: ['brightness'] }),
      );
      expect(screen.getByText('42%')).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: 'Kecerahan' })).toHaveValue('42');
    });

    it('defaults to 100% when brightness is absent', () => {
      setup(makeDevice({ state: { power: true }, capabilities: ['brightness'] }));
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('reports the numeric value on change', () => {
      const { onBrightness } = setup(
        makeDevice({ state: { power: true, brightness: 50 }, capabilities: ['brightness'] }),
      );
      const slider = screen.getByRole('slider', { name: 'Kecerahan' });
      fireEvent.change(slider, { target: { value: '70' } });
      expect(onBrightness).toHaveBeenCalledWith(70);
    });
  });

  describe('color', () => {
    it('defaults to white when no color in state', () => {
      setup(makeDevice({ state: { power: true }, capabilities: ['color'] }));
      expect(screen.getByLabelText('Warna')).toHaveValue('#ffffff');
    });

    it('renders the stored rgb as a hex value', () => {
      setup(
        makeDevice({
          state: { power: true, color: { r: 18, g: 52, b: 86 } },
          capabilities: ['color'],
        }),
      );
      expect(screen.getByLabelText('Warna')).toHaveValue('#123456');
    });

    it('clamps out-of-range channels', () => {
      setup(
        makeDevice({
          state: { power: true, color: { r: 300, g: -20, b: 0 } },
          capabilities: ['color'],
        }),
      );
      expect(screen.getByLabelText('Warna')).toHaveValue('#ff0000');
    });

    it('reports the picked colour as an rgb payload', () => {
      const { onColor } = setup(
        makeDevice({ state: { power: true }, capabilities: ['color'] }),
      );
      fireEvent.change(screen.getByLabelText('Warna'), { target: { value: '#0a141e' } });
      expect(onColor).toHaveBeenCalledWith({ r: 10, g: 20, b: 30 });
    });
  });
});
