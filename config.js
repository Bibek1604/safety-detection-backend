const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function getConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const mongoUri = env.MONGO_URI || (production ? '' : 'mongodb://127.0.0.1:27017/safety_detective');
  if (!mongoUri) throw new Error('MONGO_URI is required in production');
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) throw new Error('MONGO_URI must be a MongoDB connection string');
  if (!env.JWT_SECRET || /^(your_jwt_secret_here|changeme)$/i.test(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters and must not be a placeholder');
  }
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  return { production, mongoUri, port, seedOnStart: env.SEED_ON_START === 'true', serveFrontend: env.SERVE_FRONTEND !== 'false' };
}
module.exports = { getConfig };
