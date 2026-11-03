const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Room = require("../models/Room");
const Message = require("../models/Message");

module.exports = function initSocket(io) {
  // 1) Authenticate every socket using the JWT sent in the handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Not authorized"));
      const { id } = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(id);
      if (!user) return next(new Error("User not found"));
      socket.data.user = { id: user._id.toString(), name: user.name };
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  // Send the list of people currently viewing a room (unique by user)
  async function broadcastPresence(roomId) {
    const sockets = await io.in(roomId).fetchSockets();
    const unique = new Map();
    sockets.forEach((s) => unique.set(s.data.user.id, s.data.user));
    io.to(roomId).emit("room:users", { roomId, users: [...unique.values()] });
  }

  io.on("connection", (socket) => {
    const { id: userId, name } = socket.data.user;
    const sentAt = []; // timestamps for simple rate limiting
    let leftRooms = [];

    // Join a chat room (a socket is in one room at a time)
    socket.on("room:join", async (roomId, ack) => {
      try {
        if (
          !mongoose.isValidObjectId(roomId) ||
          !(await Room.exists({ _id: roomId }))
        ) {
          return ack?.({ ok: false, error: "Room not found" });
        }

        for (const r of socket.rooms) {
          if (r !== socket.id && r !== roomId) {
            socket.leave(r);
            broadcastPresence(r);
          }
        }
        await socket.join(roomId);
        await broadcastPresence(roomId);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: "Could not join room" });
      }
    });

    socket.on("room:leave", async (roomId) => {
      socket.leave(roomId);
      await broadcastPresence(roomId);
    });

    // Send a message: validate -> save to DB -> broadcast to the room
    socket.on("message:send", async (payload, ack) => {
      try {
        const { roomId, text } = payload || {};
        if (!socket.rooms.has(roomId)) {
          return ack?.({ ok: false, error: "Join the room first" });
        }

        const clean = typeof text === "string" ? text.trim() : "";
        if (!clean || clean.length > 1000) {
          return ack?.({ ok: false, error: "Message must be 1-1000 characters" });
        }

        // Max 5 messages per 3 seconds per connection
        const now = Date.now();
        while (sentAt.length && now - sentAt[0] > 3000) sentAt.shift();
        if (sentAt.length >= 5) {
          return ack?.({ ok: false, error: "You're sending messages too fast" });
        }
        sentAt.push(now);

        const msg = await Message.create({ room: roomId, sender: userId, text: clean });

        io.to(roomId).emit("message:new", {
          _id: msg._id,
          room: roomId,
          text: msg.text,
          createdAt: msg.createdAt,
          sender: { _id: userId, name },
        });
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: "Could not send message" });
      }
    });

    // Typing indicator (not stored, just relayed to others in the room)
    socket.on("typing", (payload) => {
      const { roomId, isTyping } = payload || {};
      if (!socket.rooms.has(roomId)) return;
      socket.to(roomId).emit("typing", { roomId, userId, name, isTyping: !!isTyping });
    });

    // On disconnect the socket has already left its rooms, so remember them
    // first and update presence afterwards.
    socket.on("disconnecting", () => {
      leftRooms = [...socket.rooms].filter((r) => r !== socket.id);
      leftRooms.forEach((r) =>
        socket.to(r).emit("typing", { roomId: r, userId, name, isTyping: false })
      );
    });

    socket.on("disconnect", () => {
      leftRooms.forEach((r) => broadcastPresence(r));
    });
  });
};
