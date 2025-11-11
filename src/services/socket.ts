  import { io, Socket } from 'socket.io-client';

  class SocketService {
    private socket: Socket | null = null;

    connect(userId: string) {
      this.socket = io('http://localhost:3000', {
        query: { userId }
      });

      this.socket.on('connect', () => {
        console.log('Socket connected');
      });

      this.socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });

      return this.socket;
    }

    disconnect() {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
    }

    emit(event: string, data: unknown) {
      if (this.socket) {
        this.socket.emit(event, data);
      }
    }

    on(event: string, callback: (...args: unknown[]) => void) {
      if (this.socket) {
        this.socket.on(event, callback);
      }
    }

    off(event: string) {
      if (this.socket) {
        this.socket.off(event);
      }
    }

    getSocket() {
      return this.socket;
    }
  }

  export const socketService = new SocketService();
  