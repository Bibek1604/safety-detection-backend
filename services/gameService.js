const mongoose = require("mongoose");
const Attempt = require("../models/Attempt");
const Incident = require("../models/Incident");

// ---------------------------------------------------------------------------
// Start a new attempt
// ---------------------------------------------------------------------------
const startAttempt = async (userId, incidentId) => {
  if (!mongoose.isObjectIdOrHexString(incidentId)) throw new Error('Invalid incidentId');
  const incident = await Incident.findById(incidentId);
  if (!incident) throw new Error('Incident not found');
  await assertCaseAccess(userId, incident.caseId);
  const attempt = new Attempt({ userId, incidentId, status: "in-progress", startedAt: new Date() });
  await attempt.save();
  return attempt._id;
};

// ---------------------------------------------------------------------------
// Record a clue or decoy click — server decides what it is
// ---------------------------------------------------------------------------
const processClueClick = async (attemptId, hotspotId, userId) => {
  validateAttemptId(attemptId);
  if (typeof hotspotId !== "string") throw new Error("Invalid hotspotId");
  const attempt = await Attempt.findOne({ _id: attemptId, userId, status: "in-progress" });
  if (!attempt) throw new Error("Attempt not found or not in-progress");

  const incident = await Incident.findById(attempt.incidentId);
  if (!incident) throw new Error("Incident not found");

  const clue  = incident.clues.find(c => c._id === hotspotId);
  const decoy = incident.decoys.find(d => d._id === hotspotId);

  if (clue) {
    if (!attempt.cluesFound.includes(hotspotId)) {
      attempt.cluesFound.push(hotspotId);
      await attempt.save();
      return { found: true, feedback: clue.feedbackText, pointDelta: clue.points, alreadyFound: false, score: getRunningScore(attempt, incident) };
    }
    return { alreadyFound: true, feedback: clue.feedbackText, pointDelta: 0, score: getRunningScore(attempt, incident) };
  }

  if (decoy) {
    const existing = attempt.decoyClicks.find(dc => dc.hotspotId === hotspotId);
    if (!existing) {
      attempt.decoyClicks.push({ hotspotId, clickCount: 1 });
      await attempt.save();
      return { isDecoy: true, feedback: decoy.feedbackText, pointDelta: -10, firstClick: true, score: getRunningScore(attempt, incident) };
    }
    existing.clickCount += 1;
    await attempt.save();
    return { isDecoy: true, feedback: decoy.feedbackText, pointDelta: 0, firstClick: false, score: getRunningScore(attempt, incident) };
  }

  throw new Error("Invalid hotspotId");
};

