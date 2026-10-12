const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const normalizeEmail = email => {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address');
  return email.trim().toLowerCase();
};
const signToken = user => jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const signup = async (data = {}) => {
  const { name, phone, password } = data || {};
  const email = normalizeEmail(data?.email);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('Enter a name of 1 to 100 characters');
  if (typeof phone !== 'string' || !/^\d{7,15}$/.test(phone.trim())) throw new Error('Phone number must contain 7 to 15 digits');
  if (typeof password !== 'string' || password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password must be at least 6 characters and at most 72 bytes');
  const normalizedPhone = phone.trim();
  if (await User.findOne({ email })) throw new Error('Email already in use');
  if (await User.findOne({ phone: normalizedPhone })) throw new Error('Phone number already in use');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = new User({ name: name.trim(), email, phone: normalizedPhone, passwordHash, role: 'employee' });
  try { await user.save(); } catch (err) {
    if (err.code === 11000) throw new Error('Email or phone number already in use');
    throw err;
  }
  return { token: signToken(user), user: user.toJSON() };
};
const login = async (data = {}) => {
  const email = normalizeEmail(data?.email);
  const password = data?.password;
  if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Invalid email or password');
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !await bcrypt.compare(password, user.passwordHash)) throw new Error('Invalid email or password');
  return { token: signToken(user), user: user.toJSON() };
};
module.exports = { signup, login };
