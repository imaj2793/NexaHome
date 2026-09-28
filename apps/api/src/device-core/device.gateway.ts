import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * Gateway real-time (blueprint §22). Mengirim event `device:state` setiap kali
 * state perangkat berubah, sehingga dashboard ter-update tanpa reload.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class DeviceGateway {
  @WebSocketServer()
  server!: Server;

  emitDeviceState(
    homeId: string,
    deviceId: string,
    state: Record<string, unknown>,
  ): void {
    this.server?.emit('device:state', { homeId, deviceId, state });
  }
}
