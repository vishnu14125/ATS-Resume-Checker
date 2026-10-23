const User = require('../db/models/User');
const { isObjectId } = require('./ownership');

/** Case-insensitive comparison so accounts stored with mixed-case emails still match. */
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };
const DUPLICATE_KEY = 11000;

function createUserRepository({ model = User } = {}) {
  return {
    findByEmail(email) {
      return model.findOne({ email }).collation(CASE_INSENSITIVE);
    },

    findById(id) {
      if (!isObjectId(id)) return Promise.resolve(null);
      return model.findById(id);
    },

    /** Creates a user; resolves `{ duplicate: true }` if the email is already taken. */
    async create({ name, email, password }) {
      try {
        const user = await model.create({ name, email, password });
        return { user, duplicate: false };
      } catch (err) {
        if (err && err.code === DUPLICATE_KEY) return { user: null, duplicate: true };
        throw err;
      }
    },
  };
}

module.exports = { createUserRepository };
