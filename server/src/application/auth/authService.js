const bcrypt = require('bcryptjs');
const { AppError } = require('../../shared/errors');

/** Public representation of a user; never includes the password hash. */
function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : null,
  };
}

// Compared against when the email is unknown, so both failure paths cost one bcrypt comparison.
let dummyHash = null;
async function getDummyHash() {
  if (!dummyHash) dummyHash = await bcrypt.hash('timing-equalizer-not-a-password', 10);
  return dummyHash;
}

/**
 * Account use cases. Inputs are already validated and normalized by the API
 * layer (trimmed name, lower-cased email).
 */
function createAuthService({ userRepository, tokenService }) {
  const issue = (user) => ({ user: toPublicUser(user), accessToken: tokenService.sign(user) });

  return {
    async register({ name, email, password }) {
      if (await userRepository.findByEmail(email)) throw new AppError('EMAIL_TAKEN');
      const { user, duplicate } = await userRepository.create({ name, email, password });
      if (duplicate) throw new AppError('EMAIL_TAKEN');
      return issue(user);
    },

    async login({ email, password }) {
      const user = await userRepository.findByEmail(email);
      const hash = user ? user.password : await getDummyHash();
      const matches = await bcrypt.compare(password, hash);
      if (!user || !matches) throw new AppError('INVALID_CREDENTIALS');
      return issue(user);
    },

    async getProfile(userId) {
      const user = await userRepository.findById(userId);
      if (!user) throw new AppError('UNAUTHENTICATED', { message: 'This account no longer exists.' });
      return toPublicUser(user);
    },
  };
}

module.exports = { createAuthService, toPublicUser };
