const { execSync } = require('child_process');
const out = execSync('node --version', { encoding: 'utf8' });
console.log(JSON.stringify({ childOut: out.trim() }));
