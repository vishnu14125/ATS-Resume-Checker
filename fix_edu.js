const fs = require('fs');
let c = fs.readFileSync('server/services/intelligence/EducationAnalyzerV2.js', 'utf8');

c = c.replace(
  'hasDegree = aliases.some(alias => text.includes(alias.toLowerCase()));',
  `hasDegree = aliases.some(alias => {
    const escaped = alias.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    return new RegExp('(^|\\\\W)' + escaped + '(\\\\W|$)', 'i').test(text);
  });`
);

c = c.replace(
  'hasDegree = text.includes(req.degree.toLowerCase());',
  `const escaped = req.degree.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
   hasDegree = new RegExp('(^|\\\\W)' + escaped + '(\\\\W|$)', 'i').test(text);`
);

fs.writeFileSync('server/services/intelligence/EducationAnalyzerV2.js', c);
