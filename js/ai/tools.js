// AI 도우미가 쓰는 도구. 읽기 도구와 제안 도구(propose_*)뿐 — 작품 데이터를 직접 바꾸는 도구는 없다.
// 제안은 카드로 쌓여서, 사용자가 '추가'·'반영'을 눌러야 저장된다 (ai/ask.js).
// 원고를 통째로 보내지 않고, 도우미가 필요한 화·설정만 골라 읽게 한다.
// 화는 '몇 번째 화'(1부터)로 부른다. 줄 번호도 1부터이고, 인용 표시 [화:줄]과 맞는다.
import { db, chaptersOf, typeOf, typesOf, relationsOf, sidesFor, otherOf } from '../store.js';
import { manuscriptText } from '../quotes.js';
import { orderOf, valueAt, historyOf } from '../timeline.js';

const MAX_LINES = 300;
const MAX_HITS = 40;

// 회사마다 스키마 지원 범위가 달라서, 가장 단순한 모양(문자열·정수, 필수 목록)만 쓴다
export const TOOLS = [
  {
    name: 'list_chapters',
    description: 'List the chapters of this work in order: number, title, number of lines, and part titles.',
    params: {},
  },
  {
    name: 'read_chapter',
    description: `Read a chapter's text with 1-based line numbers. Dialogue lines include their quote marks. Long chapters are returned ${MAX_LINES} lines at a time; use from_line to continue.`,
    params: {
      chapter: { type: 'integer', description: 'Chapter number (1 = first chapter), as in list_chapters.' },
      from_line: { type: 'integer', description: 'First line to return (default 1).' },
      to_line: { type: 'integer', description: 'Last line to return (optional).' },
    },
    required: ['chapter'],
  },
  {
    name: 'search_text',
    description: `Find a word or phrase in the whole manuscript (case-insensitive). Returns up to ${MAX_HITS} hits as chapter:line with the line text.`,
    params: { query: { type: 'string', description: 'Text to find.' } },
    required: ['query'],
  },
  {
    name: 'list_entries',
    description: 'List the world notes of this work (characters, places, organizations, items, and other categories) with their category and aliases.',
    params: { category: { type: 'string', description: 'Optional: only this category (its name as shown in the list).' } },
  },
  {
    name: 'read_entry',
    description: 'Read one world note in full: fields, how fields change by chapter, note, aliases, and relationships. Give as_of_chapter to see the values as of that chapter.',
    params: {
      name: { type: 'string', description: 'The entry name or one of its aliases.' },
      as_of_chapter: { type: 'integer', description: 'Optional chapter number to view values as of that chapter.' },
    },
    required: ['name'],
  },
  {
    name: 'propose_entry',
    description: 'Suggest adding a new world note (a character, place, item, etc.). The author sees it as a card and decides whether to add it; nothing is saved unless they accept. Only for names that appear in the manuscript and are not in the notes yet.',
    params: {
      category: { type: 'string', description: 'Category name as shown by list_entries (e.g. the name for characters, places, items).' },
      name: { type: 'string', description: 'Entry name, exactly as written in the manuscript.' },
      aliases: { type: 'string', description: 'Optional other names, separated by commas.' },
      fields: { type: 'string', description: 'Optional facts from the manuscript, one per line as "label: value". Use the author\'s language for labels.' },
      note: { type: 'string', description: 'Optional short note.' },
      reason: { type: 'string', description: 'One short sentence for the author: why you suggest it, with a [chapter:line] citation.' },
    },
    required: ['category', 'name', 'reason'],
  },
  {
    name: 'propose_entry_change',
    description: 'Suggest changing one field of an existing world note, e.g. because the manuscript says otherwise. With from_chapter, it is recorded as a change from that chapter on (earlier chapters keep the old value). The author accepts or dismisses the card; nothing is saved unless they accept.',
    params: {
      name: { type: 'string', description: 'Existing entry name or alias.' },
      field: { type: 'string', description: 'Field label. A new field is added if the entry has none with this label.' },
      value: { type: 'string', description: 'New value.' },
      from_chapter: { type: 'integer', description: 'Optional chapter number the value applies from. Omit to change the base value.' },
      reason: { type: 'string', description: 'One short sentence for the author with a [chapter:line] citation.' },
    },
    required: ['name', 'field', 'value', 'reason'],
  },
];

const MAX_PROPOSALS = 8; // 한 번 묻기에 카드가 너무 많이 쌓이지 않게

