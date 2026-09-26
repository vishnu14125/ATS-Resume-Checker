const { z } = require('zod');

const ExperienceSchema = z.object({
  company: z.string().nullable().describe("Company name"),
  role: z.string().nullable().describe("Job title or role"),
  startDate: z.string().nullable().describe("Start date (e.g. YYYY-MM)"),
  endDate: z.string().nullable().describe("End date or 'Present'"),
  description: z.string().nullable().describe("Description of responsibilities"),
  technologies: z.array(z.string()).describe("Technologies, tools, and languages used in this role"),
  achievements: z.array(z.string()).describe("Quantifiable achievements or notable accomplishments")
});

const ProjectSchema = z.object({
  name: z.string().nullable(),
  description: z.string().nullable(),
  technologies: z.array(z.string()).describe("Technologies used in this project"),
  achievements: z.array(z.string()).describe("Notable achievements or metrics for this project"),
  links: z.array(z.string()).describe("URLs related to the project")
});

const EducationSchema = z.object({
  institution: z.string().nullable(),
  degree: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  gpa: z.string().nullable()
});

const ResumeStructuredSchema = z.object({
  contact: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    website: z.string().nullable()
  }),
  summary: z.string().nullable().describe("Professional summary or objective"),
  skills: z.array(z.string()).describe("A flat list of all skills explicitly mentioned"),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  projects: z.array(ProjectSchema),
  certifications: z.array(z.string()),
  achievements: z.array(z.string()).describe("Awards, publications, or general achievements not tied to a specific role")
});

module.exports = {
  ResumeStructuredSchema
};
