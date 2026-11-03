const express = require("express");
const mongoose = require("mongoose");
const Room = require("../models/Room");
const Message = require("../models/Message");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/rooms
router.get("/", async (req, res) => {
  const rooms = await Room.find().sort({ name: 1 });
  res.json(rooms);
});

// POST /api/rooms
router.post("/", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (name.length < 2 || name.length > 30) {
      return res.status(400).json({ message: "Room name must be 2-30 characters" });
    }
    const exists = await Room.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });
    if (exists) return res.status(409).json({ message: "A room with that name already exists" });

    const room = await Room.create({ name, createdBy: req.user._id });
    // Tell every connected client so their sidebar updates instantly
    req.app.get("io").emit("room:created", room);
    res.status(201).json(room);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /api/rooms/:id/messages?before=<messageId>&limit=30
// Cursor pagination: returns older messages than `before`, oldest first.
router.get("/:id/messages", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ message: "Room not found" });
  }

  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const filter = { room: id };
  if (req.query.before && mongoose.isValidObjectId(req.query.before)) {
    filter._id = { $lt: req.query.before };
  }

  // Fetch one extra to know if there are even older messages
  const found = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("sender", "name");

  const hasMore = found.length > limit;
  const messages = found.slice(0, limit).reverse();
  res.json({ messages, hasMore });
});

module.exports = router;
