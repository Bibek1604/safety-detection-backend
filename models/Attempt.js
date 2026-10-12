const mongoose = require("mongoose");

// One entry per Why-chain step answered (order 1-5)
const whyChainAnswerSchema = new mongoose.Schema(
  { order: Number, optionId: String, correct: Boolean },
  { _id: false }
);

const attemptSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  incidentId:{ type: mongoose.Schema.Types.ObjectId, ref: "Incident" },
  cluesFound:   [String],
  decoyClicks: [{ hotspotId: String, clickCount: Number }],
  // Replaces: whyAnswerCorrect, wrongWhyAnswers, rootCauseCorrect, wrongRootCauseAnswers
  whyChainAnswers: [whyChainAnswerSchema],
  score:     { type: Number, default: 0 },
  passed:    { type: Boolean, default: false },
  timeTakenSeconds: Number,
  timedOut:  Boolean,
  startedAt: { type: Date, default: Date.now },
  createdAt: Date,
  status:    { type: String, enum: ["in-progress", "completed"], default: "in-progress" }
}, { optimisticConcurrency: true });

module.exports = mongoose.model("Attempt", attemptSchema);
