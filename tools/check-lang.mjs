// 언어 파일 점검: 세 언어의 키가 같은지, 코드에서 쓰는 키가 모두 있는지.
//   node tools/check-lang.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const keysOf = (lang) => new Set([...readFileSync(`js/lang/${lang}.js`, 'utf8').matchAll(/'([\w.]+)':\s/g)].map((m) => m[1]));
const langs = ['ko', 'en', 'ja'];
const keys = Object.fromEntries(langs.map((l) => [l, keysOf(l)]));

// 코드에서 t('...') 로 부르는 키
const used = new Set();
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'lang') walk(p); continue; }
    if (!p.endsWith('.js')) continue;
    const code = readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // 주석 속 예시는 빼고
    for (const m of code.matchAll(/\b(?:t|tr)\(\s*'([\w.]+)'/g)) if (!m[1].endsWith('.')) used.add(m[1]); // 'accent.' + key 처럼 이어 붙이는 건 빼고
  }
};
walk('js');

let bad = 0;
for (const l of langs) {
  const missing = [...keys.ko].filter((k) => !keys[l].has(k));
  const extra = [...keys[l]].filter((k) => !keys.ko.has(k));
  if (missing.length) { bad++; console.log(`${l}: 빠진 키 ${missing.length}개`, missing.slice(0, 20)); }
  if (extra.length) { bad++; console.log(`${l}: 한국어에 없는 키 ${extra.length}개`, extra.slice(0, 20)); }
}
const undef = [...used].filter((k) => !keys.ko.has(k));
if (undef.length) { bad++; console.log(`코드에서 쓰는데 ko.js에 없는 키 ${undef.length}개`, undef.slice(0, 20)); }
// 도움말: 언어마다 항목 id와 줄 수가 같은지
const helpSig = async (l) => (await import(`../js/lang/help.${l}.js`)).default.map((x) => `${x.id}:${x.lines.length}`).join(' ');
const sigKo = await helpSig('ko');
for (const l of ['en', 'ja']) {
  const s = await helpSig(l);
  if (s !== sigKo) { bad++; console.log(`도움말 ${l}: 항목이나 줄 수가 한국어와 달라요\n  ko ${sigKo}\n  ${l} ${s}`); }
}
// 샘플 작품: 언어마다 화·항목·관계 모양이 같은지 (이름과 글은 달라도)
const sampleSig = async (l) => {
  const s = (await import(`../js/lang/sample.${l}.js`)).default;
  return [s.chapters.length, ...s.entries.map((e) => `${e.key}/${e.type}/${e.folder || ''}/${(e.aliases || []).length}/${(e.fields || []).map((f) => (f[2] || []).map((c) => c[0]).join('.')).join(',')}`),
    ...s.relations.map((r) => `${r.a}-${r.b}/${(r.ab[1] || []).length}/${(r.ba[1] || []).length}`)].join(' ');
};
const smKo = await sampleSig('ko');
for (const l of ['en', 'ja']) {
  const s = await sampleSig(l);
  if (s !== smKo) { bad++; console.log(`샘플 ${l}: 모양이 한국어와 달라요\n  ko ${smKo}\n  ${l} ${s}`); }
}
console.log(bad ?'→ 고칠 곳이 있어요' : `→ 이상 없음 (키 ${keys.ko.size}개, 코드에서 쓰는 키 ${used.size}개)`);
process.exit(bad ? 1 : 0);
