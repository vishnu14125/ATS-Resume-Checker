 
function validateResumeStructure(resumeText) {
  const analysis = {
    sections: {},
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

  return analysis;
}

function checkSection(text, patterns) {
  const lowerText = text.toLowerCase();
  return patterns.some(pattern => lowerText.includes(pattern));
}

module.exports = {
  validateResumeStructure
};
