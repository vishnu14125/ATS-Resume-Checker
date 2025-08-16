function validateResumeStructure(resumeText) {
  const analysis = {
    sections: {},
    sectionScore: 0,
    issues: [],
    recommendations: [],
    extracted: {},
    readability: {},
    length: {}
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
    else analysis.recommendations.push(`Add a ${section.name} section`);
  });

  analysis.sectionScore = (foundSections / essentialSections.length) * 100;
  analysis.issues = checkATSCompatibility(resumeText);
  analysis.readability = checkReadability(resumeText);
  analysis.length = checkLength(resumeText);

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
    /\*\*.*?\*\*/g,
    /\*.*?\*/g,
    /_.*?_/g,
    /`.*?`/g
  ];

  formattingPatterns.forEach(pattern => {
    if (pattern.test(text)) {
      issues.push('Contains formatting that may not be preserved by ATS');
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

function checkReadability(text) {
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.trim().length > 0);

  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;

  return {
    sentenceCount: sentences.length,
    wordCount: words.length,
    avgSentenceLength,
    readability:
      avgSentenceLength > 25 ? "Hard to read" :
      avgSentenceLength < 12 ? "Too simple" :
      "Good readability"
  };
}

function checkLength(text) {
  const words = text.split(/\s+/).filter(w => w.trim().length > 0);
  const pages = Math.ceil(words.length / 400);

  let status;
  if (pages > 2) status = "Too long – keep it under 2 pages";
  else if (pages < 1) status = "Too short – expand with more details";
  else status = "Good length";

  return {
    wordCount: words.length,
    estimatedPages: pages,
    lengthStatus: status
  };
}

module.exports = {
  validateResumeStructure
};
