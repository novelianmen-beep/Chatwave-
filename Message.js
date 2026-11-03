const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

// Fast "latest messages in a room" queries
messageSchema.index({ room: 1, _id: -1 });

module.exports = mongoose.model("Message", messageSchema);
