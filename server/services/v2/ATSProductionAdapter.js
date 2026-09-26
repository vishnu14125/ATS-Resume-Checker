const ATSIntelligenceV2 = require('./ATSIntelligenceV2'); // If logger exists, else console

class ATSProductionAdapter {
  
  /**
   * Executes ATS V2 Pipeline and maps it into a stable production contract
   */
  async analyze(resumeText, jobDescription, fileName = 'Unknown') {
    const start = Date.now();
    
    // 1. Run core pipeline
    const rawAnalysis = await ATSIntelligenceV2.analyze(resumeText, jobDescription);
    const durationMs = Date.now() - start;

    if (!rawAnalysis || !rawAnalysis.success) {
      return {
        success: false,
        error: rawAnalysis?.error || "Unknown V2 pipeline failure",
        durationMs
      };
    }

    // 2. Extract Data
    const { 
      resumeProfile, 
      jdProfile, 
      matches, 
      summary,
      scoring, 
      parseability, 
      knockouts, 
      recommendations, 
      evidenceRecords 
    } = rawAnalysis;
    
    // Extract backward compatible fields
    const skillMatches = {
      strongMatches: matches.filter(m => m.matchType === 'exact' || m.matchType === 'normalized').map(m => ({
        skill: m.requirementOriginal || m.requirementCanonical,
        status: 'matched',
        resumeEvidence: m.resumeEvidence || 'Matched in resume',
        matchType: m.matchType
      })),
      partialMatches: matches.filter(m => m.matchType === 'alias' || m.matchType === 'semantic').map(m => ({
        skill: m.requirementOriginal || m.requirementCanonical,
        status: 'matched',
        resumeEvidence: m.resumeEvidence || 'Matched semantically or via alias',
        matchType: m.matchType
      })),
      missingRequired: matches.filter(m => m.matchType === 'missing' && m.requirementClassification === 'required').map(m => ({
        skill: m.requirementOriginal || m.requirementCanonical,
        status: 'missing',
        matchType: 'missing'
      })),
      missingPreferred: matches.filter(m => m.matchType === 'missing' && m.requirementClassification === 'preferred').map(m => ({
        skill: m.requirementOriginal || m.requirementCanonical,
        status: 'missing',
        matchType: 'missing'
      }))
    };

    const resumeIssues = knockouts.map(k => ({
      type: 'Content',
      issue: `Missing Knockout Requirement: ${k.requirement}`,
      severity: k.severity || 'HIGH',
      context: k.explanation
    })).concat((parseability?.evidence || []).map(e => ({
      type: 'Structure',
      issue: e,
      severity: 'MEDIUM',
      context: 'ATS Parseability warning'
    })));

    return {
      success: true,
      data: {
        // V2 Fields
        matchScore: scoring?.overallScore || 0,
        parseScore: parseability?.score || 0,
        
        analysisMode: "v2_deterministic",
        aiStatus: "not_attempted",
        
        breakdown: scoring?.components || {},
        evidence: evidenceRecords || [],
        knockouts: knockouts || [],
        recommendations: recommendations || [],
        
        matchedSkills: matches.filter(m => m.matchType !== 'missing'),
        missingSkills: matches.filter(m => m.matchType === 'missing'),
        
        experienceAnalysis: resumeProfile.experience || [],
        projectAnalysis: resumeProfile.projects || [],
        educationAnalysis: resumeProfile.education || [],
        certificationAnalysis: resumeProfile.certifications || [],
        
        parserVersion: "v2",
        matcherVersion: "v2",
        scoringVersion: "v2",

        // V1 Backward Compatibility Fields
        overallScore: scoring?.overallScore || 0,
        scoreBreakdown: scoring?.components || {},
        skillMatches: skillMatches,
        resumeIssues: resumeIssues,
        structuredResume: resumeProfile,
        structuredJD: jdProfile
      },
      metadata: {
        durationMs,
        fileName
      }
    };
  }
}

module.exports = new ATSProductionAdapter();
