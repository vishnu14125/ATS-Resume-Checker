const AIFactory = require('./AIFactory');
const { ResumeStructuredSchema } = require('../schemas/resumeSchema');
const { JobDescriptionSchema } = require('../schemas/jdSchema');
const { z } = require('zod');

class AIEngine {
  constructor() {
    this.primaryProvider = AIFactory.getPrimaryProvider();
    this.fallbackProvider = AIFactory.getFallbackProvider();
    
    // Default to primary for current request state
    this.provider = this.primaryProvider;
  }

  /**
   * Safe wrapper around AI generation with localized retries for schema validation
   * or temporary provider failures, with automatic fallback support.
   */
  async _safeGenerate(prompt, text, schema, maxRetries = 2) {
    let attempt = 0;
    const correlationId = Math.random().toString(36).substring(2, 9) + '-' + Date.now();
    
    while (attempt <= maxRetries) {
      try {
        console.log(`[${correlationId}] [AIEngine] Operation: generateContent | Provider: ${this.provider.constructor.name} | Model: ${this.provider.modelName} | Attempt: ${attempt + 1}`);
        const result = await this.provider.generateStructuredOutput(prompt, text, schema);
        console.log(`[${correlationId}] [AIEngine] Final Status: SUCCESS | Provider: ${this.provider.constructor.name}`);
        return result;
      } catch (error) {
        attempt++;
        const isZodError = error.name === 'ZodError';
        const isTransient = error.message.includes('fetch failed') || 
                            error.message.includes('500') || 
                            error.message.includes('502') || 
                            error.message.includes('503') || 
                            error.message.includes('504') || 
                            error.message.includes('429') || 
                            error.message.includes('timeout') ||
                            (error.status && error.status >= 500) ||
                            error.status === 429;
        
        if (isZodError) {
          console.warn(`[${correlationId}] [AIEngine] Retry ${attempt}/${maxRetries} triggered due to schema validation error.`);
          prompt += `\n\n[SYSTEM WARNING: Your last output failed validation with error: ${error.message}. YOU MUST strictly adhere to the schema.]`;
        } else if (isTransient) {
          if (attempt <= maxRetries) {
            const baseDelay = process.env.NODE_ENV === 'test' ? 10 : 1500;
            const backoff = Math.pow(2, attempt) * baseDelay;
            console.log(`[${correlationId}] [AIEngine] Transient error (${error.message}). Backing off for ${backoff}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, backoff));
          }
        } else {
          console.error(`[${correlationId}] [AIEngine] Fatal non-transient error: ${error.message}. No fallback will be attempted.`);
          throw error; // Non-transient (400, 401, 403, 404, auth, config)
        }

        if (attempt > maxRetries) {
          // If we exhausted primary provider retries, try fallback
          if (this.provider === this.primaryProvider && this.fallbackProvider) {
            console.warn(`[${correlationId}] [AIEngine] Primary provider retries exhausted. Fallback triggered: ${this.fallbackProvider.constructor.name}`);
            try {
              console.log(`[${correlationId}] [AIEngine] Operation: generateContent | Provider: ${this.fallbackProvider.constructor.name} | Model: ${this.fallbackProvider.modelName} | Attempt: Fallback`);
              const fallbackResult = await this.fallbackProvider.generateStructuredOutput(prompt, text, schema);
              console.log(`[${correlationId}] [AIEngine] Final Status: SUCCESS | Provider: ${this.fallbackProvider.constructor.name}`);
              return fallbackResult;
            } catch (fallbackError) {
               console.error(`[${correlationId}] [AIEngine] Fallback ALSO failed:`, fallbackError.message);
               
               // If fallback failed due to auth (e.g. invalid key disguised as valid), 
               // mask it so the user sees the original transient failure message.
               if (fallbackError.status === 401 || fallbackError.status === 403 || fallbackError.message.includes('401') || fallbackError.message.includes('Incorrect API key')) {
                 const userFriendlyError = new Error('AI provider is temporarily unavailable due to high demand. Please try again later.');
                 userFriendlyError.statusCode = 503;
                 throw userFriendlyError;
               }
               
               throw fallbackError;
            }
          } else {
            if (!this.fallbackProvider && isTransient) {
              console.warn(`[${correlationId}] [AIEngine] Fallback AI provider unavailable (OPENAI_API_KEY missing). AI provider is temporarily unavailable.`);
              const userFriendlyError = new Error('AI provider is temporarily unavailable due to high demand. Please try again later.');
              userFriendlyError.statusCode = 503;
              throw userFriendlyError;
            }
            throw error; 
          }
        }
      }
    }
  }

  /**
   * Single optional AI enhancement call.
   * Takes the deterministic baseline and generates human-readable insights.
   */
  async enhanceAnalysis(baselineData) {
    const EnhancementSchema = z.object({
      recommendations: z.array(z.object({
        category: z.string().describe("E.g., SKILL_GAP, STRUCTURE, EXPERIENCE"),
        severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
        title: z.string().describe("A short, descriptive title for the recommendation"),
        explanation: z.string().describe("Why this recommendation matters for ATS"),
        evidence: z.object({
          jobDescription: z.string().nullable().describe("The specific JD requirement causing this suggestion"),
          resume: z.string().nullable().describe("The specific resume area causing this suggestion")
        }),
        action: z.string().describe("Specific, actionable advice")
      })),
      resumeIssues: z.array(z.object({
        type: z.enum(['Content', 'Achievement Quality', 'Relevance', 'Structure', 'Language']),
        issue: z.string().describe("What exactly is wrong (e.g. 'Missing measurable impact')"),
        severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
        context: z.string().describe("The exact text from the resume causing this issue")
      }))
    });

    const prompt = `
You are an expert ATS optimization engine and HR reviewer.
You have been provided with a local baseline analysis of a candidate's resume against a job description.
Your task is to provide highly specific and actionable recommendations to improve the resume, and detect any subtle phrasing or structural issues that a basic parser might miss.

RULES:
1. Do NOT invent metrics or tell the candidate to fabricate experience.
2. Base your recommendations ONLY on the provided evidence.
3. Focus on high-value advice (e.g., how to rephrase an achievement, how to better highlight a matching skill).

Baseline Analysis Data:
${JSON.stringify({
  score: baselineData.overallScore,
  missingRequired: baselineData.skillMatches?.missingRequired || [],
  missingPreferred: baselineData.skillMatches?.missingPreferred || [],
  partialMatches: baselineData.skillMatches?.partialMatches || []
}, null, 2)}

Resume Extract:
${JSON.stringify(baselineData.structuredResume, null, 2)}

JD Extract:
${JSON.stringify(baselineData.structuredJD, null, 2)}
    `;

    // Strict 1-minute timeout on the promise level to prevent infinite hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AI Enhancement timed out after 60 seconds')), 60000)
    );

    return await Promise.race([
      this._safeGenerate(prompt, "Enhance baseline analysis", EnhancementSchema),
      timeoutPromise
    ]);
  }

  async extractResumeData(text) {
    const prompt = `
You are an expert ATS (Applicant Tracking System) parser.
Extract the structured information from the provided resume text.
Make sure to extract dates, technologies, and achievements properly into the requested schema fields.
    `;
    return await this._safeGenerate(prompt, text, ResumeStructuredSchema);
  }

  async extractJobDescription(text) {
    const prompt = `
You are an expert HR job description analyzer.
Extract the structured requirements, preferences, and responsibilities from the provided job description text.
Categorize skills correctly into required vs preferred.
    `;
    return await this._safeGenerate(prompt, text, JobDescriptionSchema);
  }

  async analyzeResumeIssues(resumeData) {
    const IssuesSchema = z.object({
      resumeIssues: z.array(z.object({
        type: z.enum(['Content', 'Achievement Quality', 'Relevance', 'Structure', 'Language']),
        issue: z.string().describe("What exactly is wrong (e.g. 'Missing measurable impact')"),
        severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
        context: z.string().describe("The exact text from the resume causing this issue")
      }))
    });

    const prompt = `
You are an expert HR resume reviewer. Analyze this resume for common quality issues.
Focus on:
1. Content: vague statements, weak action verbs, repetitive wording.
2. Achievement Quality: lack of measurable outcomes, missing scale or business impact.
3. Structure: missing sections, excessive length.
4. Language: phrasing issues.

Provide specific evidence from the text.
    `;
    return await this._safeGenerate(prompt, JSON.stringify(resumeData), IssuesSchema);
  }

  async optimizeResumeSection(originalText, sectionContext, targetJD) {
    const OptimizationSchema = z.object({
      originalText: z.string(),
      suggestedText: z.string(),
      changes: z.array(z.string()).describe("List of what changed"),
      reasoning: z.string().describe("Why it is better for ATS"),
      factualClaims: z.array(z.string()).describe("Facts preserved or highlighted"),
      requiresUserVerification: z.boolean().describe("Always true if metrics were inferred or phrasing heavily changed")
    });

    const prompt = `
You are an AI Resume Optimizer.
Your task is to rewrite a specific section of a resume (typically an experience bullet point) to be stronger, more impactful, and better aligned with the target job description.

RULES:
1. NEVER invent metrics, percentages, revenue, scale, or business impact.
2. NEVER add technologies the user hasn't explicitly mentioned.
3. Improve action verbs (e.g. 'Did' -> 'Architected').
4. If a metric would improve the bullet but is missing, rewrite the bullet cleanly and add an instruction in 'reasoning' to add genuine metrics.
5. You must output the original text exactly as provided, and your new suggested text.

Context (Job Description):
\${targetJD}

Context (Resume Section):
\${sectionContext}

Text to Optimize:
\${originalText}
    `;

    return await this._safeGenerate(prompt, originalText, OptimizationSchema);
  }

  // Phase 4: Interview Preparation
  async generateInterviewPreparation(resumeData, jdData, skillMatches) {
    const InterviewSchema = z.object({
      questions: z.array(z.object({
        category: z.enum(['Technical', 'Resume-Based', 'Skill-Gap', 'Behavioral', 'Project']),
        difficulty: z.enum(['Easy', 'Medium', 'Hard']),
        question: z.string().describe("The interview question"),
        evidence: z.string().nullable().describe("Resume or JD text that prompted this question"),
        reasoning: z.string().describe("Why this question matters for this role"),
        preparationGuidance: z.string().describe("Tips on how to answer")
      }))
    });

    const prompt = `
You are an expert technical interviewer. Generate an interview preparation guide for the candidate based on their resume and the target job description.

RULES:
1. Ground every question in evidence.
2. For "Resume-Based" or "Project" questions, ask specifically about what they wrote in their resume. Do not invent details.
3. For "Skill-Gap", if a required JD skill is missing from their resume, ask a foundational question about it but DO NOT assume they have experience.
4. Do not fabricate company-specific questions (unless the JD explicitly mentions company details).

Resume Data:
\${JSON.stringify(resumeData, null, 2)}

JD Data:
\${JSON.stringify(jdData, null, 2)}

Skill Match State:
\${JSON.stringify(skillMatches, null, 2)}
    `;

    return await this._safeGenerate(prompt, "Generate interview preparation", InterviewSchema);
  }

  // Phase 4: Learning Roadmap
  async generateLearningRoadmap(resumeData, jdData, skillMatches) {
    const RoadmapSchema = z.object({
      items: z.array(z.object({
        skill: z.string(),
        reason: z.string().describe("Why learn this?"),
        priority: z.enum(['Critical', 'Important', 'Nice-to-Have']),
        currentEvidence: z.string().describe("What they currently know (or 'Evidence not detected in the uploaded resume.')"),
        targetRequirement: z.string().describe("What the JD requires"),
        prerequisites: z.array(z.string()).describe("What to learn first"),
        suggestedSequence: z.array(z.string()).describe("Step-by-step topics"),
        effort: z.string().describe("e.g. '2-3 weeks'")
      }))
    });

    const prompt = `
You are a technical career coach. Generate a personalized learning roadmap based on the candidate's skill gaps compared to the target Job Description.

RULES:
1. ONLY recommend learning skills that are in the Job Description but missing or partially matched in the Resume.
2. Categorize Priority: "Critical" (Required but missing), "Important" (Preferred but missing, or partial required), "Nice-to-Have".
3. NEVER invent external URLs, course names, or certifications. Provide topic sequences (e.g. "Dockerfiles, Networking, Volumes").
4. Accurately state "Evidence not detected in the uploaded resume." if they lack the skill entirely. Do NOT say "You don't know X".

Missing Required: \${skillMatches.missingRequired.map(s => s.skill || s).join(', ')}
Missing Preferred: \${skillMatches.missingPreferred.map(s => s.skill || s).join(', ')}

JD Data:
\${JSON.stringify(jdData, null, 2)}
    `;

    return await this._safeGenerate(prompt, "Generate learning roadmap", RoadmapSchema);
  }

  // Phase 4: Project Relevance
  async analyzeProjectRelevance(resumeData, jdData) {
    const ProjectRelevanceSchema = z.object({
      projects: z.array(z.object({
        projectName: z.string(),
        technologies: z.array(z.string()),
        demonstratedCapabilities: z.array(z.string()),
        relevantRequirements: z.array(z.string()).describe("Matched JD requirements"),
        matchingSkills: z.array(z.string()),
        missingInformation: z.array(z.string()).describe("Metrics or details missing from project description"),
        relevanceExplanation: z.string(),
        resumeEmphasisSuggestion: z.string()
      }))
    });

    const prompt = `
You are an ATS project evaluator. Analyze the candidate's projects against the target Job Description to determine relevance.

RULES:
1. Evaluate ONLY the projects listed in the resume.
2. Cross-reference the technologies used in the project against the JD.
3. NEVER invent metrics, users, scale, or business impact.
4. If a project description lacks metrics, suggest adding them in 'missingInformation', but do not fabricate them.

Resume Projects:
\${JSON.stringify(resumeData.projects || [], null, 2)}

JD Data:
\${JSON.stringify(jdData, null, 2)}
    `;

    return await this._safeGenerate(prompt, "Analyze project relevance", ProjectRelevanceSchema);
  }
}

module.exports = new AIEngine();
