const { z } = require('zod');

const JobDescriptionSchema = z.object({
  roleTitle: z.string().nullable().describe("The official job title"),
  domain: z.string().nullable().describe("Industry or business domain (e.g., Fintech, Healthcare, E-commerce)"),
  seniority: z.string().nullable().describe("Seniority level (e.g., Entry-level, Mid-level, Senior, Staff, Lead)"),
  
  required: z.object({
    skills: z.array(z.string()).describe("Absolute must-have general skills"),
    technologies: z.array(z.string()).describe("Absolute must-have specific technologies, languages, or tools"),
    experience: z.string().nullable().describe("Minimum years of experience required"),
    education: z.string().nullable().describe("Minimum education degree required"),
    certifications: z.array(z.string()).describe("Required certifications")
  }),
  
  preferred: z.object({
    skills: z.array(z.string()).describe("Nice-to-have or bonus general skills"),
    technologies: z.array(z.string()).describe("Nice-to-have specific technologies, languages, or tools"),
    experience: z.string().nullable().describe("Preferred years of experience")
  }),

  responsibilities: z.array(z.string()).describe("Key day-to-day responsibilities of the role"),
  softSkills: z.array(z.string()).describe("Required interpersonal or soft skills (e.g., communication, leadership)")
});

module.exports = {
  JobDescriptionSchema
};
