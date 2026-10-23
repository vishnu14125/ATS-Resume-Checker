const fs = require('fs');
const path = require('path');

const FIXTURES = path.resolve(__dirname, '../../fixtures');
const RESUMES = path.join(FIXTURES, 'resumes');
const JDS = path.join(FIXTURES, 'jds');

const readResumeBuffer = (name) => fs.readFileSync(path.join(RESUMES, name));
const readResumeText = (name) => fs.readFileSync(path.join(RESUMES, name), 'utf8');
const resumePath = (name) => path.join(RESUMES, name);
const readFixtureBuffer = (name) => fs.readFileSync(path.join(FIXTURES, name));
const readJdBuffer = (name) => fs.readFileSync(path.join(JDS, name));
const readJdText = (name) => fs.readFileSync(path.join(JDS, name), 'utf8');

const REFERENCE_DATE = new Date('2026-09-29T00:00:00Z');

module.exports = { FIXTURES, RESUMES, JDS, readResumeBuffer, readResumeText, resumePath, readFixtureBuffer, readJdBuffer, readJdText, REFERENCE_DATE };
