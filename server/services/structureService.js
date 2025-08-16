function validateResumeStructure(resumeText) {
  const analysis = {
    sections: {},
    issues: [],
    recommendations: [],
    score: 0,
    sectionScore: 0
  };

  const essentialSections = [
    { name: 'contact', patterns: ['contact', 'email', 'phone', 'address'] },
    { name: 'summary', patterns: ['summary', 'objective', 'profile', 'about'] },
    { name: 'experience', patterns: ['experience', 'work history', 'employment', 'career'] },
    { name: 'education', patterns: ['education', 'academic', 'degree', 'university', 'college'] },
    { name: 'skills', patterns: ['skills', 'competencies', 'technologies', 'tools'] }
  ];

  let foundSections = 0;
  essentialSections.forEach(section => {
    const found = checkSection(resumeText, section.patterns);
    analysis.sections[section.name] = found;
    if (found) foundSections++;
  });

  analysis.sectionScore = (foundSections / essentialSections.length) * 100;

  const atsIssues = checkATSCompatibility(resumeText);
  analysis.issues = [...atsIssues];

  analysis.recommendations = generateRecommendations(analysis.sections, atsIssues);

  analysis.score = calculateStructureScore(analysis.sectionScore, atsIssues.length);

  return analysis;
}

function checkSection(text, patterns) {
  const lowerText = text.toLowerCase();
  return patterns.some(pattern => lowerText.includes(pattern));
}

function checkATSCompatibility(text) {
  const issues = [];

  if (text.includes('image') || text.includes('graphic') || text.includes('photo')) {
    issues.push('Contains images or graphics that may not be parsed by ATS');
  }

  if (text.includes('table') || text.includes('grid')) {
    issues.push('Contains tables that may not be parsed correctly by ATS');
  }

  const formattingPatterns = [
    /\\.?\\*/g,
    /\.?\*/g,
    /.*?/g,
    /.*?/g
  ];

  formattingPatterns.forEach(pattern => {
    if (pattern.test(text)) {
      issues.push('Contains formatting that may not be preserved by ATS');
      return;
    }
  });

  if (text.includes('header') || text.includes('footer')) {
    issues.push('Contains headers or footers that may interfere with ATS parsing');
  }

  if (/\bpage\s+\d+\b/i.test(text)) {
    issues.push('Contains page numbers that may interfere with ATS parsing');
  }

  if (/\n\s*\n\s*\n/.test(text)) {
    issues.push('Contains excessive line breaks that may affect ATS parsing');
  }

  const specialChars = /[^\w\s\.\,\;\:\!\?\-\(\)\[\]\{\}\@\#\$\%\&\+\=\/]/g;
  const matches = text.match(specialChars);
  if (matches && matches.length > text.length * 0.1) {
    issues.push('Contains excessive special characters that may affect ATS parsing');
  }

  if (text.includes('font') || text.includes('size') || text.includes('pt')) {
    issues.push('Contains font specifications that may not be preserved by ATS');
  }

  return issues;
}

function generateRecommendations(sections, issues) {
  const recommendations = [];

  if (!sections.contact) {
    recommendations.push('Add a clear contact information section with email and phone number');
  }

  if (!sections.summary) {
    recommendations.push('Include a professional summary or objective statement');
  }

  if (!sections.experience) {
    recommendations.push('Add a detailed work experience section with quantifiable achievements');
  }

  if (!sections.education) {
    recommendations.push('Include your educational background and relevant certifications');
  }

  if (!sections.skills) {
    recommendations.push('Add a skills section highlighting relevant technical and soft skills');
  }

  if (issues.length > 0) {
    recommendations.push('Use simple, clean formatting without images, tables, or excessive styling');
    recommendations.push('Avoid headers, footers, and page numbers');
    recommendations.push('Use standard fonts and avoid special formatting characters');
  }

  recommendations.push('Use bullet points for better readability');
  recommendations.push('Include quantifiable achievements (e.g., "Increased sales by 25%")');
  recommendations.push('Use action verbs to start bullet points');
  recommendations.push('Keep the resume to 1-2 pages maximum');

  return recommendations.slice(0, 8);
}

function calculateStructureScore(sectionScore, issueCount) {
  let score = sectionScore;
  const issuePenalty = issueCount * 10;
  score = Math.max(0, score - issuePenalty);
  if (sectionScore >= 80 && issueCount === 0) {
    score = Math.min(100, score + 10);
  }
  return Math.round(score);
}

function extractSectionContent(text, sectionName) {
  const sectionPatterns = {
    contact: /(?:contact|email|phone|address)[:\s]*([^\n]+)/gi,
    summary: /(?:summary|objective|profile|about)[:\s]*([^\n]+)/gi,
    experience: /(?:experience|work history|employment)[:\s]*([^\n]+)/gi,
    education: /(?:education|academic|degree)[:\s]*([^\n]+)/gi,
    skills: /(?:skills|competencies|technologies)[:\s]*([^\n]+)/gi
  };

  const pattern = sectionPatterns[sectionName];
  if (!pattern) return null;

  const matches = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matches.push(match[1].trim());
  }

  return matches.length > 0 ? matches : null;
}

function checkActionVerbs(text) {
  const actionVerbs = [
    'managed', 'developed', 'created', 'implemented', 'designed',
    'led', 'coordinated', 'analyzed', 'improved', 'optimized',
    'increased', 'decreased', 'reduced', 'enhanced', 'streamlined',
    'facilitated', 'delivered', 'achieved', 'exceeded', 'maintained'
  ];

  const foundVerbs = actionVerbs.filter(verb => 
    text.toLowerCase().includes(verb)
  );

  return {
    found: foundVerbs,
    count: foundVerbs.length,
    score: Math.min(100, (foundVerbs.length / 10) * 100)
  };
}

function checkQuantifiableAchievements(text) {
  const patterns = [
    /\d+%/g,
    /\$\d+[,\d]*/g,
    /\d+\s*(?:people|employees|team members)/gi,
    /\d+\s*(?:years|months)/gi,
    /increased\s+by\s+\d+/gi,
    /decreased\s+by\s+\d+/gi,
    /reduced\s+by\s+\d+/gi
  ];

  const matches = [];
  patterns.forEach(pattern => {
    const found = text.match(pattern);
    if (found) matches.push(...found);
  });

  return {
    found: matches,
    count: matches.length,
    score: Math.min(100, (matches.length / 5) * 100)
  };
}

module.exports = {
  validateResumeStructure,
  extractSectionContent,
  checkActionVerbs,
  checkQuantifiableAchievements
};
