const fs = require('fs');
let c = fs.readFileSync('server/services/parseability/ParseabilityAnalyzerV2.js', 'utf8');

c = c.replace(/split\(\/\\\\s\+\/\)/g, 'split(/\\s+/)');
c = c.replace(/match\(\/\[\^\\\\x00-\\\\x7F\]\/g\)/g, 'match(/[^\\x00-\\x7F]/g)');

fs.writeFileSync('server/services/parseability/ParseabilityAnalyzerV2.js', c);
