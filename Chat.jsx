import { useCallback, useEffect, useRef, useState } from "react";
import api, { errMsg } from "../api";
import { createSocket } from "../socket";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import MessageList from "../components/MessageList";
import MessageInput from "../components/MessageInput";

// Merge two message lists, drop duplicates, keep chronological order
const mergeMessages = (a, b) => {
  const map = new Map();
  [...a, ...b].forEach((m) => map.set(m._id, m));
  return [...map.values()].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));
};

export default function Chat() {
  const { user, logout } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [online, setOnline] = useState([]);
  const [typing, setTyping] = useState({}); // { userId: name }
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const socketRef = useRef(null);
  const activeRef = useRef(null); // latest active room, readable inside socket callbacks
  const typingTimers = useRef({});

  const joinRoom = useCallback((roomId) => {
    socketRef.current?.emit("room:join", roomId, (res) => {
      if (!res?.ok) setError(res?.error || "Could not join room");
    });
  }, []);

  // 1) On mount: load rooms and open the socket connection
  useEffect(() => {
    api
      .get("/rooms")
      .then((res) => {
        setRooms(res.data);
        if (res.data.length) setActiveId(res.data[0]._id);
      })
      .catch(() => setError("Could not load rooms. Is the server running?"));

    const socket = createSocket(user.token);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError("");
      // Rooms are lost on reconnect, so rejoin the one we were in
      if (activeRef.current) joinRoom(activeRef.current);
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setOnline([]);
    });
    socket.on("connect_error", (err) => {
      setConnected(false);
      if (["Not authorized", "Invalid token", "User not found"].includes(err.message)) {
        logout(); // token expired or user deleted
      } else {
        setError("Can't reach the chat server. Retrying…");
      }
    });

    socket.on("message:new", (msg) => {
      if (msg.room !== activeRef.current) return;
      setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
    });

    socket.on("room:users", ({ roomId, users }) => {
      if (roomId === activeRef.current) setOnline(users);
    });

    socket.on("typing", ({ roomId, userId, name, isTyping }) => {
      if (roomId !== activeRef.current || userId === user._id) return;
      clearTimeout(typingTimers.current[userId]);
      setTyping((prev) => {
        const next = { ...prev };
        if (isTyping) next[userId] = name;
        else delete next[userId];
        return next;
      });
      if (isTyping) {
        // Safety net: clear the indicator if the "stopped typing" event is lost
        typingTimers.current[userId] = setTimeout(() => {
          setTyping((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        }, 3000);
      }
    });

    socket.on("room:created", (room) => {
      setRooms((prev) =>
        prev.some((r) => r._id === room._id)
          ? prev
          : [...prev, room].sort((a, b) => a.name.localeCompare(b.name))
      );
    });

    const timers = typingTimers.current;
    return () => {
      socket.disconnect();
      Object.values(timers).forEach(clearTimeout);
    };
  }, [user._id, user.token, joinRoom, logout]);

  // 2) Whenever the active room changes: join it and load its history
  useEffect(() => {
    if (!activeId) return;
    activeRef.current = activeId;
    setMessages([]);
    setOnline([]);
    setTyping({});
    setHasMore(false);

    if (socketRef.current?.connected) joinRoom(activeId);

    let cancelled = false;
    api
      .get(`/rooms/${activeId}/messages`)
      .then((res) => {
        if (cancelled) return;
        // Live messages may have arrived while we were fetching, so merge
        setMessages((prev) => mergeMessages(res.data.messages, prev));
        setHasMore(res.data.hasMore);
      })
      .catch(() => !cancelled && setError("Could not load messages"));

    return () => {
      cancelled = true;
    };
  }, [activeId, joinRoom]);

  const loadOlder = async () => {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/rooms/${activeId}/messages`, {
        params: { before: messages[0]._id },
      });
      setMessages((prev) => mergeMessages(data.messages, prev));
      setHasMore(data.hasMore);
    } catch {
      setError("Could not load older messages");
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendMessage = (text) =>
    new Promise((resolve) => {
      socketRef.current
        .timeout(5000)
        .emit("message:send", { roomId: activeRef.current, text }, (err, res) => {
          if (err) setError("Message timed out. Check your connection.");
          else if (!res?.ok) setError(res?.error || "Could not send message");
          resolve(!err && !!res?.ok);
        });
    });

  const sendTyping = (isTyping) =>
    socketRef.current?.emit("typing", { roomId: activeRef.current, isTyping });

  const createRoom = async (name) => {
    try {
      const { data } = await api.post("/rooms", { name });
      setRooms((prev) =>
        prev.some((r) => r._id === data._id)
          ? prev
          : [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setActiveId(data._id);
      setSidebarOpen(false);
      return null;
    } catch (err) {
      return errMsg(err, "Could not create room");
    }
  };

  const activeRoom = rooms.find((r) => r._id === activeId);
  const typingNames = Object.values(typing);
  const typingText =
    typingNames.length === 0
      ? ""
      : typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : typingNames.length === 2
      ? `${typingNames[0]} and ${typingNames[1]} are typing…`
      : "Several people are typing…";

  return (
    <div className="chat-layout">
      <Sidebar
        rooms={rooms}
        activeId={activeId}
        user={user}
        connected={connected}
        open={sidebarOpen}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
        }}
        onCreate={createRoom}
        onLogout={logout}
      />

      <section className="chat-main">
        <header className="chat-header">
          <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open rooms">
            ☰
          </button>
          <div>
            <h2># {activeRoom?.name || "…"}</h2>
            <p className="muted" title={online.map((u) => u.name).join(", ")}>
              <span className={`dot ${connected ? "on" : "off"}`} />
              {connected ? `${online.length} online` : "Reconnecting…"}
            </p>
          </div>
        </header>

        {error && (
          <div className="error" onClick={() => setError("")}>
            {error}
          </div>
        )}

        <MessageList
          messages={messages}
          meId={user._id}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
        />

        <div className="typing">{typingText}</div>

        <MessageInput
          key={activeId}
          disabled={!connected || !activeId}
          onSend={sendMessage}
          onTyping={sendTyping}
        />
      </section>
    </div>
  );
}
