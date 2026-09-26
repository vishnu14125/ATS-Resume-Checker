const { z } = require('zod');

// Evidence Schema - The core of V2 explainability
const SkillEvidenceSchema = z.object({
  canonical: z.string().describe("Normalized skill name (e.g. 'react')"),
  original: z.string().describe("Original text as written (e.g. 'React.js')"),
  section: z.string().describe("Section where it was found (e.g. 'experience', 'skills')"),
  evidence: z.string().describe("The full sentence or bullet point containing the skill"),
  confidence: z.number().min(0).max(1).describe("Confidence score of extraction"),
  evidenceType: z.enum(['explicit', 'implicit', 'inferred']).describe("How the skill was identified")
});

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}$|^Present$/, "Must be YYYY-MM or 'Present'");

const ExperienceEntrySchema = z.object({
  company: z.string().nullable(),
  role: z.string().nullable(),
  startDate: z.string().nullable(), // YYYY-MM
  endDate: z.string().nullable(), // YYYY-MM or Present
  durationMonths: z.number().nullable(),
  description: z.string().nullable(),
  achievements: z.array(z.string()).describe("List of original achievement bullets"),
  skills: z.array(SkillEvidenceSchema).describe("Skills extracted explicitly from this role")
});

const EducationEntrySchema = z.object({
  institution: z.string().nullable(),
  degree: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  gpa: z.string().nullable()
});

const ProjectEntrySchema = z.object({
  name: z.string().nullable(),
  description: z.string().nullable(),
  links: z.array(z.string()),
  skills: z.array(SkillEvidenceSchema)
});

const CertificationEntrySchema = z.object({
  name: z.string(),
  issuer: z.string().nullable(),
  date: z.string().nullable()
});

const ResumeProfileSchema = z.object({
  candidate: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    portfolio: z.string().nullable()
  }),
  summary: z.string().nullable(),
  experience: z.array(ExperienceEntrySchema),
  education: z.array(EducationEntrySchema),
  projects: z.array(ProjectEntrySchema),
  certifications: z.array(CertificationEntrySchema),
  allSkills: z.array(SkillEvidenceSchema).describe("Aggregated list of all skills found anywhere in the resume")
});

const JDRequirementSchema = z.object({
  canonical: z.string(),
  original: z.string(),
  classification: z.enum(['required', 'preferred', 'nice_to_have', 'knockout']),
  qualifier: z.string().nullable().describe("The word that made it required/preferred (e.g. 'must have', 'bonus')"),
  evidence: z.string().describe("The exact JD sentence")
});

const JDProfileSchema = z.object({
  roleTitle: z.string().nullable(),
  domain: z.string().nullable(),
  seniority: z.string().nullable(),
  minYearsExperience: z.number().nullable(),
  requirements: z.array(JDRequirementSchema),
  responsibilities: z.array(z.string())
});

const MatchEvidenceSchema = z.object({
  requirementCanonical: z.string(),
  requirementClassification: z.enum(['required', 'preferred', 'nice_to_have', 'knockout']),
  matchType: z.enum(['exact', 'normalized', 'alias', 'missing']),
  confidence: z.number().min(0).max(1),
  resumeSection: z.string().nullable(),
  resumeEvidence: z.string().nullable(),
  resumeText: z.string().nullable(),
  evidenceType: z.string().nullable(),
  allResumeEvidences: z.array(SkillEvidenceSchema).optional()
});

const ParseabilityResultSchema = z.object({
  isParseable: z.boolean(),
  wordCount: z.number(),
  issues: z.array(z.string()).describe("Issues like 'Images detected', 'Garbage text', etc.")
});

const RecommendationSchema = z.object({
  category: z.string(),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  title: z.string(),
  explanation: z.string(),
  evidence: z.object({
    jobDescription: z.string().nullable(),
    resume: z.string().nullable()
  }),
  action: z.string()
});

const ATSBaselineAnalysisSchema = z.object({
  resumeProfile: ResumeProfileSchema,
  jdProfile: JDProfileSchema,
  parseability: ParseabilityResultSchema,
  matches: z.array(MatchEvidenceSchema),
  overallScore: z.number(),
  scoreBreakdown: z.record(z.number()),
  recommendations: z.array(RecommendationSchema),
  resumeIssues: z.array(z.object({
    type: z.string(),
    issue: z.string(),
    severity: z.string(),
    context: z.string()
  }))
});

module.exports = {
  SkillEvidenceSchema,
  ExperienceEntrySchema,
  EducationEntrySchema,
  ProjectEntrySchema,
  CertificationEntrySchema,
  ResumeProfileSchema,
  JDRequirementSchema,
  JDProfileSchema,
  MatchEvidenceSchema,
  ParseabilityResultSchema,
  RecommendationSchema,
  ATSBaselineAnalysisSchema
};
