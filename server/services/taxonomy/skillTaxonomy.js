const skillTaxonomy = [
  // Frontend
  { canonical: "react", aliases: ["react", "react.js", "reactjs", "react js"], category: "frontend" },
  { canonical: "react native", aliases: ["react native", "react-native", "reactnative"], category: "frontend" },
  { canonical: "angular", aliases: ["angular", "angularjs", "angular.js"], category: "frontend" },
  { canonical: "vue", aliases: ["vue", "vue.js", "vuejs"], category: "frontend" },
  { canonical: "next.js", aliases: ["next.js", "nextjs", "next"], category: "frontend" },
  { canonical: "html", aliases: ["html", "html5"], category: "frontend" },
  { canonical: "css", aliases: ["css", "css3"], category: "frontend" },
  { canonical: "tailwind", aliases: ["tailwind", "tailwindcss", "tailwind css"], category: "frontend" },
  
  // Backend
  { canonical: "node.js", aliases: ["node.js", "nodejs", "node js", "node"], category: "backend" },
  { canonical: "express", aliases: ["express", "express.js", "expressjs"], category: "backend" },
  { canonical: "spring", aliases: ["spring", "spring boot", "springboot"], category: "backend" },
  { canonical: "django", aliases: ["django"], category: "backend" },
  { canonical: "flask", aliases: ["flask"], category: "backend" },
  { canonical: "c#", aliases: ["c#", "csharp", "c sharp"], category: "backend" },
  { canonical: ".net", aliases: [".net", "dotnet", "dot net", "asp.net"], category: "backend" },
  { canonical: "php", aliases: ["php"], category: "backend" },
  
  // Databases
  { canonical: "mongodb", aliases: ["mongodb", "mongo"], category: "database" },
  { canonical: "postgresql", aliases: ["postgresql", "postgres"], category: "database" },
  { canonical: "mysql", aliases: ["mysql"], category: "database" },
  { canonical: "redis", aliases: ["redis"], category: "database" },
  { canonical: "sql", aliases: ["sql"], category: "database" },
  
  // Cloud/DevOps
  { canonical: "aws", aliases: ["aws", "amazon web services"], category: "cloud" },
  { canonical: "azure", aliases: ["azure", "microsoft azure"], category: "cloud" },
  { canonical: "gcp", aliases: ["gcp", "google cloud", "google cloud platform"], category: "cloud" },
  { canonical: "docker", aliases: ["docker"], category: "devops" },
  { canonical: "kubernetes", aliases: ["kubernetes", "k8s"], category: "devops" },
  { canonical: "git", aliases: ["git"], category: "devops" },
  { canonical: "github", aliases: ["github"], category: "devops" },
  { canonical: "ci/cd", aliases: ["ci/cd", "cicd", "continuous integration", "continuous deployment"], category: "devops" },

  // Languages
  { canonical: "c", aliases: ["c"], category: "language" },
  { canonical: "c++", aliases: ["c++", "cpp"], category: "language" },
  { canonical: "java", aliases: ["java"], category: "language" },
  { canonical: "python", aliases: ["python"], category: "language" },
  { canonical: "javascript", aliases: ["javascript", "js", "es6"], category: "language" },
  { canonical: "typescript", aliases: ["typescript", "ts"], category: "language" },
  { canonical: "go", aliases: ["go", "golang"], category: "language" },
  { canonical: "rust", aliases: ["rust"], category: "language" },

  // Data/AI
  { canonical: "pandas", aliases: ["pandas"], category: "data" },
  { canonical: "numpy", aliases: ["numpy"], category: "data" },
  { canonical: "scikit-learn", aliases: ["scikit-learn", "sklearn"], category: "data" },
  { canonical: "tensorflow", aliases: ["tensorflow", "tf"], category: "data" },
  { canonical: "pytorch", aliases: ["pytorch"], category: "data" },
  { canonical: "opencv", aliases: ["opencv"], category: "data" }
];

class TaxonomyService {
  constructor() {
    this.aliasMap = new Map();
    // Pre-compute alias map for fast lookup
    for (const item of skillTaxonomy) {
      for (const alias of item.aliases) {
        this.aliasMap.set(alias.toLowerCase(), item.canonical);
      }
    }
  }

  /**
   * Resolves a raw term to its canonical form if it exists in the taxonomy.
   * If not, it falls back to a basic string normalization.
   */
  resolveCanonical(rawSkill) {
    if (!rawSkill) return null;
    const lower = rawSkill.trim().toLowerCase();
    
    // Check taxonomy exact alias match
    if (this.aliasMap.has(lower)) {
      return this.aliasMap.get(lower);
    }
    
    // Fallback naive normalization just to handle weird spacing
    return lower.replace(/\s+/g, ' ').trim();
  }
}

module.exports = new TaxonomyService();
