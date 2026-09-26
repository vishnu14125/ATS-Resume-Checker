const { techKeywords, actionVerbs } = require('../LocalATSAnalyzer');

class ResumeParserV2 {
  constructor() {
    // Reuse some tech keywords from LocalATSAnalyzer
    this.techKeywords = require('../LocalATSAnalyzer').prototype?.techKeywords || new Set([
      'react', 'node', 'javascript', 'python', 'java', 'sql', 'mongodb', 'docker', 'kubernetes', 'aws', 'typescript', 'express', 'css', 'html', 'git'
    ]); // Fallback just in case
  }

  parse(text) {
    if (!text || typeof text !== 'string') {
      throw new Error("Invalid resume text");
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // We will build a ResumeProfile
    const profile = {
      candidate: { name: null, email: null, phone: null, location: null, linkedin: null, github: null, portfolio: null },
      summary: null,
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      allSkills: []
    };

    // Extract Contact
    this.extractContactInfo(lines.slice(0, 20).join('\n'), profile.candidate);

    // Sectionize
    const sections = this.sectionize(lines);

    // Parse Sections
    if (sections['experience']) {
      profile.experience = this.parseExperience(sections['experience']);
    }

    if (sections['education']) {
      profile.education = this.parseEducation(sections['education']);
    }

    if (sections['projects']) {
      profile.projects = this.parseProjects(sections['projects']);
    }

    // Extract all skills from text globally
    profile.allSkills = this.extractSkillsWithEvidence(lines.join('\n'));

    // Extract skills tied specifically to experience sections
    profile.experience.forEach(exp => {
      const expText = `${exp.role} ${exp.company} ${exp.description} ${exp.achievements.join(' ')}`;
      exp.skills = this.extractSkillsWithEvidence(expText, 'experience');
    });

    profile.projects.forEach(proj => {
      const projText = `${proj.name} ${proj.description}`;
      proj.skills = this.extractSkillsWithEvidence(projText, 'project');
    });

    return profile;
  }

  extractContactInfo(headerText, candidate) {
    const emailMatch = headerText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
    if (emailMatch) candidate.email = emailMatch[1];

    const phoneMatch = headerText.match(/(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
    if (phoneMatch) candidate.phone = phoneMatch[0];

    const linkedinMatch = headerText.match(/(?:linkedin\.com\/in\/|linkedin:?)\s*([a-zA-Z0-9-]+)/i);
    if (linkedinMatch) candidate.linkedin = linkedinMatch[0];

    const githubMatch = headerText.match(/(?:github\.com\/|github:?)\s*([a-zA-Z0-9-]+)/i);
    if (githubMatch) candidate.github = githubMatch[0];
  }

  sectionize(lines) {
    const sections = {
      'experience': [],
      'education': [],
      'projects': [],
      'skills': [],
      'summary': [],
      'certifications': []
    };
    
    let currentSection = 'summary';

    const sectionRegexes = {
      'experience': /^(experience|work history|employment|professional experience)/i,
      'education': /^(education|academic background)/i,
      'projects': /^(projects|personal projects|open source)/i,
      'skills': /^(skills|technologies|technical skills|core competencies)/i,
      'certifications': /^(certifications|licenses)/i
    };

    for (const line of lines) {
      let matchedSection = false;
      if (line.length < 40) { // Section headers are usually short
        for (const [sectionName, regex] of Object.entries(sectionRegexes)) {
          if (regex.test(line)) {
            currentSection = sectionName;
            matchedSection = true;
            break;
          }
        }
      }

      if (!matchedSection) {
        if (sections[currentSection]) {
          sections[currentSection].push(line);
        } else {
          sections[currentSection] = [line];
        }
      }
    }
    return sections;
  }

  parseExperience(lines) {
    const experience = [];
    let currentExp = null;

    // Date regex (e.g. Jan 2020 - Present, 01/2020 - 05/2021, 2020 - 2021)
    const dateRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}|\d{1,2}\/\d{4}|\d{4})\s*(?:-|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}|\d{1,2}\/\d{4}|\d{4}|Present|Current)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dateMatch = line.match(dateRegex);
      
      if (dateMatch && line.length < 100) { // Likely a job header
        if (currentExp) experience.push(currentExp);
        
        let textBeforeDate = line.replace(dateMatch[0], '').trim();
        let company = "Unknown";
        let role = "Unknown";

        if (textBeforeDate.length > 2) {
          company = textBeforeDate.split(',')[0];
          role = textBeforeDate;
        } else if (i > 0) {
          // Check previous line
          const prevLine = lines[i - 1];
          const parts = prevLine.split(',');
          if (parts.length > 1) {
            company = parts[0].trim();
            role = parts[1].trim();
          } else {
            company = prevLine.trim();
            role = prevLine.trim();
          }
        }
        
        currentExp = {
          company: company,
          role: role,
          startDate: this.normalizeDate(dateMatch[1]),
          endDate: this.normalizeDate(dateMatch[2]),
          durationMonths: null,
          description: "",
          achievements: [],
          skills: []
        };
      } else if (currentExp) {
        if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
          currentExp.achievements.push(line.replace(/^[•\-*]\s*/, ''));
        } else {
          currentExp.description += (currentExp.description ? ' ' : '') + line;
        }
      }
    }
    if (currentExp) experience.push(currentExp);
    return experience;
  }

  parseEducation(lines) {
    const education = [];
    let currentEdu = null;
    
    // Very simplified logic for V2 foundation
    const degreeRegex = /(Bachelor|Master|PhD|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Ph\.?D\.?)/i;
    const dateRegex = /(\d{4})\s*(?:-|to)\s*(\d{4}|Present)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dateMatch = line.match(dateRegex);

      if (dateMatch && line.length < 100) {
        if (currentEdu && !currentEdu.startDate) {
          currentEdu.startDate = dateMatch[1] ? this.normalizeDate(dateMatch[1]) : null;
          currentEdu.endDate = dateMatch[2] ? this.normalizeDate(dateMatch[2]) : null;
        } else {
          if (currentEdu) education.push(currentEdu);
          let degree = line.replace(dateMatch[0], '').trim();
          if (degree.length < 3 && i > 0) {
            degree = lines[i - 1];
          }
          currentEdu = {
            institution: "Unknown",
            degree: degree,
            fieldOfStudy: null,
            startDate: dateMatch[1] ? this.normalizeDate(dateMatch[1]) : null,
            endDate: dateMatch[2] ? this.normalizeDate(dateMatch[2]) : null,
            gpa: null
          };
        }
      } else if (degreeRegex.test(line) && line.length < 100 && !dateMatch) {
        if (currentEdu) education.push(currentEdu);
        
        currentEdu = {
          institution: "Unknown",
          degree: line,
          fieldOfStudy: null,
          startDate: null,
          endDate: null,
          gpa: null
        };
      } else if (currentEdu && !currentEdu.institution) {
        currentEdu.institution = line;
      }
    }
    if (currentEdu) education.push(currentEdu);
    return education;
  }

  parseProjects(lines) {
    const projects = [];
    let currentProj = null;

    for (const line of lines) {
      // Very naive logic: short bold-like lines are project titles
      if (line.length > 3 && line.length < 50 && !line.includes('•') && !line.includes('-')) {
        if (currentProj) projects.push(currentProj);
        currentProj = {
          name: line,
          description: "",
          links: [],
          skills: []
        };
      } else if (currentProj) {
        currentProj.description += (currentProj.description ? ' ' : '') + line;
      }
    }
    if (currentProj) projects.push(currentProj);
    return projects;
  }

  normalizeDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.toLowerCase() === 'present' || dateStr.toLowerCase() === 'current') return 'Present';
    
    // Attempt to convert Jan 2020 -> 2020-01
    const parts = dateStr.replace(/,/g, '').trim().split(/\s+|\//);
    if (parts.length === 1 && parts[0].length === 4) {
      return `${parts[0]}-01`; // Default to Jan for year-only
    }
    if (parts.length === 2) {
      let month = parts[0];
      let year = parts[1];
      
      // Handle MM/YYYY
      if (parts[0].length <= 2 && !isNaN(parts[0])) {
         month = parts[0].padStart(2, '0');
      } else {
         const monthMap = { 'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12' };
         month = monthMap[month.substring(0, 3).toLowerCase()] || '01';
      }
      return `${year}-${month}`;
    }
    return dateStr;
  }

  extractSkillsWithEvidence(text, defaultSection = 'general') {
    const skillsFound = new Map(); // canonical -> SkillEvidence
    
    const sentences = text.split(/(?<=[.!?])(?=\s+)|\n/).map(s => s.trim()).filter(s => s.length > 5);

    // This needs a tech dictionary. I'll mock a small one for testing.
    const dictionary = ['react', 'node.js', 'javascript', 'python', 'java', 'sql', 'mongodb', 'docker', 'kubernetes', 'aws', 'typescript', 'express', 'css', 'html', 'git', 'c++', 'c#', 'angular', 'vue', 'react native', 'postgresql', 'postgres', 'pytorch'];

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      
      for (const skill of dictionary) {
        // Use custom boundaries so "java" doesn't match "javascript" and C++ still works
        const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escapedSkill}([^a-zA-Z0-9_]|$)`, 'i');
        if (regex.test(lowerSentence)) {
          // Normalize canonical
          const canonical = skill.replace('.js', '').replace(/\s+/g, '');
          
          if (!skillsFound.has(canonical)) {
            skillsFound.set(canonical, {
              canonical: canonical,
              original: skill,
              section: defaultSection,
              evidence: sentence,
              confidence: 0.95,
              evidenceType: 'explicit'
            });
          }
        }
      }
    }

    return Array.from(skillsFound.values());
  }
}

module.exports = new ResumeParserV2();
