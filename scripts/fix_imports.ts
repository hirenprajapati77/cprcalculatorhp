import fs from 'fs';
import path from 'path';

function fixImportsInDir(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.test.ts')) {
      const p = path.join(dir, file);
      let content = fs.readFileSync(p, 'utf8');
      
      // Replace `from '../something'` with `from '../../something'`
      // But avoid turning `from '../../something'` into `from '../../../something'` unless it was already `../..`
      // A safer regex: from\s+['"]\.\.\/([^.])/g
      content = content.replace(/from\s+['"]\.\.\/([^.])/g, "from '../../$1");
      
      // Replace `from '@/` just in case some paths were mixed.
      
      fs.writeFileSync(p, content);
      console.log(`Fixed imports in ${file}`);
    }
  }
}

fixImportsInDir(path.resolve(__dirname, '../src/tests/unit'));
fixImportsInDir(path.resolve(__dirname, '../src/tests/integration'));
