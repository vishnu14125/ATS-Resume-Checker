class ScoringEngineV2 {
  constructor() {
    this.categoryWeights = {
      requiredSkills: 0.50,
      preferredSkills: 0.10,
      experience: 0.20,
      educationCertifications: 0.10,
      projectsAchievements: 0.10
    };

    this.matchQualityMultipliers = {
      exact: 1.00,
      normalized: 0.95,
      alias: 0.90,
      missing: 0.00
    };

    this.evidenceStrengthMultipliers = {
      experience: 1.00,
      project: 0.85,
      certifications: 0.80,
      education: 0.70,
      skills: 0.50,
      summary: 0.50,
      general: 0.40
    };
  }

  score(matches, intelligence = null) {
    if (!matches || !Array.isArray(matches)) {
      throw new Error("Invalid matches array provided to ScoringEngineV2");
    }

    const required = matches.filter(m => m.requirementClassification === 'required' || m.requirementClassification === 'knockout');
    const preferred = matches.filter(m => m.requirementClassification === 'preferred' || m.requirementClassification === 'nice_to_have');

    const reqScore = this._calculateSkillsScore(required, this.categoryWeights.requiredSkills * 100);
    const prefScore = this._calculateSkillsScore(preferred, this.categoryWeights.preferredSkills * 100);

    const knockoutCandidates = required.filter(m => m.matchType === 'missing').map(m => m.requirementCanonical);

    let expScore = { status: "pending_evidence", contribution: 0 };
    let eduCertScore = { status: "pending_evidence", contribution: 0 };
    let projScore = { status: "pending_evidence", contribution: 0 };

    if (intelligence) {
      expScore = this._calculateExperienceScore(intelligence.experienceAssessment, required, this.categoryWeights.experience * 100);
      projScore = this._calculateProjectScore(intelligence.projectEvidence, required, this.categoryWeights.projectsAchievements * 100);
      eduCertScore = this._calculateEduCertScore(intelligence.educationAssessment, intelligence.certificationAssessment, this.categoryWeights.educationCertifications * 100);
    }

    const overallScore = Number((reqScore.contribution + prefScore.contribution + expScore.contribution + projScore.contribution + eduCertScore.contribution).toFixed(2));

    return {
      overallScore,
      scoringVersion: "2.1.0",
      components: {
        requiredSkills: reqScore,
        preferredSkills: prefScore,
        experience: expScore,
        educationCertifications: eduCertScore,
        projectsAchievements: projScore
      },
      matchedRequirements: required.filter(m => m.matchType !== 'missing').length + preferred.filter(m => m.matchType !== 'missing').length,
      missingRequirements: required.filter(m => m.matchType === 'missing').length + preferred.filter(m => m.matchType === 'missing').length,
      parseability: {
        score: null,
        status: "not_implemented"
      },
      knockoutCandidates,
      limitations: []
    };
  }

  _calculateSkillsScore(matchesGroup, maxPoints) {
    if (!matchesGroup || matchesGroup.length === 0) {
      return { weight: maxPoints, matched: 0, total: 0, coverage: 0, contribution: 0, details: [] };
    }
    const pointsPerSkill = maxPoints / matchesGroup.length;
    let totalContribution = 0;
    const details = [];
    let matchedCount = 0;

    for (const match of matchesGroup) {
      if (match.matchType === 'missing') {
        details.push({
          component: "requiredSkills",
          requirement: match.requirementCanonical,
          points: 0,
          evidenceIds: [],
          matchType: 'missing',
          evidenceStrength: 'none'
        });
        continue;
      }
      matchedCount++;
      const qualityMult = this.matchQualityMultipliers[match.matchType] || 0;
      const section = match.resumeSection || 'general';
      const strengthMult = this.evidenceStrengthMultipliers[section] || this.evidenceStrengthMultipliers['general'];

      const points = pointsPerSkill * qualityMult * strengthMult;
      totalContribution += points;
      details.push({
        component: "requiredSkills",
        requirement: match.requirementCanonical,
        points: Number(points.toFixed(2)),
        evidenceIds: match.sourceId ? [match.sourceId] : [],
        matchType: match.matchType,
        evidenceStrength: section,
        qualityMultiplier: qualityMult,
        strengthMultiplier: strengthMult
      });
    }
    return { weight: maxPoints, matched: matchedCount, total: matchesGroup.length, coverage: Number((matchedCount / matchesGroup.length).toFixed(2)), contribution: Number(totalContribution.toFixed(2)), details };
  }

  _calculateExperienceScore(assessment, requiredMatches, maxPoints) {
    if (!assessment) return { status: "pending_evidence", contribution: 0 };
    
    if (assessment.length > 0) {
      let totalFraction = 0;
      const details = [];
      for (const req of assessment) {
        let frac = req.demonstratedMonths / req.requiredMonths;
        if (frac > 1.0) frac = 1.0;
        totalFraction += frac;
        details.push({
          component: "experience",
          requirement: req.canonicalSkill,
          points: Number((frac * (maxPoints / assessment.length)).toFixed(2)),
          evidenceIds: req.evidenceIds || [],
          matchType: "exact",
          evidenceStrength: "experience"
        });
      }
      const coverage = totalFraction / assessment.length;
      return { status: "assessed", coverage: Number(coverage.toFixed(2)), contribution: Number((coverage * maxPoints).toFixed(2)), details };
    }
    
    if (!requiredMatches || requiredMatches.length === 0) {
      return { status: "no_requirements", contribution: maxPoints, details: [] };
    }
    
    const expMatched = requiredMatches.filter(m => m.resumeSection === 'experience' && m.matchType !== 'missing');
    const coverage = expMatched.length / requiredMatches.length;
    const details = expMatched.map(m => ({
       component: "experience",
       requirement: m.requirementCanonical,
       points: Number(((1 / requiredMatches.length) * maxPoints).toFixed(2)),
       evidenceIds: m.sourceId ? [m.sourceId] : [],
       matchType: m.matchType,
       evidenceStrength: "experience"
    }));
    return { status: "assessed_via_skills", coverage: Number(coverage.toFixed(2)), contribution: Number((coverage * maxPoints).toFixed(2)), details };
  }

  _calculateProjectScore(projectEvidence, requiredMatches, maxPoints) {
    if (!projectEvidence) return { status: "pending_evidence", contribution: 0 };
    
    if (!requiredMatches || requiredMatches.length === 0) {
      return { status: "no_requirements", contribution: maxPoints }; 
    }
    
    const requiredCanons = requiredMatches.map(m => m.requirementCanonical);
    let matchedInProj = new Set();
    const details = [];
    
    for (const proj of projectEvidence) {
      for (const skill of proj.relevantSkills) {
        if (requiredCanons.includes(skill)) {
           if (!matchedInProj.has(skill)) {
             matchedInProj.add(skill);
             details.push({
               component: "projectsAchievements",
               requirement: skill,
               points: Number(((1 / requiredMatches.length) * maxPoints).toFixed(2)),
               evidenceIds: proj.sourceId ? [proj.sourceId] : [],
               matchType: "exact",
               evidenceStrength: "project"
             });
           }
        }
      }
    }
    
    const coverage = matchedInProj.size / requiredMatches.length;
    return { status: "assessed", coverage: Number(coverage.toFixed(2)), contribution: Number((coverage * maxPoints).toFixed(2)), matchedSkills: Array.from(matchedInProj), details };
  }

  _calculateEduCertScore(eduAssessment, certAssessment, maxPoints) {
    let totalReqs = 0;
    let totalMeets = 0;
    const details = [];

    if (eduAssessment) {
      for (const edu of eduAssessment) {
        totalReqs++;
        if (edu.status === 'meets') {
          totalMeets++;
          details.push({
            component: "educationCertifications",
            requirement: edu.canonicalReq || edu.degree,
            points: 0, 
            evidenceIds: [],
            matchType: "exact",
            evidenceStrength: "education",
            ...edu
          });
        }
      }
    }
    
    if (certAssessment) {
      for (const cert of certAssessment) {
        totalReqs++;
        if (cert.status === 'meets') {
          totalMeets++;
          details.push({
             component: "educationCertifications",
             requirement: cert.canonicalReq || cert.cert,
             points: 0,
             evidenceIds: [],
             matchType: "exact",
             evidenceStrength: "certifications",
             ...cert
          });
        }
      }
    }
    
    if (totalReqs === 0) {
      return { status: "no_requirements", contribution: maxPoints, details: [] };
    }
    
    const coverage = totalMeets / totalReqs;
    const pointsPerReq = maxPoints / totalReqs;
    for (const d of details) {
      d.points = Number(pointsPerReq.toFixed(2));
    }
    
    return { status: "assessed", coverage: Number(coverage.toFixed(2)), contribution: Number((coverage * maxPoints).toFixed(2)), details };
  }
}

module.exports = new ScoringEngineV2();
