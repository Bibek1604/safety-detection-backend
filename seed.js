const { getConfig } = require("./config");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const Incident = require("./models/Incident");

const seedData = async () => {
  try {

    // Create an admin once; redeploys preserve its existing password.
    const email = (process.env.ADMIN_EMAIL || (process.env.NODE_ENV === 'production' ? '' : 'admin@safetydetective.com')).trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set a valid ADMIN_EMAIL');
    const existing = await User.findOne({ email });
    if (existing && existing.role !== 'admin') throw new Error('ADMIN_EMAIL belongs to an employee');
    if (!existing) {
      const password = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'Admin1234!');
      if (password.length < (process.env.NODE_ENV === 'production' ? 12 : 6)) throw new Error('ADMIN_PASSWORD must have at least 12 characters');
      const passwordHash = await bcrypt.hash(password, 12);
      await User.findOneAndUpdate({ email }, { $setOnInsert: {
        name: 'Admin', email, passwordHash, phone: '0000000000', role: 'admin'
      } }, { upsert: true, new: true });
    }
    console.log('Admin account ready');

    // ── Case001 — Warehouse Slip Incident ─────────────────────────────────────
    // Match by title (not caseId) so re-running the seed after the schema migration
    // updates the existing document rather than inserting a second one.
    await Incident.findOneAndUpdate(
      { title: "Warehouse Slip Incident" },
      {
        caseId:   "case001",
        title:    "Warehouse Slip Incident",
        briefing: "A warehouse employee slipped near the loading dock this morning. No serious injury — but it could have been. Investigate the scene, find out what really happened, and figure out the root cause, not just what's sitting on the surface.",
        endSummary: "The slip happened because the floor was wet. The floor was wet because a container was leaking. The leak went unreported because staff didn't know the reporting process — because the safety training program wasn't effectively delivered or reinforced. Not a careless worker.",
        clues: [
          { _id: "wet-patch",         label: "Oil puddle on the floor",  feedbackText: "This is where the slip happened.",              points: 10 },
          { _id: "cracked-container", label: "Leaking oil drum",          feedbackText: "This looks like the source of the leak.",       points: 10 },
          { _id: "hazard-log",        label: "Incident report log",       feedbackText: "Nobody logged this leak before the slip.",       points: 10 }
        ],
        decoys: [
          { _id: "fire-extinguisher", label: "Fire extinguisher",                 feedbackText: "Standard equipment — not connected to this incident." },
          { _id: "overhanging-boxes", label: "Boxes stacked at risk of falling",  feedbackText: "A hazard worth flagging separately — but not this one." },
          { _id: "safety-gloves",     label: "Worker figure in protective gear",  feedbackText: "PPE on display, unrelated to how this happened." },
          { _id: "wet-floor-sign",    label: "Wet floor sign in unrelated aisle", feedbackText: "A wet floor sign — just nowhere near the actual spill." }
        ],
        whyChain: [
          {
            order: 1, points: 10,
            question: "Why did the worker slip?",
            options: [
              { id: "A", text: "There was liquid on the floor" },
              { id: "B", text: "The worker was wearing the wrong shoes" },
              { id: "C", text: "The floor surface was worn and uneven" },
              { id: "D", text: "The worker was rushing and not looking down" }
            ],
            correctOptionId: "A"
          },
          {
            order: 2, points: 10,
            question: "Why was there liquid on the floor?",
            options: [
              { id: "A", text: "A container nearby had leaked" },
              { id: "B", text: "It had rained and the loading door was left open" },
              { id: "C", text: "Another worker spilled a drink" },
              { id: "D", text: "Condensation had built up overnight" }
            ],
            correctOptionId: "A"
          },
          {
            order: 3, points: 10,
            question: "Why wasn't the leak cleaned up before anyone slipped?",
            options: [
              { id: "A", text: "The leak was never reported" },
              { id: "B", text: "Cleaning staff were occupied elsewhere at the time" },
              { id: "C", text: "The leak had only just started minutes earlier" },
              { id: "D", text: "The puddle was too small to notice easily" }
            ],
            correctOptionId: "A"
          },
          {
            order: 4, points: 10,
            question: "Why wasn't the leak reported?",
            options: [
              { id: "A", text: "The worker who noticed it didn't know how to report a hazard" },
              { id: "B", text: "The worker assumed someone else already had" },
              { id: "C", text: "There was no reporting form available nearby" },
              { id: "D", text: "The worker didn't think it was serious enough to report" }
            ],
            correctOptionId: "A"
          },
          {
            order: 5, points: 20,
            question: "Why didn't staff know how to report hazards?",
            options: [
              { id: "A", text: "The safety training program wasn't effectively delivered or reinforced" },
              { id: "B", text: "The worker just hadn't been paying attention during training" },
              { id: "C", text: "There wasn't enough staff on shift to keep up with reporting" },
              { id: "D", text: "The hazard reporting policy existed but was outdated" }
            ],
            correctOptionId: "A"
          }
        ]
      },
      { upsert: true, new: true }
    );
    console.log("Case001 incident seeded");

    // ── Case002 — Blocked Fire Exit Incident ──────────────────────────────────
    await Incident.findOneAndUpdate(
      { caseId: "case002" },
      {
        caseId:   "case002",
        title:    "Blocked Fire Exit Incident",
        briefing: "An alarm sounded during a routine shift. A worker tried to leave through the nearest emergency exit — it wouldn't open. Investigate the scene, find the evidence, and trace the root cause, not just what's sitting on the surface.",
        endSummary: "The worker couldn't evacuate because the exit was blocked by stacked boxes. The boxes were there because staff used that space as overflow storage. Nobody cleared it because fire-exit clearance checks weren't happening — because no one had ever been assigned responsibility for them. Not a storage problem. A system problem.",
        clues: [
          { _id: "blocked-exit-door",  label: "Blocked fire exit door",         feedbackText: "Boxes and pallets stacked floor to ceiling — this exit hasn't been usable in a while.",               points: 10 },
          { _id: "hidden-extinguisher", label: "Hidden fire extinguisher",       feedbackText: "Also buried behind the boxes — useless in an emergency if no one can reach it.",                     points: 10 },
          { _id: "inspection-log",     label: "Fire safety inspection log",      feedbackText: "No entries in months. Nobody's been checking this exit route.",                                        points: 10 }
        ],
        decoys: [
          { _id: "wet-floor-sign", feedbackText: "A wet floor sign. Unrelated — there's no spill here." },
          { _id: "ppe-figure",     feedbackText: "PPE on display, unrelated to how this happened." },
          { _id: "loose-box",      feedbackText: "Just a misplaced box — not connected to the blocked exit." },
          { _id: "parked-forklift", feedbackText: "Present, but not involved in this incident." }
        ],
        whyChain: [
          {
            order: 1, points: 10,
            question: "Why couldn't the worker evacuate quickly through the nearest exit?",
            options: [
              { id: "A", text: "Didn't know where the exit was" },
              { id: "B", text: "The exit door was blocked by stacked boxes and pallets" },
              { id: "C", text: "Alarm wasn't loud enough" },
              { id: "D", text: "Too far from any exit" }
            ],
            correctOptionId: "B"
          },
          {
            order: 2, points: 10,
            question: "Why were boxes and pallets stacked in front of the exit?",
            options: [
              { id: "A", text: "Staff used the space next to the exit as overflow storage" },
              { id: "B", text: "A delivery had nowhere else to go that day" },
              { id: "C", text: "Door was thought to be permanently locked" },
              { id: "D", text: "Cleaning staff moved them there temporarily" }
            ],
            correctOptionId: "A"
          },
          {
            order: 3, points: 10,
            question: "Why was the exit allowed to stay blocked for so long?",
            options: [
              { id: "A", text: "No one walks past that exit normally" },
              { id: "B", text: "Regular fire-exit clearance checks weren't being carried out" },
              { id: "C", text: "Boxes were too heavy to move alone" },
              { id: "D", text: "Staff assumed someone else would clear it" }
            ],
            correctOptionId: "B"
          },
          {
            order: 4, points: 10,
            question: "Why weren't fire-exit clearance checks being carried out?",
            options: [
              { id: "A", text: "No one had been assigned responsibility for fire safety walkthroughs" },
              { id: "B", text: "The checklist app was broken" },
              { id: "C", text: "Not a priority that quarter" },
              { id: "D", text: "Warehouse passed its last inspection" }
            ],
            correctOptionId: "A"
          },
          {
            order: 5, points: 20,
            question: "What's the root cause of this incident?",
            options: [
              { id: "A", text: "Worker should've found another exit sooner" },
              { id: "B", text: "Fire exits were never included in routine safety checks" },
              { id: "C", text: "Not enough exits for the warehouse's size" },
              { id: "D", text: "Staff need more manual-handling training" }
            ],
            correctOptionId: "B"
          }
        ]
      },
      { upsert: true, new: true }
    );
    console.log("Case002 incident seeded");

    console.log("Seeding complete!");

  } catch (err) {
    throw err;
  }
};

async function run() {
  const config = getConfig();
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
    await seedData();
  } finally {
    await mongoose.disconnect();
  }
}
if (require.main === module) run().catch(() => {
  console.error('Seeding failed. Check database access and ADMIN_EMAIL / ADMIN_PASSWORD.');
  process.exitCode = 1;
});
module.exports = { seedData };

