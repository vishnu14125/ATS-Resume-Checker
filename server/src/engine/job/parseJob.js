const { JobProfileSchema } = require('../../domain/contracts/jobProfile');
const { parseContract } = require('../../domain/contracts');
const { detectJobSections } = require('./sections');
const { buildStatements } = require('./statements');
const { extractRequirements } = require('./requirements');
const { extractTitle, extractCompany, extractLocation, detectEmploymentType, deriveSeniority, extractSoftSkills } = require('./identity');

const PARSER_VERSION = '3.0.0-phase3';
const RULES_VERSION = '3.0.0-phase3';

/**
 * Parses a NormalizedDocument (from the shared Phase 2 ingestion pipeline) into a
 * validated JobProfile. Deterministic and extraction-only: it answers "what does
 * the JD ask for?" and never compares against a resume, scores, or invents data.
 *
 * @param {object} normalizedDocument  a validated NormalizedDocument
 * @returns {object} a validated JobProfile
 */
function parseJob(normalizedDocument) {
  const { lines } = normalizedDocument;
  const sections = detectJobSections(lines);
  const sectionByLine = mapSectionsToLines(lines, sections);

  const statements = buildStatements(lines, sections);
  const { requirements, unclassifiedStatementIds } = extractRequirements(statements, sectionByLine);

  const titleSection = sections.find((s) => s.type === 'title') || null;
  const title = extractTitle(lines, titleSection);
  const company = extractCompany(lines, title);
  const location = extractLocation(lines);
  const employmentType = detectEmploymentType(lines);
  const seniority = deriveSeniority(title, requirements);
  const softSkills = extractSoftSkills(statements);

  const warnings = buildWarnings({ requirements, statements, title });

  const profile = {
    schemaVersion: '1',
    parserVersion: PARSER_VERSION,
    title,
    company,
    seniority,
    location,
    employmentType,
    sections: sections.map((s) => ({ id: s.id, type: s.type, heading: s.heading, startLine: s.startLine, endLine: s.endLine })),
    statements,
    requirements,
    softSkills,
    interpretation: {
      rulesVersion: RULES_VERSION,
      ai: { status: 'not_requested', model: null, promptVersion: null, proposedCount: 0, acceptedCount: 0 },
    },
    revision: 1,
    diagnostics: { unclassifiedStatementIds, warnings },
  };

  return parseContract(JobProfileSchema, profile, 'JobProfile');
}

function mapSectionsToLines(lines, sections) {
  const map = new Map();
  for (const section of sections) {
    for (let i = section.startLine; i <= section.endLine; i += 1) map.set(i, section);
  }
  return map;
}

function buildWarnings({ requirements, statements, title }) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });
  if (requirements.length === 0) push('NO_REQUIREMENTS', 'No requirements could be confidently extracted from this job description.');
  if (!requirements.some((r) => r.type === 'skill')) push('NO_SKILLS', 'No specific skills or technologies were detected.');
  if (!title) push('NO_TITLE', 'No job title was confidently detected.');
  if (statements.length === 0) push('NO_CONTENT', 'The job description had no parseable content sections.');
  return warnings;
}

module.exports = { parseJob, PARSER_VERSION };
