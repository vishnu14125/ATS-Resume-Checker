const ResumeParserV2 = require('../parsers/ResumeParserV2');
const JDParserV2 = require('../parsers/JDParserV2');
const MatcherV2 = require('../matching/MatcherV2');
const v2Schemas = require('../schemas/v2Schemas');

// V2 Analyzers
const ExperienceAnalyzerV2 = require('../intelligence/ExperienceAnalyzerV2');
const ProjectAnalyzerV2 = require('../intelligence/ProjectAnalyzerV2');
const EducationAnalyzerV2 = require('../intelligence/EducationAnalyzerV2');
const CertificationAnalyzerV2 = require('../intelligence/CertificationAnalyzerV2');
const ParseabilityAnalyzerV2 = require('../parseability/ParseabilityAnalyzerV2');

// V2 Engines
const EvidenceEngineV2 = require('../evidence/EvidenceEngineV2');
const KnockoutAnalyzerV2 = require('../intelligence/KnockoutAnalyzerV2');
const RecommendationEngineV2 = require('../recommendations/RecommendationEngineV2');
const ScoringEngineV2 = require('../scoring/ScoringEngineV2');

class ATSIntelligenceV2 {
  /**
   * Deterministically analyze resume against JD
   */
  async analyze(resumeText, jobDescription) {
    if (!resumeText || !jobDescription) {
      return this._buildErrorResponse("Resume text and JD text are required.");
    }

    try {
      // 1. Parse Resume
      const resumeProfile = ResumeParserV2.parse(resumeText);
      
      // 2. Parse JD
      const jdProfile = JDParserV2.parse(jobDescription);
      
      // 3. Match Skills (Exact, Normalized, Alias, Semantic)
      const matches = await MatcherV2.match(resumeProfile, jdProfile);

      // 4. Intelligence Enhancements (Experience, Projects, Education, Certs)
      const experienceCtx = ExperienceAnalyzerV2.analyze(resumeProfile, jdProfile, matches);
      const projectCtx = ProjectAnalyzerV2.analyze(resumeProfile, jdProfile, matches);
      const educationCtx = EducationAnalyzerV2.analyze(resumeProfile, jdProfile);
      const certificationCtx = CertificationAnalyzerV2.analyze(resumeProfile, jdProfile);
      
      // 5. Parseability
      const parseability = ParseabilityAnalyzerV2.analyze(resumeText, resumeProfile, {});

      // 6. Evidence mapping
      const evidenceRecords = EvidenceEngineV2.generateEvidence(
        jdProfile.requirements, 
        matches, 
        {
          experience: experienceCtx,
          projects: projectCtx.projectEvidence,
          education: educationCtx.assessment,
          certification: certificationCtx.assessment
        }
      );

      // 7. Knockouts
      const knockouts = KnockoutAnalyzerV2.analyze(evidenceRecords, {
         experience: experienceCtx,
         education: educationCtx.assessment,
         certification: certificationCtx.assessment
      });

      // 8. Scoring
      const scoring = ScoringEngineV2.score(matches, {
         experienceAssessment: experienceCtx,
         projectEvidence: projectCtx.projectEvidence,
         educationAssessment: educationCtx.assessment,
         certificationAssessment: certificationCtx.assessment
      });

      // 9. Recommendations
      const recommendations = RecommendationEngineV2.generateRecommendations(
        evidenceRecords, 
        knockouts, 
        parseability?.evidence || []
      );

      // 10. Validate base output with schemas
      try {
        v2Schemas.ResumeProfileSchema.parse(resumeProfile);
        v2Schemas.JDProfileSchema.parse(jdProfile);
        v2Schemas.MatchEvidenceSchema.array().parse(matches);
      } catch (validationError) {
        return this._buildErrorResponse(`Schema Validation Error: ${validationError.message}`);
      }

      // 11. Build summary
      const summary = {
        totalRequirements: jdProfile.requirements.length,
        requiredRequirements: jdProfile.requirements.filter(r => r.classification === 'required').length,
        preferredRequirements: jdProfile.requirements.filter(r => r.classification === 'preferred').length,
        matchedRequirements: matches.filter(m => m.matchType !== 'missing').length,
        missingRequirements: matches.filter(m => m.matchType === 'missing').length,
        normalizedMatches: matches.filter(m => m.matchType === 'normalized').length,
        exactMatches: matches.filter(m => m.matchType === 'exact').length
      };

      return {
        version: "2",
        success: true,
        resumeProfile,
        jdProfile,
        matches,
        summary,
        experienceCtx,
        projectCtx,
        educationCtx,
        certificationCtx,
        parseability,
        evidenceRecords,
        knockouts,
        scoring,
        recommendations
      };
    } catch (error) {
      return this._buildErrorResponse(`Pipeline Error: ${error.message}`);
    }
  }

  _buildErrorResponse(message) {
    return {
      version: "2",
      success: false,
      error: message,
      resumeProfile: null,
      jdProfile: null,
      matches: [],
      summary: {
        totalRequirements: 0,
        requiredRequirements: 0,
        preferredRequirements: 0,
        matchedRequirements: 0,
        missingRequirements: 0,
        normalizedMatches: 0,
        exactMatches: 0
      }
    };
  }
}

module.exports = new ATSIntelligenceV2();
