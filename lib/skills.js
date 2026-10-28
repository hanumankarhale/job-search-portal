'use strict';

// Canonical skill dictionary used to read skills out of job postings.
// `cs` marks names that are only meaningful with their exact casing
// ("Go" the language vs "go" the verb).
const DICTIONARY = [
  // Programming languages
  { name: 'JavaScript', aliases: ['javascript', 'js', 'ecmascript', 'es6'] },
  { name: 'TypeScript', aliases: ['typescript'] },
  { name: 'Python', aliases: ['python'] },
  { name: 'Java', aliases: ['java'] },
  { name: 'Kotlin', aliases: ['kotlin'] },
  { name: 'Scala', aliases: ['scala'] },
  { name: 'C', aliases: ['c programming', 'c/c++', 'ansi c', 'embedded c'] },
  { name: 'C++', aliases: ['c++', 'cpp'] },
  { name: 'C#', aliases: ['c#', 'csharp', 'c sharp'] },
  { name: 'Go', aliases: ['golang', 'Go'], cs: true },
  { name: 'Rust', aliases: ['rust'] },
  { name: 'Ruby', aliases: ['ruby'] },
  { name: 'PHP', aliases: ['php'] },
  { name: 'Swift', aliases: ['swift'] },
  { name: 'Objective-C', aliases: ['objective-c', 'objective c'] },
  { name: 'Dart', aliases: ['dart'] },
  { name: 'R', aliases: ['r programming', 'rstudio', 'r language', 'r/python', 'python/r'] },
  { name: 'MATLAB', aliases: ['matlab'] },
  { name: 'Perl', aliases: ['perl'] },
  { name: 'Elixir', aliases: ['elixir'] },
  { name: 'Haskell', aliases: ['haskell'] },
  { name: 'Clojure', aliases: ['clojure'] },
  { name: 'Lua', aliases: ['lua'] },
  { name: 'Solidity', aliases: ['solidity'] },
  { name: 'SQL', aliases: ['sql'] },
  { name: 'Bash', aliases: ['bash', 'shell scripting', 'shell script'] },
  { name: 'PowerShell', aliases: ['powershell'] },
  { name: 'HTML', aliases: ['html', 'html5'] },
  { name: 'CSS', aliases: ['css', 'css3'] },
  // Frameworks & libraries
  { name: 'React', aliases: ['react', 'react.js', 'reactjs'] },
  { name: 'React Native', aliases: ['react native'] },
  { name: 'Next.js', aliases: ['next.js', 'nextjs'] },
  { name: 'Vue', aliases: ['vue', 'vue.js', 'vuejs'] },
  { name: 'Angular', aliases: ['angular', 'angularjs'] },
  { name: 'Svelte', aliases: ['svelte', 'sveltekit'] },
  { name: 'jQuery', aliases: ['jquery'] },
  { name: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss'] },
  { name: 'Bootstrap', aliases: ['bootstrap'] },
  { name: 'Redux', aliases: ['redux'] },
  { name: 'Node.js', aliases: ['node.js', 'nodejs', 'node'] },
  { name: 'Express', aliases: ['express.js', 'expressjs'] },
  { name: 'NestJS', aliases: ['nestjs', 'nest.js'] },
  { name: 'Django', aliases: ['django'] },
  { name: 'Flask', aliases: ['flask'] },
  { name: 'FastAPI', aliases: ['fastapi'] },
  { name: 'Spring', aliases: ['spring boot', 'springboot', 'spring framework', 'spring mvc'] },
  { name: 'Laravel', aliases: ['laravel'] },
  { name: 'CodeIgniter', aliases: ['codeigniter'] },
  { name: 'Symfony', aliases: ['symfony'] },
  { name: 'Ruby on Rails', aliases: ['rails', 'ruby on rails'] },
  { name: '.NET', aliases: ['.net', 'dotnet', 'asp.net', '.net core'] },
  { name: 'Flutter', aliases: ['flutter'] },
  { name: 'Android', aliases: ['android'] },
  { name: 'iOS', aliases: ['ios'] },
  { name: 'GraphQL', aliases: ['graphql'] },
  { name: 'REST APIs', aliases: ['restful', 'rest api', 'rest apis', 'rest services'] },
  { name: 'gRPC', aliases: ['grpc'] },
  { name: 'Microservices', aliases: ['microservices', 'microservice'] },
  // Data & AI
  { name: 'Pandas', aliases: ['pandas'] },
  { name: 'NumPy', aliases: ['numpy'] },
  { name: 'scikit-learn', aliases: ['scikit-learn', 'sklearn'] },
  { name: 'TensorFlow', aliases: ['tensorflow'] },
  { name: 'PyTorch', aliases: ['pytorch'] },
  { name: 'Machine Learning', aliases: ['machine learning', 'ml'] },
  { name: 'Deep Learning', aliases: ['deep learning'] },
  { name: 'NLP', aliases: ['nlp', 'natural language processing'] },
  { name: 'LLMs', aliases: ['llm', 'llms', 'large language models', 'generative ai', 'genai'] },
  { name: 'Computer Vision', aliases: ['computer vision', 'opencv'] },
  { name: 'Spark', aliases: ['spark', 'pyspark', 'apache spark'] },
  { name: 'Hadoop', aliases: ['hadoop'] },
  { name: 'Airflow', aliases: ['airflow'] },
  { name: 'dbt', aliases: ['dbt'] },
  { name: 'Tableau', aliases: ['tableau'] },
  { name: 'Power BI', aliases: ['power bi', 'powerbi'] },
  { name: 'Excel', aliases: ['ms excel', 'microsoft excel', 'advanced excel'] },
  // Databases
  { name: 'PostgreSQL', aliases: ['postgresql', 'postgres'] },
  { name: 'MySQL', aliases: ['mysql', 'mariadb'] },
  { name: 'MongoDB', aliases: ['mongodb', 'mongo'] },
  { name: 'Redis', aliases: ['redis'] },
  { name: 'Elasticsearch', aliases: ['elasticsearch', 'opensearch'] },
  { name: 'SQLite', aliases: ['sqlite'] },
  { name: 'Oracle', aliases: ['oracle'] },
  { name: 'SQL Server', aliases: ['sql server', 'mssql'] },
  { name: 'DynamoDB', aliases: ['dynamodb'] },
  { name: 'Cassandra', aliases: ['cassandra'] },
  { name: 'Kafka', aliases: ['kafka'] },
  { name: 'RabbitMQ', aliases: ['rabbitmq'] },
  { name: 'Snowflake', aliases: ['snowflake'] },
  { name: 'BigQuery', aliases: ['bigquery'] },
  // Cloud & DevOps
  { name: 'AWS', aliases: ['aws', 'amazon web services'] },
  { name: 'Azure', aliases: ['azure'] },
  { name: 'GCP', aliases: ['gcp', 'google cloud'] },
  { name: 'Docker', aliases: ['docker'] },
  { name: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { name: 'Terraform', aliases: ['terraform'] },
  { name: 'Ansible', aliases: ['ansible'] },
  { name: 'CI/CD', aliases: ['ci/cd', 'continuous integration', 'github actions', 'gitlab ci', 'jenkins'] },
  { name: 'Linux', aliases: ['linux', 'unix'] },
  { name: 'Git', aliases: ['git'] },
  { name: 'Nginx', aliases: ['nginx'] },
  { name: 'Serverless', aliases: ['serverless', 'lambda'] },
  // Practices & other
  { name: 'Agile', aliases: ['agile', 'scrum', 'kanban'] },
  { name: 'TDD', aliases: ['tdd', 'test-driven', 'unit testing'] },
  { name: 'Figma', aliases: ['figma'] },
  { name: 'Selenium', aliases: ['selenium', 'playwright', 'cypress'] },
  { name: 'Salesforce', aliases: ['salesforce'] },
  { name: 'SAP', aliases: ['sap'] },
  { name: 'Security', aliases: ['cybersecurity', 'application security', 'owasp'] },
  { name: 'Blockchain', aliases: ['blockchain', 'web3'] },
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word boundaries that understand "C++", "C#", ".NET" and "Node.js".
function termRegex(term, caseSensitive) {
  return new RegExp(`(?<![A-Za-z0-9+#.])${escapeRe(term)}(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])`, caseSensitive ? 'g' : 'gi');
}

const COMPILED = DICTIONARY.map((d) => ({
  name: d.name,
  patterns: d.aliases.map((a) => termRegex(a, !!d.cs)),
}));

const ALIAS_TO_NAME = new Map();
for (const d of DICTIONARY) {
  ALIAS_TO_NAME.set(d.name.toLowerCase(), d.name);
  for (const a of d.aliases) if (!d.cs) ALIAS_TO_NAME.set(a.toLowerCase(), d.name);
}

// Map whatever the user typed ("reactjs", "Postgres") to its canonical name.
function canonical(skill) {
  const s = String(skill || '').trim();
  return ALIAS_TO_NAME.get(s.toLowerCase()) || s;
}

function countMatches(re, text) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n++;
  return n;
}

// Returns [{ name, count }] for every known skill (plus the user's own
// custom skills) that appears in `text`.
function extractSkills(text, extraSkills = []) {
  const found = new Map();
  const t = String(text || '');
  for (const { name, patterns } of COMPILED) {
    const n = patterns.reduce((sum, re) => sum + countMatches(re, t), 0);
    if (n) found.set(name, n);
  }
  for (const raw of extraSkills) {
    const name = canonical(raw);
    if (!name || found.has(name) || name.length < 2) continue;
    const n = countMatches(termRegex(name, false), t);
    if (n) found.set(name, n);
  }
  return [...found].map(([name, count]) => ({ name, count }));
}

module.exports = { DICTIONARY, extractSkills, canonical };
