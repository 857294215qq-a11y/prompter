// 一次性：把 index.html 里的内联引擎按分区逐字搬到 src/engine/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const parts = [
  ['00-core', 662, 708], ['01-script', 709, 767], ['02-editor', 768, 936], ['03-reader', 937, 1153],
  ['04-playback', 1154, 1244], ['05-voice', 1245, 1355], ['06-recorder', 1356, 1484], ['07-controls', 1485, 1502],
  ['08-marks', 1503, 1606], ['09-loop', 1607, 1641], ['10-inline-edit', 1642, 1707], ['11-session', 1708, 1769],
  ['12-reader-input', 1770, 1906], ['13-pip', 1907, 1944], ['14-remote', 1945, 2032], ['15-remote-lan', 2033, 2445],
  ['16-nearby', 2446, 2707], ['17-install', 2708, 2743],
];
const lines = readFileSync('index.html', 'utf8').split('\n');
if (lines[658] !== '<script>' || lines[659] !== '(() => {' || lines[2743] !== '})();' || lines[2744] !== '</script>')
  throw new Error('index.html no longer matches the expected line layout');
mkdirSync('src/engine', { recursive: true });
for (const [name, from, to] of parts)
  writeFileSync(`src/engine/${name}.js`, "'use strict';\n" + lines.slice(from - 1, to).join('\n') + '\n');
const tags = parts.map(([name]) => `<script src="src/engine/${name}.js"></script>`);
lines.splice(658, 2745 - 658, ...tags);
writeFileSync('index.html', lines.join('\n'));
console.log(`wrote ${parts.length} engine files`);
