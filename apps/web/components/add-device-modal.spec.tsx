import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddDeviceModal from './add-device-modal';
import { api, type ApiIntegration, type ApiRoom, type DiscoveredDevice } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: vi.fn() };
});

const apiMock = vi.mocked(api);

const integrations: ApiIntegration[] = [
  { id: 'int-1', name: 'Shelly', type: 'shelly', homeId: 'home-1', enabled: true, config: {}, credentialsEncrypted: true },
  { id: 'int-2', name: 'MQTT', type: 'mqtt', homeId: 'home-1', enabled: true, config: {}, credentialsEncrypted: true },
];

const rooms: ApiRoom[] = [
  { id: 'room-1', name: 'Teras', homeId: 'home-1' },
  { id: 'room-2', name: 'Kamar', homeId: 'home-1' },
];

const found: DiscoveredDevice[] = [
  { id: 'shelly-1', name: 'Lampu Depan', type: 'light', capabilities: ['brightness'], state: { power: false } },
  { id: 'shelly-2', name: 'Saklar Samping', type: 'switch', capabilities: [], state: { power: true } },
];

function setup(props: Partial<Parameters<typeof AddDeviceModal>[0]> = {}) {
  const onClose = vi.fn();
  const onAdded = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <AddDeviceModal
      homeId="home-1"
      integrations={integrations}
      rooms={rooms}
      onClose={onClose}
      onAdded={onAdded}
      {...props}
    />,
  );
  return { user, onClose, onAdded, ...view };
}

/** Parse body of the nth (default 0) api call. */
function bodyOf(index = 0): Record<string, unknown> {
  const call = apiMock.mock.calls[index][1] as RequestInit;
  return JSON.parse(String(call.body)) as Record<string, unknown>;
}

beforeEach(() => {
  apiMock.mockReset();
});

afterEach(cleanup);

