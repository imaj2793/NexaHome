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

/** Saklar daya; namanya sudah termasuk nama perangkat. */
function powerSwitch(): HTMLElement {
  return screen.getByRole('switch', { name: /^(Nyalakan|Matikan)/ });
}

afterEach(cleanup);

describe('DeviceCard', () => {
  describe('identity', () => {
    it('renders name, room, type and externalId', () => {
      setup(makeDevice({ externalId: '192.168.1.10' }));
      expect(screen.getByRole('heading', { name: 'Lampu Teras' })).toBeInTheDocument();
      expect(
        screen.getByText('Teras · Lampu · 192.168.1.10'),
      ).toBeInTheDocument();
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

    it('maps known types to an icon and unknown types to a plug', () => {
      const known = render(
        <DeviceCard device={makeDevice({ type: 'light' })} busy={false} onToggle={noop} onBrightness={noop} onColor={noop} onDelete={noop} />,
      );
      expect(known.container.querySelector('.lucide-lightbulb')).not.toBeNull();
      known.unmount();

      const thermostat = render(
        <DeviceCard device={makeDevice({ type: 'thermostat' })} busy={false} onToggle={noop} onBrightness={noop} onColor={noop} onDelete={noop} />,
      );
      expect(thermostat.container.querySelector('.lucide-thermometer')).not.toBeNull();

      const unknown = render(
        <DeviceCard device={makeDevice({ type: 'menang' })} busy={false} onToggle={noop} onBrightness={noop} onColor={noop} onDelete={noop} />,
      );
      expect(unknown.container.querySelector('.lucide-plug')).not.toBeNull();
      expect(unknown.container.textContent).toContain('Perangkat');
    });
  });

  describe('power state', () => {
    it('shows "Mati" and a "Nyalakan" action when off', () => {
      setup(makeDevice({ state: { power: false } }));
      expect(screen.getByText('Mati')).toBeInTheDocument();
      expect(powerSwitch()).toHaveAccessibleName(/Nyalakan Lampu Teras/);
      expect(powerSwitch()).toBeEnabled();
    });

    it('shows "Menyala" and a "Matikan" action when on', () => {
      setup(makeDevice({ state: { power: true } }));
      expect(screen.getByText('Menyala')).toBeInTheDocument();
      expect(powerSwitch()).toHaveAccessibleName(/Matikan Lampu Teras/);
      expect(powerSwitch()).toBeEnabled();
    });

    it('treats a missing power flag as off', () => {
      setup(makeDevice({ state: {} }));
      expect(screen.getByText('Mati')).toBeInTheDocument();
    });

    it('marks the card with its status', () => {
      const { container } = render(
        <DeviceCard device={makeDevice({ state: { power: true } })} busy={false} onToggle={noop} onBrightness={noop} onColor={noop} onDelete={noop} />,
      );
      expect(container.querySelector('article')).toHaveAttribute('data-status', 'on');
    });

    it('flags an offline device instead of claiming a power state', () => {
      setup(makeDevice({ state: { online: false, power: true } }));
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  describe('toggle callback', () => {
    it('fires onToggle once from the power switch', async () => {
      const { user, onToggle } = setup(makeDevice());
      await user.click(powerSwitch());
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('fires onToggle when turning off too', async () => {
      const { user, onToggle } = setup(makeDevice({ state: { power: true } }));
      await user.click(powerSwitch());
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('busy / disabled', () => {
    it('disables the toggle while busy', () => {
      setup(makeDevice(), true);
      expect(powerSwitch()).toBeDisabled();
    });

    it('does not fire onToggle when clicked while busy', async () => {
      const { user, onToggle } = setup(makeDevice(), true);
      await user.click(powerSwitch());
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('keeps the delete button enabled while busy', () => {
      setup(makeDevice(), true);
      expect(
        screen.getByRole('button', { name: /Hapus Lampu Teras/ }),
      ).toBeEnabled();
    });
  });

  describe('delete', () => {
    it('fires onDelete from the delete button', async () => {
      const { user, onDelete } = setup(makeDevice());
      await user.click(screen.getByRole('button', { name: /Hapus Lampu Teras/ }));
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
      expect(screen.queryByRole('slider', { name: /Kecerahan/ })).toBeNull();
      expect(screen.queryByLabelText(/Warna/)).toBeNull();
    });

    it('hides controls for a plain on/off device', () => {
      setup(makeDevice({ state: { power: true }, capabilities: ['power'] }));
      expect(screen.queryByRole('slider', { name: /Kecerahan/ })).toBeNull();
      expect(screen.queryByLabelText(/Warna/)).toBeNull();
    });
  });

  describe('brightness', () => {
    it('renders the current brightness as a percentage', () => {
      setup(
        makeDevice({ state: { power: true, brightness: 42 }, capabilities: ['brightness'] }),
      );
      expect(screen.getByText('42%')).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: /Kecerahan/ })).toHaveValue('42');
    });

    it('defaults to 100% when brightness is absent', () => {
      setup(makeDevice({ state: { power: true }, capabilities: ['brightness'] }));
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('reports the numeric value on change', () => {
      const { onBrightness } = setup(
        makeDevice({ state: { power: true, brightness: 50 }, capabilities: ['brightness'] }),
      );
      const slider = screen.getByRole('slider', { name: /Kecerahan/ });
      fireEvent.change(slider, { target: { value: '70' } });
      expect(onBrightness).toHaveBeenCalledWith(70);
    });
  });

  describe('color', () => {
    it('defaults to white when no color in state', () => {
      setup(makeDevice({ state: { power: true }, capabilities: ['color'] }));
      expect(screen.getByLabelText(/Warna/)).toHaveValue('#ffffff');
    });

    it('renders the stored rgb as a hex value', () => {
      setup(
        makeDevice({
          state: { power: true, color: { r: 18, g: 52, b: 86 } },
          capabilities: ['color'],
        }),
      );
      expect(screen.getByLabelText(/Warna/)).toHaveValue('#123456');
    });

    it('clamps out-of-range channels', () => {
      setup(
        makeDevice({
          state: { power: true, color: { r: 300, g: -20, b: 0 } },
          capabilities: ['color'],
        }),
      );
      expect(screen.getByLabelText(/Warna/)).toHaveValue('#ff0000');
    });

    it('reports the picked colour as an rgb payload', () => {
      const { onColor } = setup(
        makeDevice({ state: { power: true }, capabilities: ['color'] }),
      );
      fireEvent.change(screen.getByLabelText(/Warna/), { target: { value: '#0a141e' } });
      expect(onColor).toHaveBeenCalledWith({ r: 10, g: 20, b: 30 });
    });
  });
});