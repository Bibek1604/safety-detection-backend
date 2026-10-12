const Attempt = require('../models/Attempt');
const User = require('../models/User');

const Incident = require('../models/Incident');

const getResults = async () => {
  const employees = await User.find({ role: 'employee' }).lean();
  const incidents  = await Incident.find({}, '_id title').lean();

  const results = [];

  for (const emp of employees) {
    for (const inc of incidents) {
      // Only completed attempts count toward score/status
      const attempts = await Attempt.find({
        userId:     emp._id,
        incidentId: inc._id,
        status:     'completed',
      }).sort({ createdAt: -1 }).lean();

      const totalAttempts = attempts.length;
      let bestScore   = null;  // null = never played (not 0)
      let passed      = false;
      let lastAttempt = null;

      if (totalAttempts > 0) {
        lastAttempt = attempts[0].createdAt || attempts[0].startedAt;
        attempts.forEach(a => {
          if (bestScore === null || a.score > bestScore) bestScore = a.score;
          if (a.passed) passed = true;
        });
      }

      if (totalAttempts === 0) continue;   // no row if never attempted

      results.push({
        userId:        emp._id,
        name:          emp.name,
        email:         emp.email,
        incidentId:    inc._id,
        incidentTitle: inc.title,
        attempts:      totalAttempts,
        bestScore,
        passed,
        lastAttempt,
      });
    }
  }

  return results;
};

const getEmployees = async () => {
  return await User.find({ role: 'employee' }).select('-passwordHash');
};

const deleteEmployee = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('Employee not found');
  if (user.role === 'admin') throw new Error('Cannot delete an admin account');

  // Cascade-delete all attempts, then the user document.
  // After this, the email and phone are immediately free for re-registration.
  await Attempt.deleteMany({ userId: user._id });
  await User.findByIdAndDelete(user._id);
};

module.exports = { getResults, getEmployees, deleteEmployee };
