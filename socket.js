import { io } from "socket.io-client";

// The JWT is sent in the handshake; the server rejects sockets without a valid one.
export function createSocket(token) {
  return io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
    auth: { token },
  });
}
