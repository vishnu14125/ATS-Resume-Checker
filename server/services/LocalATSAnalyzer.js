class LocalATSAnalyzer {
  constructor() {
    this.techKeywords = new Set([
      'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'php',
      'react', 'angular', 'vue', 'svelte', 'next.js', 'nuxt.js', 'express', 'django', 'flask', 'spring', 'asp.net', 'laravel',
      'node.js', 'nodejs', 'react.js', 'reactjs', 'vue.js', 'vuejs', 'angularjs',
      'html', 'css', 'sass', 'less', 'tailwind', 'bootstrap', 'material-ui',
      'mysql', 'postgresql', 'mongodb', 'sqlite', 'redis', 'cassandra', 'dynamodb', 'elasticsearch', 'firebase', 'supabase',
      'aws', 'gcp', 'azure', 'heroku', 'digitalocean', 'vercel', 'netlify',
      'docker', 'kubernetes', 'jenkins', 'github actions', 'gitlab ci', 'circleci', 'travis ci', 'terraform', 'ansible',
      'git', 'svn', 'mercurial', 'bitbucket', 'jira', 'confluence', 'trello', 'asana',
      'machine learning', 'deep learning', 'nlp', 'computer vision', 'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
      'agile', 'scrum', 'kanban', 'waterfall', 'tdd', 'bdd', 'ci/cd', 'devops', 'microservices', 'serverless', 'rest', 'graphql',
      'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator', 'invision', 'zeplin',
      'sql', 'nosql', 'graphql', 'rest api', 'soap', 'grpc', 'websocket', 'webrtc',
      'linux', 'unix', 'windows', 'macos', 'bash', 'shell', 'powershell',
      'kafka', 'rabbitmq', 'activemq', 'celery', 'redis', 'memcached',
      'jest', 'mocha', 'chai', 'jasmine', 'karma', 'cypress', 'selenium', 'puppeteer', 'playwright',
      'webpack', 'rollup', 'parcel', 'vite', 'babel', 'eslint', 'prettier',
      'kubernetes', 'docker swarm', 'mesos', 'nomad',
      'prometheus', 'grafana', 'datadog', 'new relic', 'splunk', 'elk stack',
      'oauth', 'jwt', 'saml', 'openid', 'auth0', 'okta', 'cognito'
    ]);

    this.softSkills = new Set([
      'communication', 'leadership', 'teamwork', 'problem solving', 'critical thinking', 'time management', 'adaptability', 'flexibility',
      'creativity', 'innovation', 'emotional intelligence', 'conflict resolution', 'decision making', 'attention to detail', 'organization',
      'presentation', 'public speaking', 'negotiation', 'persuasion', 'collaboration', 'empathy', 'active listening', 'mentoring', 'coaching'
    ]);
    
    this.actionVerbs = new Set([
      'developed', 'designed', 'implemented', 'managed', 'led', 'created', 'built', 'architected', 'optimized', 'improved',
      'increased', 'reduced', 'saved', 'delivered', 'launched', 'spearheaded', 'directed', 'coordinated', 'engineered', 'resolved',
      'transformed', 'streamlined', 'modernized', 'automated', 'integrated', 'orchestrated', 'facilitated', 'negotiated', 'mentored',
      'analyzed', 'evaluated', 'researched', 'identified', 'discovered', 'formulated', 'strategized', 'executed', 'achieved'
    ]);
  }

  parseResume(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    // Basic Section Detection
    const sections = {
      contact: [],
      summary: [],
      skills: [],
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      achievements: [],
      other: []
    };

    let currentSection = 'other';
    
    // Regex for typical resume headers
    const headers = {
      summary: /^(summary|profile|objective|about me)$/i,
      skills: /^(skills|technologies|technical skills|core competencies|expertise)$/i,
      experience: /^(experience|work experience|employment history|professional experience)$/i,
      education: /^(education|academic background|qualifications)$/i,
      projects: /^(projects|personal projects|academic projects)$/i,
      certifications: /^(certifications|licenses|courses)$/i,
      achievements: /^(achievements|awards|honors|publications)$/i
    };

    for (const line of lines) {
      let matchedHeader = false;
      if (line.length < 50) { // Headers are usually short
        for (const [section, regex] of Object.entries(headers)) {
          if (regex.test(line)) {
            currentSection = section;
            matchedHeader = true;
            break;
          }
        }
      }
      
      if (!matchedHeader) {
        // Simple contact detection (email/phone at the very top)
        if (currentSection === 'other' && sections.other.length < 10) {
          if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(line) || /[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]/.test(line)) {
            sections.contact.push(line);
            continue;
          }
        }
        sections[currentSection].push(line);
      }
    }

    // Extract skills from everywhere
    const allSkills = this.extractKeywords(text.toLowerCase());
    
    // Build Structured Resume
    return {
      contact: {
        email: this.extractRegex(sections.contact.join(' '), /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/),
        phone: this.extractRegex(sections.contact.join(' '), /[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]/),
        location: null,
        linkedin: this.extractRegex(sections.contact.join(' '), /linkedin\.com\/in\/[a-zA-Z0-9_-]+/),
        github: this.extractRegex(sections.contact.join(' '), /github\.com\/[a-zA-Z0-9_-]+/),
        website: null
      },
      summary: sections.summary.join('\n') || null,
      skills: allSkills.skills,
      experience: this.parseExperience(sections.experience),
      education: this.parseEducation(sections.education),
      projects: this.parseProjects(sections.projects),
      certifications: sections.certifications,
      achievements: sections.achievements,
      _metrics: {
        length: text.length,
        hasSummary: sections.summary.length > 0,
        hasSkills: sections.skills.length > 0,
        hasExperience: sections.experience.length > 0,
        hasEducation: sections.education.length > 0
      }
    };
  }

  parseJobDescription(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const keywords = this.extractKeywords(text.toLowerCase());
    
    // Attempt to split into required vs preferred (heuristics)
    const requiredSkills = [];
    const preferredSkills = [];
    
    const lowerText = text.toLowerCase();
    
    keywords.skills.forEach(skill => {
      // Very basic proximity heuristic
      const skillIndex = lowerText.indexOf(skill);
      const reqIndex = Math.max(lowerText.lastIndexOf('require', skillIndex), lowerText.lastIndexOf('must', skillIndex));
      const prefIndex = Math.max(lowerText.lastIndexOf('prefer', skillIndex), lowerText.lastIndexOf('bonus', skillIndex), lowerText.lastIndexOf('plus', skillIndex));
      
      if (prefIndex > reqIndex && skillIndex - prefIndex < 200) {
        preferredSkills.push(skill);
      } else {
        requiredSkills.push(skill);
      }
    });

    return {
      roleTitle: lines[0] && lines[0].length < 100 ? lines[0] : "Target Role",
      domain: null,
      seniority: /senior|lead|staff|principal|manager|director/i.test(text) ? "Senior" : "Mid/Junior",
      required: {
        skills: keywords.softSkills.slice(0, 5),
        technologies: requiredSkills,
        experience: this.extractRegex(lowerText, /[0-9]+\+?\s*(?:to\s*[0-9]+)?\s*years/i),
        education: /bachelor|master|phd|degree/i.test(lowerText) ? this.extractRegex(lowerText, /(?:bachelor|master|phd|degree)[^.]*/i) : null,
        certifications: []
      },
      preferred: {
        skills: [],
        technologies: preferredSkills,
        experience: null
      },
      responsibilities: [],
      softSkills: keywords.softSkills
    };
  }

  extractKeywords(text) {
    const words = text.replace(/[^\w\s\-\.\+]/g, ' ').split(/\s+/);
    const foundSkills = new Set();
    const foundSoft = new Set();
    
    // Check individual words and bigrams
    for (let i = 0; i < words.length; i++) {
      const unigram = words[i];
      const bigram = i < words.length - 1 ? `${words[i]} ${words[i+1]}` : null;
      
      if (this.techKeywords.has(unigram)) foundSkills.add(unigram);
      if (bigram && this.techKeywords.has(bigram)) foundSkills.add(bigram);
      
      if (this.softSkills.has(unigram)) foundSoft.add(unigram);
      if (bigram && this.softSkills.has(bigram)) foundSoft.add(bigram);
    }
    
    return {
      skills: Array.from(foundSkills),
      softSkills: Array.from(foundSoft)
    };
  }

  extractRegex(text, regex) {
    const match = text.match(regex);
    return match ? match[0] : null;
  }

  parseExperience(lines) {
    if (lines.length === 0) return [];
    // Just create one large block if we can't properly segment, or chunk by dates
    const chunk = lines.join('\n');
    return [{
      company: "Experience Section",
      role: null,
      startDate: null,
      endDate: null,
      description: chunk.substring(0, 500) + (chunk.length > 500 ? '...' : ''),
      technologies: this.extractKeywords(chunk.toLowerCase()).skills,
      achievements: []
    }];
  }

  parseEducation(lines) {
    if (lines.length === 0) return [];
    return [{
      institution: lines[0].substring(0, 100),
      degree: lines.join(' ').substring(0, 100),
      fieldOfStudy: null,
      startDate: null,
      endDate: null,
      gpa: null
    }];
  }

  parseProjects(lines) {
    if (lines.length === 0) return [];
    const chunk = lines.join('\n');
    return [{
      name: "Portfolio Projects",
      description: chunk.substring(0, 300),
      technologies: this.extractKeywords(chunk.toLowerCase()).skills,
      achievements: [],
      links: []
    }];
  }

  generateLocalRecommendations(structuredResume, missingSkills) {
    const recommendations = [];
    
    if (!structuredResume._metrics.hasSummary) {
      recommendations.push({
        category: 'STRUCTURE',
        severity: 'MEDIUM',
        title: 'Add a Professional Summary',
        explanation: 'A summary highlights your top value proposition immediately.',
        evidence: { jobDescription: null, resume: null },
        action: 'Write a 2-3 sentence summary at the top of your resume.'
      });
    }

    if (missingSkills.length > 0) {
      const topMissing = missingSkills.slice(0, 3).map(s => typeof s === 'string' ? s : s.skill).join(', ');
      recommendations.push({
        category: 'SKILL_GAP',
        severity: 'HIGH',
        title: 'Missing Required Skills',
        explanation: 'ATS systems strictly filter candidates lacking core job requirements.',
        evidence: { jobDescription: topMissing, resume: null },
        action: `If you have experience with ${topMissing}, add them explicitly to your Skills and Experience sections.`
      });
    }

    // Action verb check
    let weakVerbs = 0;
    const expText = structuredResume.experience.map(e => e.description).join(' ').toLowerCase();
    const weakVerbsList = ['helped', 'worked on', 'responsible for', 'assisted'];
    weakVerbsList.forEach(wv => {
      if (expText.includes(wv)) weakVerbs++;
    });

    if (weakVerbs > 0) {
      recommendations.push({
        category: 'EXPERIENCE',
        severity: 'MEDIUM',
        title: 'Use Strong Action Verbs',
        explanation: 'Phrases like "worked on" or "responsible for" do not show impact.',
        evidence: { jobDescription: null, resume: 'Found weak verbs in experience' },
        action: 'Replace weak verbs with strong action words like "Architected", "Spearheaded", or "Optimized".'
      });
    }

    // Check for metrics
    if (!/[0-9]+%|[0-9]+x|\$[0-9]+/i.test(expText)) {
      recommendations.push({
        category: 'EXPERIENCE',
        severity: 'HIGH',
        title: 'Quantify Your Achievements',
        explanation: 'Lack of metrics makes it hard for recruiters to gauge your impact.',
        evidence: { jobDescription: null, resume: null },
        action: 'Add numbers, percentages, or dollar amounts to demonstrate scale (e.g. "improved performance by 20%").'
      });
    }

    return recommendations;
  }

  detectLocalIssues(structuredResume) {
    const issues = [];
    if (structuredResume._metrics.length < 500) {
      issues.push({
        type: 'Content',
        issue: 'Resume is very short and lacks detail.',
        severity: 'HIGH',
        context: 'Overall length'
      });
    }
    return issues;
  }
}

module.exports = new LocalATSAnalyzer();
