const Attempt = require('../models/Attempt');
const User = require('../models/User');

const getHistory = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const attempts = await Attempt.find({ userId })
    .populate("incidentId", "caseId")
    .sort({ createdAt: -1 });
  
  let bestScore = 0;
  attempts.forEach(a => {
    if (a.score > bestScore) bestScore = a.score;
  });

  return {
    name: user.name,
    email: user.email,
    bestScore,
    attempts
  };
};

module.exports = { getHistory };
