import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('WebSocket connected:', socket?.id);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
