const fs = require('fs');
let code = fs.readFileSync('server/test/integration/v2ProductionAdapter.test.js', 'utf8');

code = code.replace(/resumeText: 'Senior Python Engineer\. Worked on Django\.',/g, "resumeText: 'Senior Python Engineer. Worked on Django. This padding ensures length > 50 chars.',");
code = code.replace(/jobDescription: 'Required: Python, Django\.',/g, "jobDescription: 'Required: Python, Django. This padding ensures length > 50 chars.',");
code = code.replace(/resumeText: 'Java Developer\. Used Spring Boot\.',/g, "resumeText: 'Java Developer. Used Spring Boot. This padding ensures length > 50 chars.',");
code = code.replace(/jobDescription: 'Java and Spring Boot developer required\.',/g, "jobDescription: 'Java and Spring Boot developer required. This padding ensures length > 50 chars.',");
code = code.replace(/resumeText: 'a',/g, "resumeText: 'a'.repeat(60),");
code = code.replace(/jobDescription: 'b',/g, "jobDescription: 'b'.repeat(60),");

fs.writeFileSync('server/test/integration/v2ProductionAdapter.test.js', code);
console.log('Fixed lengths');
