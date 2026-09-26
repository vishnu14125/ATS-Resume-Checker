const fs = require('fs');
let code = fs.readFileSync('server/services/analysisService.js', 'utf8');

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

code = code.replace(/const duration = Date\.now\(\) - startTime;\r?\n\s*console\.log\([^;]+;\r?\n/, logInjection + '\n');
fs.writeFileSync('server/services/analysisService.js', code);
console.log('Injected successfully');
