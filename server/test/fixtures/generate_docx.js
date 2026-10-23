const fs = require('fs');
const JSZip = require('jszip');
const path = require('path');

async function createDocx() {
  const zip = new JSZip();

  // Create minimal valid DOCX structure
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  const resumeText = `John Doe
Email: john.doe@example.com
Phone: (555) 123-4567

SUMMARY
Experienced React Developer with 5 years of frontend expertise building scalable UI components.

SKILLS
React, JavaScript, TypeScript, Node.js, CSS, HTML

EXPERIENCE
Frontend Developer
Tech Corp, Inc.
January 2020 - Present
- Built responsive UI components using React.
- Improved rendering performance by 20%.

EDUCATION
B.S. Computer Science
University of Technology
2015 - 2019

PROJECTS
E-Commerce Dashboard
- Developed a dashboard using React and Redux.

CERTIFICATIONS
AWS Certified Developer
2021
`;

  // Escape special characters for XML (though simple text doesn't have much)
  const paragraphs = resumeText.split('\n').map(line => {
    return `<w:p><w:r><w:t>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p>`;
  }).join('');

  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
  </w:body>
</w:document>`);

  const content = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(__dirname, 'test_resume.docx');
  fs.writeFileSync(outputPath, content);
  console.log(`Generated DOCX at ${outputPath}`);
}

createDocx().catch(console.error);
