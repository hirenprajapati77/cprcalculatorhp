const fs = require('fs');
let text = fs.readFileSync('scripts/task-q.ts', 'utf8');
text = text.replace(/"(.*?\$\{.*?\}.*?)"/g, '$1');
fs.writeFileSync('scripts/task-q.ts', text);