// 도구 실행 → 모델에게 돌려줄 글. 잘못 부르면 Error를 던지고, 부르는 쪽이 오류 결과로 돌려준다.
// ctx.proposals: 이번 묻기에서 나온 제안을 모으는 곳
export function runTool(wid, name, input = {}, ctx = {}) {
  const chs = chaptersOf(wid);
  const chapterAt = (n) => {
    const c = chs[(n | 0) - 1];
    if (!c) throw new Error(`No chapter ${n}. This work has chapters 1–${chs.length}.`);
    return c;
  };
  const label = (i) => `${i + 1}. ${chs[i].title}`;
  const entries = [...db.entries.values()].filter((e) => e.workId === wid && e.name.trim());

  switch (name) {
    case 'list_chapters':
      if (!chs.length) return 'This work has no chapters yet.';
      return chs.map((c, i) => `${c.part ? `[Part: ${c.part}]\n` : ''}${label(i)} (${c.text ? c.text.split('\n').length : 0} lines)`).join('\n');

    case 'read_chapter': {
      const c = chapterAt(input.chapter);
      const lines = manuscriptText(c).split('\n');
      const from = Math.max(1, input.from_line | 0 || 1);
      const to = Math.min(lines.length, input.to_line | 0 || lines.length, from + MAX_LINES - 1);
      const body = lines.slice(from - 1, to).map((l, k) => `${from + k}: ${l}`).join('\n');
      const more = to < lines.length ? `\n[Lines ${to + 1}–${lines.length} not shown. Call again with from_line=${to + 1}.]` : '';
      return `Chapter ${input.chapter | 0}: ${c.title} (${lines.length} lines)\n${body}${more}`;
    }

    case 'search_text': {
      const q = String(input.query || '').trim().toLowerCase();
      if (!q) throw new Error('query is empty.');
      const hits = [];
      let total = 0;
      chs.forEach((c, i) => {
        c.text.split('\n').forEach((l, k) => {
          if (!l.toLowerCase().includes(q)) return;
          total++;
          if (hits.length < MAX_HITS) hits.push(`[${i + 1}:${k + 1}] ${l.length > 220 ? l.slice(0, 220) + '…' : l}`);
        });
      });
      if (!total) return `No matches for "${input.query}".`;
      return `${total} matching line(s)${total > hits.length ? `, first ${hits.length} shown` : ''}:\n${hits.join('\n')}`;
    }

    case 'list_entries': {
      const want = String(input.category || '').trim().toLowerCase();
      const list = entries.filter((e) => !want || typeOf(e.type, wid).label.toLowerCase() === want);
      if (!list.length) return want ? `No entries in category "${input.category}".` : 'This work has no world notes yet.';
      return list.map((e) => `${e.name} — ${typeOf(e.type, wid).label}${e.aliases?.length ? ` (aliases: ${e.aliases.join(', ')})` : ''}`).join('\n');
    }

    case 'read_entry': {
      const q = String(input.name || '').trim();
      const e = entries.find((x) => x.name === q) || entries.find((x) => (x.aliases || []).includes(q))
        || entries.find((x) => x.name.toLowerCase() === q.toLowerCase());
      if (!e) throw new Error(`No entry named "${q}". Use list_entries to see the names.`);
      const order = orderOf(wid);
      const at = input.as_of_chapter ? (input.as_of_chapter | 0) - 1 : Infinity;
      if (input.as_of_chapter) chapterAt(input.as_of_chapter);
      const chNo = (cid) => (order.has(cid) ? order.get(cid) + 1 : '?');
      const out = [`${e.name} — ${typeOf(e.type, wid).label}`];
      if (e.aliases?.length) out.push(`Aliases: ${e.aliases.join(', ')}`);
      if (input.as_of_chapter) out.push(`Values as of chapter ${input.as_of_chapter | 0}:`);
      for (const f of e.fields) {
        const v = valueAt(f, at, order).value;
        out.push(`- ${f.label || '(no label)'}: ${v || '(empty)'}`);
        const hist = historyOf(f, order);
        if (hist.length > 1) out.push(`  changes: ${hist.map((x) => `${x.idx < 0 ? 'start' : `from ch.${x.idx + 1}`} → ${x.value || '(empty)'}`).join('; ')}`);
      }
      if (e.note?.trim()) out.push(`Note: ${e.note.trim()}`);
      const rels = relationsOf(e.id);
      if (rels.length) {
        out.push('Relationships:');
        for (const r of rels) {
          const other = db.entries.get(otherOf(r, e.id));
          if (!other) continue;
          const [mine, theirs] = sidesFor(r, e.id);
          const side = (s) => {
            const v = valueAt(s, at, order).value;
            const ch = (s.changes || []).filter((c) => order.has(c.chapterId)).map((c) => `from ch.${chNo(c.chapterId)}: ${c.value}`);
            return `${v || '(empty)'}${ch.length ? ` [${ch.join('; ')}]` : ''}`;
          };
          out.push(`- ${e.name} → ${other.name}: ${side(mine)}`);
          out.push(`  ${other.name} → ${e.name}: ${side(theirs)}`);
        }
      }
      return out.join('\n');
    }
    case 'propose_entry': {
      const props = (ctx.proposals ||= []);
      if (props.length >= MAX_PROPOSALS) throw new Error('Too many proposals in one answer. Mention the rest in your reply instead.');
      const want = String(input.category || '').trim().toLowerCase();
      const ty = typesOf(wid).find((x) => x.label.toLowerCase() === want || x.key === want);
      if (!ty) throw new Error(`Unknown category "${input.category}". Categories: ${typesOf(wid).map((x) => x.label).join(', ')}.`);
      const nm = String(input.name || '').trim();
      if (!nm) throw new Error('name is empty.');
      if (entries.some((e) => e.name === nm || (e.aliases || []).includes(nm))) throw new Error(`"${nm}" is already in the notes. Use propose_entry_change instead.`);
      if (props.some((p) => p.kind === 'entry' && p.name === nm)) throw new Error(`Already proposed "${nm}".`);
      const clip = (s, n) => String(s || '').trim().slice(0, n);
      const fields = String(input.fields || '').split('\n').map((l) => l.match(/^\s*[-*•]?\s*([^:：]{1,40})[:：]\s*(.+)$/)).filter(Boolean)
        .slice(0, 12).map((m) => [m[1].trim(), clip(m[2], 300)]);
      props.push({
        id: 'p' + props.length, kind: 'entry', type: ty.key, typeLabel: ty.label, name: clip(nm, 80),
        aliases: String(input.aliases || '').split(/[,，、]/).map((x) => x.trim()).filter((x) => x && x !== nm).slice(0, 8),
        fields, note: clip(input.note, 500), reason: clip(input.reason, 300),
      });
      return `Shown to the author as a card (not saved yet — they decide). Do not say it was added.`;
    }

    case 'propose_entry_change': {
      const props = (ctx.proposals ||= []);
      if (props.length >= MAX_PROPOSALS) throw new Error('Too many proposals in one answer. Mention the rest in your reply instead.');
      const q = String(input.name || '').trim();
      const e = entries.find((x) => x.name === q) || entries.find((x) => (x.aliases || []).includes(q));
      if (!e) throw new Error(`No entry named "${q}". Use propose_entry to suggest a new one.`);
      const label = String(input.field || '').trim().slice(0, 40);
      const value = String(input.value ?? '').trim().slice(0, 500);
      if (!label) throw new Error('field is empty.');
      const from = input.from_chapter ? input.from_chapter | 0 : null;
      if (from) chapterAt(from);
      const f = e.fields.find((x) => x.label.trim().toLowerCase() === label.toLowerCase());
      const old = f ? valueAt(f, from ? from - 1 : -1, orderOf(wid)).value : '';
      if (f && old.trim() === value) throw new Error(`"${label}" is already "${value}"${from ? ` as of chapter ${from}` : ''}.`);
      props.push({ id: 'p' + props.length, kind: 'change', entryId: e.id, name: e.name, field: f ? f.label : label, value, from, old, reason: String(input.reason || '').trim().slice(0, 300) });
      return `Shown to the author as a card (not saved yet — they decide). Do not say it was changed.`;
    }

    default:
      throw new Error(`Unknown tool ${name}.`);
  }
}

// 진행 표시용 짧은 설명 (예: '2화 읽는 중')
export function toolLabel(wid, name, input = {}, t) {
  const chs = chaptersOf(wid);
  const title = (n) => chs[(n | 0) - 1]?.title || `#${n}`;
  switch (name) {
    case 'list_chapters': return t('ask.step.chapters');
    case 'read_chapter': return t('ask.step.read', { title: title(input.chapter) });
    case 'search_text': return t('ask.step.search', { q: input.query || '' });
    case 'list_entries': return t('ask.step.entries');
    case 'read_entry': return t('ask.step.entry', { name: input.name || '' });
    case 'propose_entry': case 'propose_entry_change': return t('ask.step.propose');
    default: return name;
  }
}