// ---------------------------------------------------------------------------
// Shuffle helper — Fisher-Yates on a COPY of the array, never mutates source
// ---------------------------------------------------------------------------
const shuffleOptions = (options) => {
  const arr = options.map(o => ({ id: o.id, text: o.text })); // plain objects, no Mongoose refs
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ---------------------------------------------------------------------------
// Submit one step of the 5-Why chain (whyOrder 1-5)
// ---------------------------------------------------------------------------
const submitWhyStep = async (attemptId, whyOrder, optionId, userId) => {
  validateAttemptId(attemptId);
  if (!Number.isInteger(whyOrder) || whyOrder < 1 || whyOrder > 5) throw new Error("whyOrder must be 1-5");

  const attempt = await Attempt.findOne({ _id: attemptId, userId, status: "in-progress" });
  if (!attempt) throw new Error("Attempt not found or not in-progress");

  const incident = await Incident.findById(attempt.incidentId);
  if (!incident) throw new Error('Incident not found');
  const chainStep = incident.whyChain.find(w => w.order === whyOrder);
  if (!chainStep) throw new Error('Question not found');
  if (typeof optionId !== 'string' || !chainStep.options.some(o => o.id === optionId)) throw new Error('Invalid optionId');
  const alreadyAnswered = attempt.whyChainAnswers.find(a => a.order === whyOrder);
  if (alreadyAnswered) return whyResponse(attempt, incident, chainStep, alreadyAnswered.correct, true);
  if (attempt.cluesFound.length !== incident.clues.length) throw new Error('Find all clues before answering questions');
  if (whyOrder !== attempt.whyChainAnswers.length + 1) throw new Error('Answer questions in order');

  // Scoring compares optionId string to chainStep.correctOptionId — NOT array position.
  // Shuffling the options array in the response therefore does not affect correctness checks.
  const correct = optionId === chainStep.correctOptionId;

  attempt.whyChainAnswers.push({ order: whyOrder, optionId, correct });
  await attempt.save();

  return whyResponse(attempt, incident, chainStep, correct, false);
};

// ---------------------------------------------------------------------------
// Finalise the attempt (player pressed finish or timer expired)
// ---------------------------------------------------------------------------
const finishAttempt = async (attemptId, userId, timeTakenSeconds, timedOut = false) => {
  validateAttemptId(attemptId);
  if (!Number.isFinite(timeTakenSeconds) || timeTakenSeconds < 0 || timeTakenSeconds > 180) throw new Error('Time must be between 0 and 180 seconds');
  if (typeof timedOut !== 'boolean') throw new Error('timedOut must be a boolean');
  const attempt = await Attempt.findOne({ _id: attemptId, userId });
  if (!attempt) throw new Error('Attempt not found');
  const incident = await Incident.findById(attempt.incidentId);
  if (!incident) throw new Error('Incident not found');
  if (attempt.status === 'completed') return {
    score: attempt.score, passed: attempt.passed, timeTakenSeconds: attempt.timeTakenSeconds,
    timedOut: attempt.timedOut, feedback: incident.endSummary
  };
  if (!timedOut && attempt.whyChainAnswers.length !== incident.whyChain.length) throw new Error('Complete the questions before finishing');
  timeTakenSeconds = timedOut ? 180 : Math.ceil(timeTakenSeconds);
  let score = getRunningScore(attempt, incident);

  // Fast-finish bonus: under 2 minutes (120s) of the 3-minute timer — per game-design.md
  if (timeTakenSeconds < 120 && !timedOut) score += 10;

  score = Math.min(100, Math.max(0, score));
  const passed = score >= 60;

  attempt.status = "completed";
  attempt.score = score;
  attempt.passed = passed;
  attempt.timeTakenSeconds = timeTakenSeconds;
  attempt.timedOut = timedOut;
  attempt.createdAt = new Date();
  await attempt.save();

  const feedback = incident.endSummary ||
    "The slip happened because the floor was wet. The floor was wet because a container was leaking. " +
    "The leak went unreported because staff didn't know the reporting process — because the safety training " +
    "program wasn't effectively delivered or reinforced. Not a careless worker.";

  return { score, passed, timeTakenSeconds, timedOut, feedback };
};

// ---------------------------------------------------------------------------
// Running score helper — called server-side only, never trusted from client
// ---------------------------------------------------------------------------
const getRunningScore = (attempt, incident) => {
  let score = 0;

  // Clues: +10 each
  score += (attempt.cluesFound || []).reduce((total, id) => total + (incident?.clues.find(c => c._id === id)?.points || 0), 0);

  // Decoy first-clicks: -10 each
  score -= (attempt.decoyClicks?.length || 0) * 10;

  // Why chain: correct answers add their step points, wrong answers cost -10
  if (attempt.whyChainAnswers && incident?.whyChain) {
    for (const ans of attempt.whyChainAnswers) {
      if (ans.correct) {
        const step = incident.whyChain.find(w => w.order === ans.order);
        if (step) score += step.points;
      } else {
        score -= 10;
      }
    }
  }

  return score;
};

function validateAttemptId(id) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new Error('Invalid attemptId');
}
async function assertCaseAccess(userId, caseId) {
  if (caseId !== 'case002') return;
  const first = await Incident.findOne({ caseId: 'case001' });
  if (!first || !await Attempt.exists({ userId, incidentId: first._id, status: 'completed', passed: true })) {
    throw new Error('Pass case001 before starting case002');
  }
}
function whyResponse(attempt, incident, step, correct, alreadyAnswered) {
  const next = incident.whyChain.find(w => w.order === step.order + 1);
  return { correct, alreadyAnswered, pointDelta: correct ? step.points : -10,
    isFinal: !next, score: getRunningScore(attempt, incident),
    nextQuestion: next ? { order: next.order, question: next.question, options: shuffleOptions(next.options), points: next.points } : null
  };
}
module.exports = { startAttempt, processClueClick, submitWhyStep, finishAttempt, assertCaseAccess };
