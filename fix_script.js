const fs = require('fs');
let text = fs.readFileSync('server/test/unit/matcherV2.test.js', 'utf8');
text = text.replace(/toBe\("normalized"\)/g, 'toBe("alias")');
// Wait, is case-insensitive test #2 ALSO broken now?
// Let's check test #2: exact match case insensitive?
fs.writeFileSync('server/test/unit/matcherV2.test.js', text);
