const { z } = require('zod/v4');

const MAX_PASSWORD_BYTES = 72; // bcrypt ignores every byte after the 72nd

const email = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'));

const RegisterBodySchema = z.strictObject({
  name: z.string({ error: 'Name is required.' }).trim().min(1, 'Name is required.').max(100, 'Name must be at most 100 characters.'),
  email,
  password: z
    .string({ error: 'Password is required.' })
    .min(8, 'Password must be at least 8 characters.')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES, `Password must be at most ${MAX_PASSWORD_BYTES} bytes.`),
});

const LoginBodySchema = z.strictObject({
  email,
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(1024),
});

module.exports = { RegisterBodySchema, LoginBodySchema, MAX_PASSWORD_BYTES };
