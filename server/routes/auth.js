const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
require('dotenv').config();

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleAuthUrl = () => {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    client_id: process.env.GOOGLE_CLIENT_ID,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
  };
  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
};

router.get('/google', (req, res) => {
  res.redirect(googleAuthUrl());
});

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: 'Email already registered' });

    const user = new User({ name, email, password });
    await user.save();

    const token = generateToken(user);
    res.status(201).json({ token, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Invalid credentials' });

    const token = generateToken(user);
    res.status(200).json({ token, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/google', async (req, res) => {
  const { credential } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    let user = await User.findOne({ email });
    if (!user) {
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(email + process.env.JWT_SECRET, salt);
      user = new User({ name, email, password: hashedPassword });
      await user.save();
    }

    const token = generateToken(user);
    res.status(200).json({ token, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(500).json({ message: 'Failed to authenticate with Google' });
  }
});

const axios = require('axios');

router.get('/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json({ message: 'Authorization code not provided' });
  }

  try {
    const qs = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString();

    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', qs, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { id_token } = tokenResponse.data;

    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    let user = await User.findOne({ email });
    if (!user) {
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(email + process.env.JWT_SECRET, salt);
      user = new User({ name, email, password: hashedPassword });
      await user.save();
    }

    const token = generateToken(user);

    const redirectUrl = new URL(process.env.CLIENT_URL || 'http://localhost:5173');
    redirectUrl.searchParams.append('token', token);
    redirectUrl.searchParams.append('name', user.name);
    redirectUrl.searchParams.append('email', user.email);

    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.status(500).json({ message: 'Failed to authenticate with Google' });
  }
});

module.exports = router;
