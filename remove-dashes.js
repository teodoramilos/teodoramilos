const fs = require('fs');
const path = require('path');
const { glob } = require('fs');

const patterns = [
  /—/g,       // em dash (U+2014)
  /–/g,       // en dash (U+2013)
  /&mdash;/g,
  /&ndash;/g,
  /&#8212;/g,
  /&#8211;/g,
];

const htmlFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(fullPath);
    }
  }
}

walk(path.dirname(process.argv[1]));

let totalReplacements = 0;

for (const file of htmlFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let count = 0;
  for (const pattern of patterns) {
    const before = content.length;
    content = content.replace(pattern, '');
    count += (before - content.length);
  }
  if (count > 0) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`  ${path.relative(process.cwd(), file)}: removed ${count} dash character(s)`);
    totalReplacements += count;
  }
}

console.log(`\nDone. Total replacements: ${totalReplacements} across ${htmlFiles.length} file(s) scanned.`);
