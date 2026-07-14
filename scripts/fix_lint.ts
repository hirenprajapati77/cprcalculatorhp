import fs from 'fs';
import path from 'path';

const p = path.resolve(__dirname, '../src/app/api/scanner/route.ts');
let content = fs.readFileSync(p, 'utf8');
content = content.replace(/\(whereClause as any\)/g, '(whereClause as Record<string, unknown>)');
content = content.replace(/\(where as any\)/g, '(where as Record<string, unknown>)');
fs.writeFileSync(p, content);
console.log('Fixed route.ts');
