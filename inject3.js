const fs = require('fs');
let code = fs.readFileSync('server/services/analysisService.js', 'utf8');

code = code.replace('baselineData.metadata.v2Comparison =', 'let v2ComparisonData =');
code = code.replace(`    baselineData.metadata = {`, `    let md = {`);
code = code.replace(`      aiStatus: baselineData.aiStatus\n    };`, `      aiStatus: baselineData.aiStatus\n    };\n    if (typeof v2ComparisonData !== 'undefined') { md.v2Comparison = v2ComparisonData; }\n    baselineData.metadata = md;`);

fs.writeFileSync('server/services/analysisService.js', code);
console.log('Fixed metadata mapping');
