/**
 * Canonical skill taxonomy (data only; no logic here).
 *
 * Each entry:
 *   id             stable canonical id, matching the skillId contract /^[a-z0-9][a-z0-9.+#/-]{0,63}$/
 *   name           display name
 *   category       one of the categories below (free-form string; contracts don't enum it)
 *   exact          surfaces that ARE this skill (canonical/normalized spellings), matched case-insensitively
 *   aliases        unambiguous other names for the SAME skill
 *   ambiguous      true for short/common words that need context to accept (c, go, r, spring, spark)
 *   implies        one-hop "having A suggests B" edges (partial credit only; never equality)
 *   conflictsWith  commonly-confused skills that must NEVER be treated as equivalent
 *
 * Principle: a smaller, accurate taxonomy with strong negative guards beats a
 * large, loose one. Relationships are conservative and never imply equality.
 */

const CATEGORIES = [
  'programming_language', 'frontend', 'backend', 'database', 'cloud', 'devops',
  'testing', 'mobile', 'data', 'ai_ml', 'tools', 'version_control', 'other',
];

const SKILLS = [
  // ── Programming languages ──
  { id: 'javascript', name: 'JavaScript', category: 'programming_language', exact: ['javascript'], aliases: ['js', 'ecmascript'], conflictsWith: ['java', 'typescript', 'node.js'] },
  { id: 'typescript', name: 'TypeScript', category: 'programming_language', exact: ['typescript'], aliases: ['ts'], conflictsWith: ['java'] },
  { id: 'java', name: 'Java', category: 'programming_language', exact: ['java'], aliases: [], conflictsWith: ['javascript', 'typescript'] },
  { id: 'python', name: 'Python', category: 'programming_language', exact: ['python'], aliases: [] },
  { id: 'c', name: 'C', category: 'programming_language', exact: ['c'], aliases: [], ambiguous: true, conflictsWith: ['c++', 'c#'] },
  { id: 'c++', name: 'C++', category: 'programming_language', exact: ['c++', 'cpp'], aliases: [], conflictsWith: ['c', 'c#'] },
  { id: 'c#', name: 'C#', category: 'programming_language', exact: ['c#', 'csharp', 'c-sharp'], aliases: [], conflictsWith: ['c', 'c++'] },
  { id: 'go', name: 'Go', category: 'programming_language', exact: ['go'], aliases: ['golang'], ambiguous: true },
  { id: 'rust', name: 'Rust', category: 'programming_language', exact: ['rust'], aliases: [] },
  { id: 'ruby', name: 'Ruby', category: 'programming_language', exact: ['ruby'], aliases: [] },
  { id: 'php', name: 'PHP', category: 'programming_language', exact: ['php'], aliases: [] },
  { id: 'swift', name: 'Swift', category: 'programming_language', exact: ['swift'], aliases: [] },
  { id: 'kotlin', name: 'Kotlin', category: 'programming_language', exact: ['kotlin'], aliases: [] },
  { id: 'scala', name: 'Scala', category: 'programming_language', exact: ['scala'], aliases: [] },
  { id: 'r', name: 'R', category: 'programming_language', exact: ['r'], aliases: [], ambiguous: true },
  { id: 'sql', name: 'SQL', category: 'database', exact: ['sql'], aliases: [] },
  { id: 'html', name: 'HTML', category: 'frontend', exact: ['html', 'html5'], aliases: [] },
  { id: 'css', name: 'CSS', category: 'frontend', exact: ['css', 'css3'], aliases: [] },

  // ── Frontend ──
  { id: 'react', name: 'React', category: 'frontend', exact: ['react'], aliases: ['reactjs', 'react.js'], conflictsWith: ['react-native'] },
  { id: 'react-native', name: 'React Native', category: 'mobile', exact: ['react native', 'react-native'], aliases: ['reactnative'], conflictsWith: ['react'] },
  { id: 'angular', name: 'Angular', category: 'frontend', exact: ['angular'], aliases: [], conflictsWith: ['angularjs'] },
  { id: 'angularjs', name: 'AngularJS', category: 'frontend', exact: ['angularjs', 'angular.js'], aliases: [], conflictsWith: ['angular'] },
  { id: 'vue', name: 'Vue', category: 'frontend', exact: ['vue', 'vue.js'], aliases: ['vuejs'], conflictsWith: ['vue-native'] },
  { id: 'vue-native', name: 'Vue Native', category: 'mobile', exact: ['vue native', 'vue-native'], aliases: [], conflictsWith: ['vue'] },
  { id: 'next.js', name: 'Next.js', category: 'frontend', exact: ['next.js'], aliases: ['nextjs'], implies: [{ id: 'react', weight: 0.8 }] },
  { id: 'redux', name: 'Redux', category: 'frontend', exact: ['redux'], aliases: [] },
  { id: 'tailwind', name: 'Tailwind CSS', category: 'frontend', exact: ['tailwind', 'tailwind css', 'tailwindcss'], aliases: [] },
  { id: 'bootstrap', name: 'Bootstrap', category: 'frontend', exact: ['bootstrap'], aliases: [] },

  // ── Backend / frameworks ──
  { id: 'node.js', name: 'Node.js', category: 'backend', exact: ['node.js'], aliases: ['nodejs', 'node js', 'node'], conflictsWith: ['javascript'] },
  { id: 'express', name: 'Express', category: 'backend', exact: ['express', 'express.js'], aliases: ['expressjs'] },
  { id: 'django', name: 'Django', category: 'backend', exact: ['django'], aliases: [], implies: [{ id: 'python', weight: 0.7 }] },
  { id: 'flask', name: 'Flask', category: 'backend', exact: ['flask'], aliases: [], implies: [{ id: 'python', weight: 0.7 }] },
  { id: 'spring', name: 'Spring', category: 'backend', exact: ['spring', 'spring boot', 'springboot', 'spring-boot'], aliases: [], ambiguous: true },
  { id: 'dotnet', name: '.NET', category: 'backend', exact: ['.net', 'asp.net', 'dotnet'], aliases: [] },
  { id: 'fastapi', name: 'FastAPI', category: 'backend', exact: ['fastapi'], aliases: [], implies: [{ id: 'python', weight: 0.7 }] },
  { id: 'rails', name: 'Ruby on Rails', category: 'backend', exact: ['ruby on rails', 'rails'], aliases: [], implies: [{ id: 'ruby', weight: 0.8 }] },
  { id: 'graphql', name: 'GraphQL', category: 'backend', exact: ['graphql'], aliases: [] },
  { id: 'rest', name: 'REST API', category: 'backend', exact: ['rest', 'rest api', 'restful', 'rest apis'], aliases: [] },
  { id: 'grpc', name: 'gRPC', category: 'backend', exact: ['grpc'], aliases: [] },

  // ── Databases ──
  { id: 'postgresql', name: 'PostgreSQL', category: 'database', exact: ['postgresql'], aliases: ['postgres', 'postgres db', 'postgresql db'], implies: [{ id: 'sql', weight: 0.9 }] },
  { id: 'mysql', name: 'MySQL', category: 'database', exact: ['mysql'], aliases: [], implies: [{ id: 'sql', weight: 0.9 }] },
  { id: 'sqlite', name: 'SQLite', category: 'database', exact: ['sqlite'], aliases: [], implies: [{ id: 'sql', weight: 0.8 }] },
  { id: 'mongodb', name: 'MongoDB', category: 'database', exact: ['mongodb'], aliases: ['mongo'] },
  { id: 'redis', name: 'Redis', category: 'database', exact: ['redis'], aliases: [] },
  { id: 'dynamodb', name: 'DynamoDB', category: 'database', exact: ['dynamodb'], aliases: [] },
  { id: 'elasticsearch', name: 'Elasticsearch', category: 'database', exact: ['elasticsearch'], aliases: [] },
  { id: 'firebase', name: 'Firebase', category: 'cloud', exact: ['firebase'], aliases: [] },

  // ── Cloud / DevOps / version control ──
  { id: 'aws', name: 'AWS', category: 'cloud', exact: ['aws', 'amazon web services'], aliases: [] },
  { id: 'azure', name: 'Azure', category: 'cloud', exact: ['azure', 'microsoft azure'], aliases: [] },
  { id: 'gcp', name: 'GCP', category: 'cloud', exact: ['gcp', 'google cloud', 'google cloud platform'], aliases: [] },
  { id: 'docker', name: 'Docker', category: 'devops', exact: ['docker'], aliases: [] },
  { id: 'kubernetes', name: 'Kubernetes', category: 'devops', exact: ['kubernetes'], aliases: ['k8s'] },
  { id: 'jenkins', name: 'Jenkins', category: 'devops', exact: ['jenkins'], aliases: [] },
  { id: 'terraform', name: 'Terraform', category: 'devops', exact: ['terraform'], aliases: [] },
  { id: 'ci/cd', name: 'CI/CD', category: 'devops', exact: ['ci/cd', 'cicd'], aliases: [] },
  { id: 'git', name: 'Git', category: 'version_control', exact: ['git'], aliases: [] },
  { id: 'github', name: 'GitHub', category: 'version_control', exact: ['github'], aliases: [] },
  { id: 'gitlab', name: 'GitLab', category: 'version_control', exact: ['gitlab'], aliases: [] },
  { id: 'linux', name: 'Linux', category: 'tools', exact: ['linux'], aliases: [] },

  // ── Testing ──
  { id: 'jest', name: 'Jest', category: 'testing', exact: ['jest'], aliases: [] },
  { id: 'mocha', name: 'Mocha', category: 'testing', exact: ['mocha'], aliases: [] },
  { id: 'cypress', name: 'Cypress', category: 'testing', exact: ['cypress'], aliases: [] },
  { id: 'playwright', name: 'Playwright', category: 'testing', exact: ['playwright'], aliases: [] },
  { id: 'selenium', name: 'Selenium', category: 'testing', exact: ['selenium'], aliases: [] },
  { id: 'junit', name: 'JUnit', category: 'testing', exact: ['junit'], aliases: [] },
  { id: 'pytest', name: 'Pytest', category: 'testing', exact: ['pytest'], aliases: [] },

  // ── Data / AI-ML ──
  { id: 'pandas', name: 'Pandas', category: 'data', exact: ['pandas'], aliases: [] },
  { id: 'numpy', name: 'NumPy', category: 'data', exact: ['numpy'], aliases: [] },
  { id: 'spark', name: 'Apache Spark', category: 'data', exact: ['apache spark'], aliases: ['spark'], ambiguous: true },
  { id: 'tableau', name: 'Tableau', category: 'data', exact: ['tableau'], aliases: [] },
  { id: 'tensorflow', name: 'TensorFlow', category: 'ai_ml', exact: ['tensorflow'], aliases: [] },
  { id: 'pytorch', name: 'PyTorch', category: 'ai_ml', exact: ['pytorch'], aliases: [] },
  { id: 'scikit-learn', name: 'scikit-learn', category: 'ai_ml', exact: ['scikit-learn', 'scikit learn'], aliases: ['sklearn'] },
  { id: 'keras', name: 'Keras', category: 'ai_ml', exact: ['keras'], aliases: [] },
  { id: 'opencv', name: 'OpenCV', category: 'ai_ml', exact: ['opencv'], aliases: [] },

  // ── Tools ──
  { id: 'kafka', name: 'Kafka', category: 'tools', exact: ['kafka', 'apache kafka'], aliases: [] },
  { id: 'rabbitmq', name: 'RabbitMQ', category: 'tools', exact: ['rabbitmq'], aliases: [] },
  { id: 'jira', name: 'Jira', category: 'tools', exact: ['jira'], aliases: [] },
  { id: 'figma', name: 'Figma', category: 'tools', exact: ['figma'], aliases: [] },
  { id: 'postman', name: 'Postman', category: 'tools', exact: ['postman'], aliases: [] },
];

module.exports = { SKILLS, CATEGORIES };
