import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';

const action = process.argv[2];

if (action === 'clean') {
  copyFileSync('package.json', 'package.json.bak');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  delete pkg.workspaces;
  delete pkg.devDependencies;

  const keep = ['start', 'prod'];
  pkg.scripts = Object.fromEntries(
    Object.entries(pkg.scripts).filter(([k]) => keep.includes(k))
  );

  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
} else if (action === 'restore') {
  copyFileSync('package.json.bak', 'package.json');
  unlinkSync('package.json.bak');
}
