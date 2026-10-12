/**
 * fix-duplicate-incident.js
 * One-shot script: find duplicate "Warehouse Slip Incident" docs, keep the one
 * with real Attempt records, set caseId:"case001" on it, delete the other.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Incident = require("./models/Incident");
const Attempt  = require("./models/Attempt");

async function run() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/safety_detective");
  console.log("Connected");

  const docs = await Incident.find({ title: "Warehouse Slip Incident" }).lean();
  console.log(`Found ${docs.length} "Warehouse Slip Incident" document(s):`);
  for (const d of docs) {
    const count = await Attempt.countDocuments({ incidentId: d._id });
    console.log(`  _id=${d._id}  caseId=${d.caseId ?? "(none)"}  attempts=${count}`);
  }

  if (docs.length === 0) {
    console.log("Nothing to fix."); process.exit(0);
  }

  if (docs.length === 1) {
    const d = docs[0];
    if (!d.caseId) {
      await Incident.updateOne({ _id: d._id }, { $set: { caseId: "case001" } });
      console.log("Set caseId: case001 on the single doc.");
    } else {
      console.log("Already has caseId — nothing to do.");
    }
    process.exit(0);
  }

  // Two docs — find the real one (has Attempt records)
  let realDoc = null, dupDoc = null;
  for (const d of docs) {
    const count = await Attempt.countDocuments({ incidentId: d._id });
    if (count > 0) realDoc = d;
    else           dupDoc  = d;
  }

  if (!realDoc) {
    console.error("Neither document has Attempts! Aborting — inspect manually.");
    process.exit(1);
  }
  if (!dupDoc) {
    // Both have attempts (shouldn't happen) — keep the one with caseId already set
    dupDoc  = docs.find(d => !d.caseId) ?? docs[1];
    realDoc = docs.find(d => d.caseId)  ?? docs[0];
  }

  console.log(`Real doc: ${realDoc._id} (has Attempts)`);
  console.log(`Duplicate: ${dupDoc._id} (no Attempts) — will delete`);

  // Set caseId on the real doc if missing
  if (!realDoc.caseId) {
    await Incident.updateOne({ _id: realDoc._id }, { $set: { caseId: "case001" } });
    console.log("caseId: case001 set on real doc.");
  }

  // Delete the duplicate
  await Incident.deleteOne({ _id: dupDoc._id });
  console.log("Duplicate deleted.");

  // Verify
  const remaining = await Incident.find({}).select("_id title caseId").lean();
  console.log("Remaining Incident documents:");
  for (const r of remaining) console.log(`  ${r._id}  title="${r.title}"  caseId=${r.caseId}`);

  // Verify test1's attempt still intact
  const attemptCount = await Attempt.countDocuments({ incidentId: realDoc._id });
  console.log(`Attempts on real case001 doc: ${attemptCount} (should be ≥ 1)`);

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
