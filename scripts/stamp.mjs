// 给页面加载的脚本和样式打上内容版本号，并写进 sw.js 的 VERSION
// 改过 index.html、sw.js 或任何本地脚本、样式后运行：npm run stamp（--check 只检查，不写）
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const check = process.argv.includes('--check');
const html = readFileSync('index.html', 'utf8');
const sw = readFileSync('sw.js', 'utf8');
const bare = (s) => s.replace(/\?v=[0-9a-f]*/g, '');
const local = [...html.matchAll(/<(?:script\b[^>]*\bsrc|link\b[^>]*rel="stylesheet"[^>]*href)="([^"]+)"/g)]
  .map((m) => bare(m[1])).filter((f) => !f.includes('://'));

const hash = createHash('sha256');
hash.update(bare(html)).update(sw.replace(/const VERSION = '[0-9a-f]*';/, ''));
for (const f of local) hash.update(f).update(readFileSync(f));
const version = hash.digest('hex').slice(0, 10);

const nextHtml = html.replace(/(<(?:script\b[^>]*\bsrc|link\b[^>]*rel="stylesheet"[^>]*href)=")([^"]+)"/g,
  (m, head, url) => (url.includes('://') ? m : `${head}${bare(url)}?v=${version}"`));
const nextSw = sw.replace(/const VERSION = '[0-9a-f]*';/, `const VERSION = '${version}';`);
if (check) {
  if (nextHtml !== html || nextSw !== sw) { console.error('Version is stale; run npm run stamp'); process.exit(1); }
} else {
  writeFileSync('index.html', nextHtml);
  writeFileSync('sw.js', nextSw);
  console.log('version ' + version);
}
