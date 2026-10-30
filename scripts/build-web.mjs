// 把网页文件复制到 www/，交给 Capacitor 打包进 App
import { cpSync, rmSync, mkdirSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
for (const f of ['index.html', 'ui-v3.css', 'ui-v3.js', 'manifest.webmanifest', 'icons', 'vendor', 'assets']) {
  cpSync(f, `www/${f}`, { recursive: true });
}
console.log('www/ ready');
