require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const Room = require("./models/Room");
const initSocket = require("./socket");

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// Socket.io needs the raw HTTP server
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_URL } });
app.set("io", io); // so REST routes can broadcast events too
initSocket(io);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/rooms", require("./routes/rooms"));

// Make sure a fresh database has something to chat in
async function ensureDefaultRooms() {
  if ((await Room.countDocuments()) === 0) {
    await Room.insertMany([{ name: "General" }, { name: "Random" }, { name: "Tech Talk" }]);
    console.log("Created default rooms");
  }
}

const PORT = process.env.PORT || 5000;

connectDB()
  .then(ensureDefaultRooms)
  .then(() => server.listen(PORT, () => console.log(`Server running on port ${PORT}`)));
