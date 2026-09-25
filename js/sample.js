// 샘플 작품. 설명서를 읽지 않아도, 만져보면 앱이 어떻게 도는지 알 수 있도록.
// 내용은 화면 언어별 파일(lang/sample.*.js)에. 여기서는 그걸 작품·화·설정으로 만든다.
import { put, uid, db } from './store.js';
import { migrateChapter } from './quotes.js';
import { lang } from './i18n.js';
import ko from './lang/sample.ko.js';
import en from './lang/sample.en.js';
import ja from './lang/sample.ja.js';

const SAMPLES = { ko, en, ja };

export function insertSample() {
  const S = SAMPLES[lang()] || ko;
  const now = Date.now();
  const wid = uid();
  const chapters = S.chapters.map(([title, text], i) => ({
    id: uid(), workId: wid, title, text, order: i + 1, createdAt: now + i, updatedAt: now + i,
  }));
  const folders = {
    side: { id: uid(), workId: wid, type: 'character', parentId: null, name: S.folders.side, createdAt: now },
    plot: { id: uid(), workId: wid, type: 'memo', parentId: null, name: S.folders.plot, createdAt: now },
  };
  // [[몇 번째 화, 값]] → 화 id로
  const changes = (list = []) => list.map(([i, value]) => ({ id: uid(), chapterId: chapters[i].id, value }));
  const entries = S.entries.map((x) => ({
    id: uid(), workId: wid, type: x.type, name: x.name, folderId: x.folder ? folders[x.folder].id : null,
    aliases: x.aliases || [], note: x.note || '', color: x.color || null, createdAt: now, updatedAt: now,
    fields: (x.fields || []).map(([label, value, ch]) => ({ id: uid(), label, value, ...(ch ? { changes: changes(ch) } : {}) })),
  }));
  const who = (key) => entries[S.entries.findIndex((x) => x.key === key)].id;
  const side = ([value, ch]) => ({ id: uid(), label: '', value, changes: changes(ch) });
  const relations = S.relations.map((r) => ({ id: uid(), workId: wid, pair: [who(r.a), who(r.b)], ab: side(r.ab), ba: side(r.ba), createdAt: now }));
  const work = { id: wid, title: S.title, sample: true, createdAt: now, updatedAt: now - 1000, lastChapterId: chapters[0].id };

  put('works', work, { touch: false });
  for (const c of chapters) { migrateChapter(c); put('chapters', c, { touch: false }); }
  for (const f of Object.values(folders)) put('folders', f, { touch: false });
  for (const e of entries) put('entries', e, { touch: false });
  for (const r of relations) put('relations', r, { touch: false });
  return work;
}

export const hasSample = () => [...db.works.values()].some((w) => w.sample);
