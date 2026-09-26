class CertificationAnalyzerV2 {
  analyze(resumeProfile, jdProfile) {
    const jdRequirements = this._parseJDCertifications(jdProfile);
    const resumeCertifications = resumeProfile.certifications || [];
    // If certifications is not an array (e.g. not parsed correctly), we will look in the raw text
    const resumeText = (resumeProfile.rawText || '').toLowerCase();

    const assessment = [];

    for (const req of jdRequirements) {
      let matched = false;
      let evidence = null;
      
      const reqLower = req.cert.toLowerCase();
      
      if (resumeCertifications.length > 0) {
        for (const cert of resumeCertifications) {
           const certText = (cert.name || cert.originalText || "").toLowerCase();
           if (certText.includes(reqLower)) {
             matched = true;
             evidence = cert.originalText || cert.name;
             break;
           }
        }
      } 
      
      // Fallback to searching the whole resume for the explicit certificate string
      if (!matched && resumeText.includes(reqLower)) {
         matched = true;
         // Extract a snippet as evidence
         const idx = resumeText.indexOf(reqLower);
         const start = Math.max(0, idx - 20);
         const end = Math.min(resumeText.length, idx + reqLower.length + 20);
         evidence = "... " + resumeText.substring(start, end).replace(/\\n/g, ' ') + " ...";
      }

      assessment.push({
        requirement: req.cert,
        status: matched ? "meets" : "missing",
        evidence: evidence
      });
    }

    return { jdRequirements, assessment };
  }

  _parseJDCertifications(jdProfile) {
    const reqs = [];
    const text = (jdProfile.rawText || '').toLowerCase();
    
    // Very deterministic, strict JD certification parser (just some popular tech ones)
    const knownCerts = [
      "aws certified",
      "aws cloud practitioner",
      "aws solutions architect",
      "pmp",
      "certified scrum master",
      "cissp",
      "azure fundamentals",
      "azure solutions architect",
      "google cloud certified",
      "ccna"
    ];
    
    for (const cert of knownCerts) {
      if (text.includes(cert)) {
        reqs.push({ cert: cert, classification: "preferred" });
      }
    }

    return reqs;
  }
}

module.exports = new CertificationAnalyzerV2();
