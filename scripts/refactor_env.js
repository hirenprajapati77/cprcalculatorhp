const fs = require('fs');
const path = require('path');

function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && p !== path.join('src', 'config', 'env.ts')) {
      let c = fs.readFileSync(p, 'utf8');
      
      // Skip middleware.ts and next-env.d.ts because middleware runs in Edge and importing env.ts with z.object might fail if it uses node modules, although zod works in Edge.
      // But Next.js often warns about process.env in edge.
      
      if(c.includes('process.env.')) {
        let modified = false;
        c = c.replace(/process\.env\.([A-Z0-9_]+)/g, (match, v) => {
          // ignore NODE_ENV in some next internals, but let's just do it
          modified = true;
          return 'env.' + v;
        });
        
        if (modified) {
          if (!c.includes('import { env }')) {
            const importStmt = 'import { env } from \'@/config/env\';\n';
            if (c.startsWith('"use client"') || c.startsWith("'use client'")) {
              const idx = c.indexOf('\n');
              c = c.substring(0, idx + 1) + importStmt + c.substring(idx + 1);
            } else {
              c = importStmt + c;
            }
          }
          fs.writeFileSync(p, c);
          console.log('Updated', p);
        }
      }
    }
  });
}

walk('src');
