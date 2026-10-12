const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema({ id: String, text: String }, { _id: false });

const whyChainEntrySchema = new mongoose.Schema(
  { order: Number, question: String, options: [optionSchema], correctOptionId: String, points: Number },
  { _id: false }
);

const incidentSchema = new mongoose.Schema({
  caseId:    { type: String, index: true },   // e.g. "case001", "case002"
  title:     String,
  briefing:  String,
  endSummary: String,                          // closing explanation shown on result screen
  clues: [{ _id: { type: String }, label: String, feedbackText: String, points: { type: Number, default: 10 } }],
  decoys: [{ _id: { type: String }, label: String, feedbackText: String }],
  // 5-step Why chain replaces the old whyCheckpoint + rootCause fields
  whyChain: [whyChainEntrySchema]
});

module.exports = mongoose.model("Incident", incidentSchema);
