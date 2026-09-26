class ParseabilityAnalyzerV2 {
  constructor() {
    this.weights = {
      textExtraction: 25,
      sectionDetection: 15,
      contactExtraction: 20,
      experienceExtraction: 20,
      educationExtraction: 10,
      skillsExtraction: 10,
      projectExtraction: 0, // projects and structure handled dynamically
      structureQuality: 0
    };
  }

  analyze(rawText = '', resumeProfile = {}, documentMetadata = {}) {
    const components = {
      textExtraction: this._analyzeTextExtraction(rawText),
      sectionDetection: this._analyzeSectionDetection(resumeProfile),
      contactExtraction: this._analyzeContactExtraction(resumeProfile.contact),
      experienceExtraction: this._analyzeExperienceExtraction(resumeProfile.experience),
      educationExtraction: this._analyzeEducationExtraction(resumeProfile.education),
      skillsExtraction: this._analyzeSkillsExtraction(resumeProfile.skills),
      projectExtraction: this._analyzeProjectExtraction(resumeProfile.projects),
      structureQuality: this._analyzeStructureQuality(resumeProfile)
    };

    const warnings = this._gatherWarnings(components);

    let earned = 0;
    let max = 0;

    const applicableWeights = {
      textExtraction: 25,
      contactExtraction: 20,
      experienceExtraction: 20,
      skillsExtraction: 15,
      educationExtraction: 10,
      sectionDetection: 10
    };

    for (const [key, weight] of Object.entries(applicableWeights)) {
      const comp = components[key];
      if (comp.status !== 'not_applicable') {
        earned += (comp.score / 100) * weight;
        max += weight;
      }
    }
    
    // Optional components that only add or neutral
    if (components.projectExtraction.status !== 'not_applicable') {
      earned += (components.projectExtraction.score / 100) * 5;
      max += 5;
    }

    if (components.structureQuality.status !== 'not_applicable') {
      earned += (components.structureQuality.score / 100) * 5;
      max += 5;
    }

    let finalScore = max > 0 ? Math.round((earned / max) * 100) : 0;
    
    // Hard fail condition
    if (components.textExtraction.status === 'fatal') {
      finalScore = 0;
    }

    let overallStatus = 'good';
    if (finalScore === 0) overallStatus = 'fatal';
    else if (finalScore < 50) overallStatus = 'poor';
    else if (finalScore < 80) overallStatus = 'average';

    return {
      score: finalScore,
      status: overallStatus,
      components,
      warnings,
      capabilities: {
        visualLayoutAnalysis: "not_available",
        ocrAnalysis: "not_available",
        columnAnalysis: "not_available"
      },
      documentFormat: documentMetadata.format || "unknown",
      limitations: [
        "Cannot verify visual layout fidelity",
        "Does not assess OCR quality or bounding boxes",
        "Text order may not match visual reading order"
      ]
    };
  }

  _analyzeTextExtraction(rawText) {
    if (!rawText || rawText.trim().length === 0) {
      return { score: 0, status: 'fatal', evidence: ['No text extracted from document'] };
    }

    const length = rawText.trim().length;
    if (length < 100) {
      return { score: 10, status: 'fatal', evidence: [`Extracted text is exceptionally short (${length} chars)`] };
    }

    const wordCount = rawText.trim().split(/\s+/).length;
    let score = 100;
    const evidence = [`Extracted ${length} characters, ~${wordCount} words`];
    let status = 'good';

    // Noise checks
    const nonAsciiCount = (rawText.match(/[^\x00-\x7F]/g) || []).length;
    const noiseRatio = nonAsciiCount / length;

    if (noiseRatio > 0.2) {
      score -= 40;
      evidence.push('High concentration of non-standard characters (possible OCR corruption)');
    }

    if (length < 500) {
      score -= 20;
      evidence.push('Text length is below typical resume size');
    }

    if (score < 50) status = 'poor';
    else if (score < 80) status = 'average';

    return { score, status, evidence };
  }

  _analyzeSectionDetection(resumeProfile) {
    const expected = ['contact', 'experience', 'education', 'skills'];
    const detected = [];
    if (resumeProfile.contact && Object.keys(resumeProfile.contact).length > 0) detected.push('contact');
    if (resumeProfile.experience && resumeProfile.experience.length > 0) detected.push('experience');
    if (resumeProfile.education && resumeProfile.education.length > 0) detected.push('education');
    if (resumeProfile.skills && resumeProfile.skills.length > 0) detected.push('skills');
    if (resumeProfile.projects && resumeProfile.projects.length > 0) detected.push('projects');
    if (resumeProfile.certifications && resumeProfile.certifications.length > 0) detected.push('certifications');
    if (resumeProfile.summary) detected.push('summary');

    const coreDetected = expected.filter(s => detected.includes(s));
    const score = Math.round((coreDetected.length / expected.length) * 100);
    
    let status = 'good';
    if (score < 50) status = 'poor';
    else if (score < 100) status = 'average';

    return {
      score,
      status,
      evidence: [`Detected ${detected.length} distinct sections`, `Core sections: ${coreDetected.join(', ')}`]
    };
  }

  _analyzeContactExtraction(contact = {}) {
    let score = 0;
    const evidence = [];

    if (contact.email) {
      score += 70;
      evidence.push('Email successfully extracted');
    } else {
      evidence.push('No email address extracted');
    }

    if (contact.phone) {
      score += 30;
      evidence.push('Phone number extracted');
    } else {
      evidence.push('No phone number extracted (optional)');
    }

    if (contact.location) {
      evidence.push('Location extracted');
    }

    let status = 'good';
    if (score === 0) status = 'poor';
    else if (score < 100) status = 'average';

    return { score, status, evidence };
  }

  _analyzeExperienceExtraction(experience = []) {
    if (!experience || experience.length === 0) {
      return { score: 0, status: 'poor', evidence: ['No experience entries detected'] };
    }

    let points = 100;
    let missingDates = 0;
    let missingTitles = 0;

    for (const exp of experience) {
      if (!exp.dates && !exp.startDate && !exp.endDate) missingDates++;
      if (!exp.title) missingTitles++;
    }

    if (missingDates > 0) {
      points -= Math.min(40, (missingDates / experience.length) * 40);
    }
    if (missingTitles > 0) {
      points -= Math.min(30, (missingTitles / experience.length) * 30);
    }

    points = Math.round(Math.max(0, points));

    const evidence = [`Extracted ${experience.length} experience entries`];
    if (missingDates > 0) evidence.push(`${missingDates} entries missing parsable dates`);
    if (missingTitles > 0) evidence.push(`${missingTitles} entries missing explicit titles`);

    let status = 'good';
    if (points < 50) status = 'poor';
    else if (points < 90) status = 'average';

    return { score: points, status, evidence };
  }

  _analyzeEducationExtraction(education = []) {
    if (!education || education.length === 0) {
      return { score: 100, status: 'not_applicable', evidence: ['No education detected (optional for parseability)'] };
    }

    const evidence = [`Extracted ${education.length} education entries`];
    let missingDegrees = 0;
    
    for (const edu of education) {
      if (!edu.degree && !edu.originalText) missingDegrees++;
    }

    let points = 100;
    if (missingDegrees > 0) {
      points -= Math.min(50, (missingDegrees / education.length) * 50);
      evidence.push(`${missingDegrees} entries missing readable text/degree`);
    }

    return { score: Math.round(points), status: points === 100 ? 'good' : 'average', evidence };
  }

  _analyzeSkillsExtraction(skills = []) {
    if (!skills || skills.length === 0) {
      return { score: 0, status: 'poor', evidence: ['No explicit skills section or tokens detected'] };
    }

    return { 
      score: 100, 
      status: 'good', 
      evidence: [`Extracted ${skills.length} explicit skill tokens`]
    };
  }

  _analyzeProjectExtraction(projects = []) {
    if (!projects || projects.length === 0) {
      return { score: 100, status: 'not_applicable', evidence: ['No projects detected (optional)'] };
    }

    return {
      score: 100,
      status: 'good',
      evidence: [`Extracted ${projects.length} project entries`]
    };
  }

  _analyzeStructureQuality(resumeProfile) {
    return {
      score: 100,
      status: 'not_applicable',
      evidence: ['Structural coherence analysis limited to explicit text tokens']
    };
  }

  _gatherWarnings(components) {
    const warnings = [];

    if (components.textExtraction.status === 'fatal') {
      warnings.push({
        code: 'FATAL_TEXT_EXTRACTION',
        severity: 'fatal',
        message: 'Unable to extract meaningful text from the document.',
        evidence: components.textExtraction.evidence[0]
      });
    } else if (components.textExtraction.status !== 'good') {
      warnings.push({
        code: 'EXTRACTION_NOISE',
        severity: 'warning',
        message: 'Text extraction quality is suboptimal.',
        evidence: components.textExtraction.evidence.join(' | ')
      });
    }

    if (components.contactExtraction.score < 50) {
      warnings.push({
        code: 'MISSING_EMAIL',
        severity: 'warning',
        message: 'No email address could be found.',
        evidence: 'Contact section is missing email'
      });
    }

    if (components.experienceExtraction.status === 'poor') {
      warnings.push({
        code: 'WEAK_EXPERIENCE_DETECTION',
        severity: 'warning',
        message: 'Experience section could not be reliably extracted.',
        evidence: components.experienceExtraction.evidence[0]
      });
    }

    return warnings;
  }
}

module.exports = new ParseabilityAnalyzerV2();
