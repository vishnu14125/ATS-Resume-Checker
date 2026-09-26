const fs = require('fs');
let code = fs.readFileSync('server/services/analysisService.js', 'utf8');

const injection = `const v2Mode = process.env.ATS_V2_MODE || 'shadow';
  try {
    const startTime = Date.now();
    console.log(\`[\${correlationId}] 🚀 Starting ATS Analysis for \${fileName}... (Mode: \${v2Mode})\`);

    let v2Result = null;
    let v2DurationMs = 0;
    
    if (v2Mode === 'v2' || v2Mode === 'shadow') {
      try {
        const v2Start = Date.now();
        v2Result = await require('./v2/ATSProductionAdapter').analyze(resumeText, jobDescription, fileName);
        v2DurationMs = Date.now() - v2Start;
        if (!v2Result.success) {
           console.warn(\`[\${correlationId}] ⚠️ V2 Pipeline Failed:\`, v2Result.error);
           v2Result = null;
        } else if (v2Mode === 'v2') {
           console.log(\`[\${correlationId}] ✅ V2 Analysis completed in \${v2DurationMs}ms. Returning V2 result.\`);
           v2Result.data.metadata = v2Result.data.metadata || {};
           v2Result.data.metadata.correlationId = correlationId;
           return v2Result.data;
        }
      } catch (v2Error) {
         console.warn(\`[\${correlationId}] ⚠️ V2 Pipeline Threw Error:\`, v2Error);
         v2Result = null;
      }
    }`;

code = code.replace(/try\s*\{\s*const startTime = Date\.now\(\);\s*console\.log[^;]+;/, injection);

const logInjection = `    const duration = Date.now() - startTime;
    console.log(\`[\${correlationId}] ✅ Analysis completed in \${duration}ms (Mode: \${baselineData.analysisMode})\`);

    if (v2Mode === 'shadow' && v2Result) {
      console.log(\`[\${correlationId}] 🔍 SHADOW COMPARISON: V1 Score: \${baselineData.overallScore}, V2 Score: \${v2Result.data.matchScore}\`);
      // Attach it to metadata for debugging (will be saved in DB if schema allows)
      baselineData.metadata = baselineData.metadata || {};
      baselineData.metadata.v2Comparison = {
        v1Score: baselineData.overallScore,
        v2MatchScore: v2Result.data.matchScore,
        v2ParseScore: v2Result.data.parseScore,
        v2Breakdown: v2Result.data.breakdown,
        v2EvidenceCount: (v2Result.data.evidence || []).length,
        v2KnockoutCount: (v2Result.data.knockouts || []).length,
        v2RecommendationCount: (v2Result.data.recommendations || []).length,
        v2AnalysisVersion: "2.1.0"
      };
    }`;

code = code.replace(/const duration = Date\.now\(\) - startTime;\n\s*console\.log\(\`\[\$\S+\][^\n]+\n/, logInjection + '\n');

fs.writeFileSync('server/services/analysisService.js', code);
console.log('Injected successfully');
