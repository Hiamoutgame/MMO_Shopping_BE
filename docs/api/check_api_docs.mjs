import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('docs/api');
const modules = [
  'identity',
  'catalog',
  'inventory',
  'shopping',
  'commerce',
  'finance',
  'integration',
  'automation',
  'support',
  'system',
];
const requiredSections = [
  '## Endpoint',
  '## Mô tả',
  '## Request',
  '## Validation',
  '## Response',
  '## Ràng buộc nghiệp vụ',
  '## Idempotency',
  '## Transaction & concurrency',
  '## Dữ liệu nhạy cảm',
  '## Audit',
];
const failures = [];
let endpointDocs = 0;

for (const module of modules) {
  const moduleDir = path.join(root, module);
  if (!fs.existsSync(moduleDir)) {
    failures.push(`Missing module directory: ${module}`);
    continue;
  }

  for (const file of fs.readdirSync(moduleDir).filter((name) => name.endsWith('.md'))) {
    endpointDocs += 1;
    const relativePath = `${module}/${file}`;
    const content = fs.readFileSync(path.join(moduleDir, file), 'utf8');

    if (!/^(GET|POST|PATCH|DELETE)_.+\.md$/.test(file)) {
      failures.push(`Invalid endpoint file name: ${relativePath}`);
    }

    for (const section of requiredSections) {
      if (!content.includes(section)) {
        failures.push(`Missing section ${section}: ${relativePath}`);
      }
    }

    const endpointLine = content.split('\n').find((line) => line.startsWith('- URL:')) ?? '';
    if (/\brating\b|\breview\b/i.test(`${file} ${endpointLine}`)) {
      failures.push(`V1 must not expose rating/review endpoint: ${relativePath}`);
    }
  }
}

const readmePath = path.join(root, 'README');
const readme = fs.readFileSync(readmePath, 'utf8');
const markdownLinkPattern = /\]\(([^)]+\.md)\)/g;
let match;
while ((match = markdownLinkPattern.exec(readme)) !== null) {
  const target = path.join(root, match[1]);
  if (!fs.existsSync(target)) {
    failures.push(`Broken README link: ${match[1]}`);
  }
}

for (const story of [
  ...Array.from({ length: 19 }, (_, index) => `US-USR-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 12 }, (_, index) => `US-ADM-${String(index + 1).padStart(2, '0')}`),
]) {
  if (!readme.includes(story)) {
    failures.push(`Missing traceability entry: ${story}`);
  }
}

console.log(JSON.stringify({ endpointDocs, failures }, null, 2));
if (failures.length > 0) {
  process.exit(1);
}