describe('AddDeviceModal', () => {
  describe('rendering', () => {
    it('shows the title, integrations and rooms', () => {
      setup();
      expect(screen.getByRole('heading', { name: 'Tambah Perangkat' })).toBeInTheDocument();
      const integrationSelect = screen.getByLabelText('Integrasi') as HTMLSelectElement;
      expect(integrationSelect).toHaveValue('int-1');
      expect(screen.getByRole('option', { name: 'Shelly (shelly)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'MQTT (mqtt)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Tanpa ruangan' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Teras' })).toBeInTheDocument();
    });

    it('starts in auto-scan mode with a scan button and no manual form', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Scan jaringan' })).toBeEnabled();
      expect(screen.queryByPlaceholderText('Lampu Teras')).toBeNull();
      expect(screen.queryByText('Ditemukan 0 perangkat:')).toBeNull();
    });

    it('disables the scan button when there is no integration', () => {
      setup({ integrations: [] });
      expect(screen.getByRole('button', { name: 'Scan jaringan' })).toBeDisabled();
    });
  });

  describe('closing', () => {
    it('closes via the ✕ button', async () => {
      const { user, onClose } = setup();
      await user.click(screen.getByRole('button', { name: 'Tutup' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes when the backdrop is clicked', async () => {
      const { user, onClose, container } = setup();
      await user.click(container.firstElementChild as HTMLElement);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close when the modal body is clicked', async () => {
      const { user, onClose, container } = setup();
      const panel = container.firstElementChild?.firstElementChild as HTMLElement;
      await user.click(panel);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('scan', () => {
    it('posts to the discover endpoint of the selected integration', async () => {
      apiMock.mockResolvedValue(found);
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      expect(apiMock).toHaveBeenCalledWith('/integrations/int-1/discover', { method: 'POST' });
    });

    it('uses the integration chosen in the select', async () => {
      apiMock.mockResolvedValue([]);
      const { user } = setup();
      await user.selectOptions(screen.getByLabelText('Integrasi'), 'int-2');
      await user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      expect(apiMock).toHaveBeenCalledWith('/integrations/int-2/discover', { method: 'POST' });
    });

    it('shows "Memindai…" while the request is in flight and re-enables after', async () => {
      let resolve!: (v: DiscoveredDevice[]) => void;
      apiMock.mockImplementation(() => new Promise<DiscoveredDevice[]>((r) => (resolve = r)));
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      const busy = screen.getByRole('button', { name: 'Memindai…' });
      expect(busy).toBeDisabled();
      resolve([]);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Scan jaringan' })).toBeEnabled());
    });

    it('renders the discovered devices with a connect action each', async () => {
      apiMock.mockResolvedValue(found);
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      expect(screen.getByText('Ditemukan 2 perangkat:')).toBeInTheDocument();
      expect(screen.getByText('Lampu Depan')).toBeInTheDocument();
      expect(screen.getByText('shelly-1 ·')).toBeInTheDocument();
      expect(screen.getByText('Saklar Samping')).toBeInTheDocument();
      expect(screen.getByText('shelly-2 ·')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Hubungkan' })).toHaveLength(2);
    });

    it('shows a message when nothing is discovered', async () => {
      apiMock.mockResolvedValue([]);
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      expect(await screen.findByText('Tidak ada perangkat ditemukan di jaringan.')).toBeInTheDocument();
    });

    it('surfaces the API error message', async () => {
      apiMock.mockRejectedValue(new Error('Integrasi mati'));
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      expect(await screen.findByText('Integrasi mati')).toBeInTheDocument();
    });

    it('clears previous results before a new scan', async () => {
      apiMock.mockResolvedValueOnce(found).mockResolvedValueOnce([]);
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      expect(await screen.findByText('Lampu Depan')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      await waitFor(() => expect(screen.queryByText('Lampu Depan')).toBeNull());
    });
  });

  describe('connect', () => {
    async function scanThenSetup() {
      apiMock.mockResolvedValue(found);
      const ctx = setup();
      await ctx.user.click(screen.getByRole('button', { name: 'Scan jaringan' }));
      await screen.findByText('Lampu Depan');
      apiMock.mockReset();
      return ctx;
    }

    it('posts the discovered device with homeId, room and integration context', async () => {
      const { user, onAdded } = await scanThenSetup();
      await user.selectOptions(screen.getByLabelText('Ruangan'), 'room-2');
      await user.click(screen.getAllByRole('button', { name: 'Hubungkan' })[0]);

      expect(apiMock).toHaveBeenCalledWith('/devices', expect.objectContaining({ method: 'POST' }));
      expect(bodyOf()).toEqual({
        name: 'Lampu Depan',
        type: 'light',
        homeId: 'home-1',
        roomId: 'room-2',
        integrationId: 'int-1',
        externalId: 'shelly-1',
        capabilities: ['brightness'],
        state: { power: false },
      });
      expect(onAdded).toHaveBeenCalledTimes(1);
    });

    it('sends null roomId when no room is chosen', async () => {
      const { user } = await scanThenSetup();
      await user.click(screen.getAllByRole('button', { name: 'Hubungkan' })[1]);
      expect(bodyOf()).toMatchObject({
        name: 'Saklar Samping',
        type: 'switch',
        roomId: null,
        integrationId: 'int-1',
        externalId: 'shelly-2',
        capabilities: [],
        state: { power: true },
      });
    });

    it('disables the connect button while that device is connecting', async () => {
      const { user, onAdded } = await scanThenSetup();
      apiMock.mockImplementationOnce(() => new Promise(() => {}));
      await user.click(screen.getAllByRole('button', { name: 'Hubungkan' })[0]);
      await waitFor(() => expect(screen.getByText('…')).toBeInTheDocument());
      expect(onAdded).not.toHaveBeenCalled();
    });

    it('shows the error and does not call onAdded when the POST fails', async () => {
      const { user, onAdded } = await scanThenSetup();
      apiMock.mockRejectedValueOnce(new Error('Gagal simpan'));
      await user.click(screen.getAllByRole('button', { name: 'Hubungkan' })[0]);
      expect(await screen.findByText('Gagal simpan')).toBeInTheDocument();
      expect(onAdded).not.toHaveBeenCalled();
    });
  });

  describe('manual mode', () => {
    async function manualSetup() {
      const ctx = setup();
      await ctx.user.click(screen.getByRole('button', { name: 'Manual' }));
      return ctx;
    }

    it('swaps the auto-scan panel for the manual form', async () => {
      await manualSetup();
      expect(screen.getByPlaceholderText('Lampu Teras')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('192.168.1.10')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tambahkan' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Scan jaringan' })).toBeNull();
    });

    it('switches back to scan mode', async () => {
      const { user } = await manualSetup();
      await user.click(screen.getByRole('button', { name: 'Otomatis (scan)' }));
      expect(screen.getByRole('button', { name: 'Scan jaringan' })).toBeInTheDocument();
    });

    it('requires a name', async () => {
      const { user, onAdded } = await manualSetup();
      await user.click(screen.getByRole('button', { name: 'Tambahkan' }));
      expect(screen.getByText('Nama perangkat wajib diisi.')).toBeInTheDocument();
      expect(apiMock).not.toHaveBeenCalled();
      expect(onAdded).not.toHaveBeenCalled();
    });

    it('posts the manual device payload', async () => {
      apiMock.mockResolvedValue({ id: 'dev-9' });
      const { user, onAdded } = await manualSetup();
      await user.type(screen.getByPlaceholderText('Lampu Teras'), '  Lampu Tidur  ');
      await user.selectOptions(screen.getByLabelText('Tipe'), 'thermostat');
      await user.type(screen.getByPlaceholderText('192.168.1.10'), '10.0.0.5');
      await user.selectOptions(screen.getByLabelText('Ruangan'), 'room-1');
      await user.click(screen.getByRole('button', { name: 'Tambahkan' }));

      expect(apiMock).toHaveBeenCalledWith('/devices', expect.objectContaining({ method: 'POST' }));
      expect(bodyOf()).toEqual({
        name: 'Lampu Tidur',
        type: 'thermostat',
        homeId: 'home-1',
        roomId: 'room-1',
        integrationId: 'int-1',
        externalId: '10.0.0.5',
        capabilities: [],
        state: {},
      });
      expect(onAdded).toHaveBeenCalledTimes(1);
    });

    it('sends nulls for empty room, integration and externalId', async () => {
      apiMock.mockResolvedValue({ id: 'dev-10' });
      const { user } = setup({ integrations: [] });
      await user.click(screen.getByRole('button', { name: 'Manual' }));
      await user.type(screen.getByPlaceholderText('Lampu Teras'), 'Kipas');
      await user.click(screen.getByRole('button', { name: 'Tambahkan' }));
      expect(bodyOf()).toMatchObject({ roomId: null, integrationId: null, externalId: null });
    });

    it('surfaces the error when the manual POST fails', async () => {
      apiMock.mockRejectedValue(new Error('Nama sudah dipakai'));
      const { user, onAdded } = await manualSetup();
      await user.type(screen.getByPlaceholderText('Lampu Teras'), 'Kipas');
      await user.click(screen.getByRole('button', { name: 'Tambahkan' }));
      expect(await screen.findByText('Nama sudah dipakai')).toBeInTheDocument();
      expect(onAdded).not.toHaveBeenCalled();
    });
  });
});
