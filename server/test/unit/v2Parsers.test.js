const ResumeParserV2 = require('../../services/parsers/ResumeParserV2');
const JDParserV2 = require('../../services/parsers/JDParserV2');
const { 
  ResumeProfileSchema, 
  JDProfileSchema, 
  SkillEvidenceSchema, 
  ExperienceEntrySchema, 
  ProjectEntrySchema 
} = require('../../services/schemas/v2Schemas');

describe('ATS V2 Foundations', () => {

  describe('1. Schemas Validation', () => {
    it('should validate SkillEvidence correctly', () => {
      const evidence = {
        canonical: "react",
        original: "React.js",
        section: "experience",
        evidence: "Built scalable frontend with React.js",
        confidence: 0.95,
        evidenceType: "explicit"
      };
      const result = SkillEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(true);
    });

    it('should validate ExperienceEntry correctly', () => {
      const exp = {
        company: "Google",
        role: "Software Engineer",
        startDate: "2020-01",
        endDate: "Present",
        durationMonths: null,
        description: "Worked on Search.",
        achievements: ["Increased QPS by 20%"],
        skills: []
      };
      const result = ExperienceEntrySchema.safeParse(exp);
      expect(result.success).toBe(true);
    });

    it('should validate ProjectEntry correctly', () => {
      const proj = {
        name: "Personal Website",
        description: "Built with React",
        links: ["https://example.com"],
        skills: []
      };
      const result = ProjectEntrySchema.safeParse(proj);
      expect(result.success).toBe(true);
    });
  });

  describe('2. ResumeParserV2 - Date Normalization', () => {
    it('should normalize Jan 2020 to 2020-01', () => {
      expect(ResumeParserV2.normalizeDate("Jan 2020")).toBe("2020-01");
    });
    it('should normalize 03/2021 to 2021-03', () => {
      expect(ResumeParserV2.normalizeDate("03/2021")).toBe("2021-03");
    });
    it('should normalize Present to Present', () => {
      expect(ResumeParserV2.normalizeDate("Present")).toBe("Present");
      expect(ResumeParserV2.normalizeDate("Current")).toBe("Present");
    });
    it('should fallback to 2020-01 if only 2020 is provided', () => {
      expect(ResumeParserV2.normalizeDate("2020")).toBe("2020-01");
    });
  });

  describe('3. ResumeParserV2 - Parsing', () => {
    const sampleResume = `
John Doe
john@example.com | 555-123-4567 | github.com/johndoe

Summary
Passionate software engineer.

Experience
Google, Software Engineer
Jan 2020 - Present
- Built frontend using React and Node.js
- Scaled databases with MongoDB

Education
Bachelor of Science in Computer Science
2016 - 2020
University of Tech
    `;

    it('should extract candidate info', () => {
      const profile = ResumeParserV2.parse(sampleResume);
      expect(profile.candidate.email).toBe("john@example.com");
      expect(profile.candidate.phone).toBe("555-123-4567");
      expect(profile.candidate.github).toBe("github.com/johndoe");
    });

    it('should parse experience with skills and evidence', () => {
      const profile = ResumeParserV2.parse(sampleResume);
      expect(profile.experience.length).toBeGreaterThan(0);
      const exp = profile.experience[0];
      expect(exp.company).toBe("Google");
      expect(exp.startDate).toBe("2020-01");
      expect(exp.endDate).toBe("Present");
      
      const reactSkill = exp.skills.find(s => s.canonical === 'react');
      expect(reactSkill).toBeDefined();
      expect(reactSkill.evidence).toContain("Built frontend using React");
      expect(reactSkill.section).toBe("experience");
    });

    it('should parse education', () => {
      const profile = ResumeParserV2.parse(sampleResume);
      expect(profile.education.length).toBeGreaterThan(0);
      expect(profile.education[0].degree).toBe("Bachelor of Science in Computer Science");
      expect(profile.education[0].startDate).toBe("2016-01");
    });

    it('should fallback gracefully on empty or malformed text', () => {
      const profile = ResumeParserV2.parse("Just some random text with no structure.");
      expect(profile.candidate.email).toBeNull();
      expect(profile.experience.length).toBe(0);
      // Shouldn't crash
    });
  });

  describe('4. JDParserV2 - Requirement Classification', () => {
    it('should classify must-have vs preferred correctly', () => {
      const jdText = `
Software Engineer
5 years of experience

Requirements:
- You must have strong experience in React and Node.js.
- Mandatory knowledge of AWS.

Nice to have:
- Bonus points for Docker and Kubernetes.
- Preferred experience with Python.
      `;

      const profile = JDParserV2.parse(jdText);
      expect(profile.roleTitle).toBe("Software Engineer");
      expect(profile.minYearsExperience).toBe(5);

      const react = profile.requirements.find(r => r.canonical === 'react');
      expect(react.classification).toBe("required");
      expect(react.qualifier).toBe("must have");

      const aws = profile.requirements.find(r => r.canonical === 'aws');
      expect(aws.classification).toBe("required");
      expect(aws.qualifier).toBe("mandatory");

      const docker = profile.requirements.find(r => r.canonical === 'docker');
      expect(docker.classification).toBe("preferred");
      expect(docker.qualifier).toBe("bonus");

      const python = profile.requirements.find(r => r.canonical === 'python');
      expect(python.classification).toBe("preferred");
      expect(python.qualifier).toBe("preferred");
    });
  });

});
