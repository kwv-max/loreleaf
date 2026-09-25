// 관계도. 캐릭터는 동그라미, 관계는 선. 사람을 누르면 그 사람의 관계만 진하게 보이고 아래에 목록이 뜬다.
// 처음 자리는 자동으로 잡고(힘 배치), 끌어서 옮긴 자리는 작품에 기억한다 (work.graph = { 캐릭터 id: [x, y] }).
// 배경을 끌면 화면 이동, 두 손가락(또는 휠)으로 확대·축소.
import { h, icon, iconBtn, topbar, actions, josa } from '../ui.js';
import { db, put, chaptersOf } from '../store.js';
import { go, back } from '../router.js';
import { orderOf, valueAt, viewAtFor, setViewAt } from '../timeline.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
};
const clip = (t, n = 14) => (t.length > n ? t.slice(0, n) + '…' : t);

// 힘 배치: 서로 밀어내고, 관계가 있으면 당긴다. 옮겨 둔(고정된) 사람은 그 자리에 둔다.
function layout(nodes, edges, fixed) {
  const P = new Map();
  const n = nodes.length;
  nodes.forEach((v, i) => {
    const f = fixed[v.id];
    const a = (2 * Math.PI * i) / Math.max(n, 1);
    P.set(v.id, f ? { x: f[0], y: f[1], fixed: true } : { x: 500 + 260 * Math.cos(a), y: 500 + 260 * Math.sin(a) });
  });
  const k = 150;
  for (let it = 0; it < 300; it++) {
    const temp = 40 * (1 - it / 300) + 0.5;
    const D = new Map(nodes.map((v) => [v.id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = P.get(nodes[i].id), q = P.get(nodes[j].id);
        let dx = p.x - q.x, dy = p.y - q.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (k * k) / d;
        dx = (dx / d) * f; dy = (dy / d) * f;
        const a = D.get(nodes[i].id), b = D.get(nodes[j].id);
        a.x += dx; a.y += dy; b.x -= dx; b.y -= dy;
      }
    }
    for (const e of edges) {
      const p = P.get(e.a.id), q = P.get(e.b.id);
      const dx = p.x - q.x, dy = p.y - q.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d * d) / k;
      const a = D.get(e.a.id), b = D.get(e.b.id);
      a.x -= (dx / d) * f; a.y -= (dy / d) * f; b.x += (dx / d) * f; b.y += (dy / d) * f;
    }
    for (const v of nodes) {
      const p = P.get(v.id);
      if (p.fixed) continue;
      const d = D.get(v.id);
      d.x += (500 - p.x) * 0.05; d.y += (500 - p.y) * 0.05; // 가운데로 살짝
      const m = Math.hypot(d.x, d.y) || 1;
      p.x += (d.x / m) * Math.min(m, temp);
      p.y += (d.y / m) * Math.min(m, temp);
    }
  }
  return P;
}

export function graphScreen({ wid, eid }) {
  const w = db.works.get(wid);
  if (!w) { go('/', { replace: true }); return null; }
  const order = orderOf(wid);
  let atCid = viewAtFor(wid);
  const atIdx = () => (atCid ? order.get(atCid) : Infinity);
  const chTitle = (id) => db.chapters.get(id)?.title || '';
  let focus = eid && db.entries.has(eid) ? eid : null;

  // 지금 시점의 관계들 (두 줄 다 빈 관계는 그리지 않는다)
  function model() {
    const edges = [];
    for (const r of db.relations.values()) {
      if (r.workId !== wid) continue;
      const a = db.entries.get(r.pair[0]), b = db.entries.get(r.pair[1]);
      if (!a || !b) continue;
      const ab = valueAt(r.ab, atIdx(), order), ba = valueAt(r.ba, atIdx(), order);
      if (!ab.value.trim() && !ba.value.trim()) continue;
      const here = !!atCid && (ab.rec?.chapterId === atCid || ba.rec?.chapterId === atCid);
      edges.push({ r, a, b, ab: ab.value.trim(), ba: ba.value.trim(), here });
    }
    const nodes = [...new Set(edges.flatMap((e) => [e.a, e.b]))];
    return { nodes, edges };
  }
  const anyChanges = () => [...db.relations.values()].some((r) => r.workId === wid && (r.ab.changes?.length || r.ba.changes?.length));

  // ---- 시점 ----
  const atBar = h('div', { class: 'at-bar graph-at' });
  function drawAt() {
    const show = order.size > 1 && (anyChanges() || atCid);
    atBar.hidden = !show;
    if (!show) return;
    atBar.replaceChildren(
      h('span', { class: 'muted small' }, '시점'),
      h('button', {
        class: 'at-btn',
        onclick: () => actions([
          { label: (atCid ? '' : '✓ ') + '최신 (마지막 화까지)', run: () => setAt(null) },
          ...chaptersOf(wid).map((c) => ({ label: (c.id === atCid ? '✓ ' : '') + c.title, run: () => setAt(c.id) })),
        ], '몇 화 시점으로 볼까요?'),
      }, atCid ? chTitle(atCid) : '최신 (마지막 화까지)', icon('down')));
  }
  function setAt(cid) { atCid = cid; setViewAt(wid, cid); drawAt(); relayout(true); } // 시점이 바뀌면 관계도 다시 계산

  // ---- 그림 ----
  const svg = s('svg', { class: 'graph-svg', role: 'img', 'aria-label': '관계도' });
  const stage = h('div', { class: 'graph-stage' }, svg);
  const panel = h('div', { class: 'graph-panel', hidden: true });
  const empty = h('div', { class: 'empty graph-empty', hidden: true },
    icon('people', 'big'),
    h('p', null, '아직 그릴 관계가 없어요.'),
    h('p', { class: 'muted small' }, '캐릭터 설정의 ‘관계’에서 ‘+ 관계 추가’로 적어 보세요.'));

  let P = new Map();   // 캐릭터 id → 화면 좌표 {x, y}
  let fit = null;      // 자동 배치 좌표 ↔ 화면 좌표
  let vb = null;       // 보고 있는 영역 (확대·이동)
  let home = null;     // 전체가 보이는 영역
  let M = { nodes: [], edges: [] };

  const toStage = (p) => ({ x: (p.x - fit.minX) * fit.k + fit.pad, y: (p.y - fit.minY) * fit.k + fit.pad });
  const fromStage = (p) => [(p.x - fit.pad) / fit.k + fit.minX, (p.y - fit.pad) / fit.k + fit.minY];

  function relayout(keepView) {
    M = model();
    const raw = layout(M.nodes, M.edges, w.graph || {});
    const W = stage.clientWidth || 360, H = stage.clientHeight || 520;
    const xs = [...raw.values()].map((p) => p.x), ys = [...raw.values()].map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 56;
    const k = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1), (H - 2 * pad) / Math.max(maxY - minY, 1), 1.1);
    fit = { minX, minY, k, pad };
    P = new Map([...raw].map(([id, p]) => [id, toStage(p)]));
    // 전체가 보이는 자리 (두 번 탭으로 돌아올 곳)
    const cw = (maxX - minX) * k + 2 * pad, chh = (maxY - minY) * k + 2 * pad;
    home = { x: (cw - W) / 2, y: (chh - H) / 2, w: W, h: H };
    if (!keepView || !vb) vb = { ...home };
    else vb = { ...vb, h: vb.w * (H / W) }; // 화면 비율이 바뀌면 viewBox 비율도 맞춘다
    draw();
  }

  function draw() {
    if (!fit) return;
    const touching = (e) => focus && (e.a.id === focus || e.b.id === focus);
    const has = M.nodes.length > 0;
    empty.hidden = has;
    svg.style.display = has ? '' : 'none';
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const lines = M.edges.map((e) => {
      const p = P.get(e.a.id), q = P.get(e.b.id);
      const cls = 'ge' + (e.here ? ' here' : '') + (focus ? (touching(e) ? ' on' : ' dim') : '');
      return s('line', { class: cls, x1: p.x, y1: p.y, x2: q.x, y2: q.y });
    });
    // 선 위 글: 누른 사람의 관계에만 (그 사람이 상대를 보는 말, 없으면 상대가 보는 말)
    const labels = focus ? M.edges.filter(touching).map((e) => {
      const p = P.get(e.a.id), q = P.get(e.b.id);
      const mine = e.a.id === focus ? e.ab : e.ba, theirs = e.a.id === focus ? e.ba : e.ab;
      const t = mine || `← ${theirs}`;
      return s('text', { class: 'gl' + (e.here ? ' here' : ''), x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, clip(t));
    }) : [];
    const degree = (id) => M.edges.filter((e) => e.a.id === id || e.b.id === id).length;
    const nodes = M.nodes.map((v) => {
      const p = P.get(v.id);
      const r = 16 + Math.min(degree(v.id), 6) * 2;
      const near = !focus || v.id === focus || M.edges.some((e) => touching(e) && (e.a.id === v.id || e.b.id === v.id));
      return s('g', { class: 'gn' + (v.id === focus ? ' on' : '') + (near ? '' : ' dim'), 'data-id': v.id, transform: `translate(${p.x} ${p.y})` },
        s('circle', { r, style: `--c:${v.color || 'var(--accent)'}` }),
        s('text', { class: 'gn-name', y: r + 16, 'text-anchor': 'middle' }, v.name));
    });
    svg.replaceChildren(s('g', null, ...lines), s('g', null, ...nodes), s('g', null, ...labels));
    drawPanel();
  }

  // 누른 사람의 관계 목록 (누르면 그 사람으로 옮겨 간다)
  function drawPanel() {
    const v = focus && db.entries.get(focus);
    const mine = v ? M.edges.filter((e) => e.a.id === focus || e.b.id === focus) : [];
    panel.hidden = !v;
    if (!v) return;
    panel.replaceChildren(
      h('div', { class: 'graph-panel-head' },
        h('span', { class: 'dot lg', style: `--c:${v.color}` }),
        h('b', null, v.name),
        h('button', { class: 'link-btn', onclick: () => go(`/w/${wid}/e/${v.id}`) }, '설정 열기', icon('chev')),
        h('button', { class: 'icon-btn sm', 'aria-label': '닫기', onclick: () => { focus = null; draw(); } }, icon('close'))),
      mine.length ? h('div', { class: 'graph-rels' }, mine.map((e) => {
        const o = e.a.id === focus ? e.b : e.a;
        const my = e.a.id === focus ? e.ab : e.ba, th = e.a.id === focus ? e.ba : e.ab;
        return h('button', { class: 'graph-rel' + (e.here ? ' here' : ''), onclick: () => { focus = o.id; draw(); keepVisible(o.id); } },
          h('span', { class: 'dot', style: `--c:${o.color}` }),
          h('span', { class: 'graph-rel-name' }, o.name),
          h('span', { class: 'graph-rel-text' },
            my ? h('span', null, my) : null,
            th ? h('span', { class: 'muted' }, `${o.name}${josa(o.name, '이', '가')} 보기엔: ${th}`) : null));
      })) : h('p', { class: 'muted small' }, '이 시점에는 관계가 없어요.'));
  }

  // ---- 손가락 (그림 앱처럼) ----
  // 두 손가락: 손가락 사이에 있던 그림이 손가락을 그대로 따라온다 (확대·축소·이동이 한 번에).
  // 한 손가락: 빈 곳은 이동(놓으면 살짝 미끄러짐), 사람은 끌어서 옮기기. 빈 곳 두 번 탭: 확대 ↔ 전체.
  const setVB = (v) => { vb = v; svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); };
  const box = () => svg.getBoundingClientRect();
  // 화면 좌표 ↔ 그림 좌표 (viewBox 비율은 화면 비율과 늘 같게 유지한다)
  const toSvg = (x, y, v = vb) => { const r = box(); const u = v.w / r.width; return { x: v.x + (x - r.left) * u, y: v.y + (y - r.top) * u }; };
  const clampW = (wd) => { const r = box(); return Math.min(Math.max(wd, r.width / 4), r.width * 4); }; // 4배 확대 ~ 4배 축소
  const pts = new Map(); // pointerId → {x, y}
  let g = null;          // 진행 중인 동작
  let fling = 0;         // 미끄러짐 애니메이션
  let lastTap = null;    // 두 번 탭 판정

  function startPinch() {
    const [a, b] = [...pts.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    g = { type: 'pinch', d0: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), w0: vb.w, c: toSvg(mid.x, mid.y) };
  }
  function startPan(p) { g = { type: 'pan', sx: p.x, sy: p.y, vb0: { ...vb }, moved: true, trail: [] }; }

  svg.addEventListener('pointerdown', (ev) => {
    cancelAnimationFrame(fling);
    svg.setPointerCapture(ev.pointerId);
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size === 2) { startPinch(); return; }
    if (pts.size > 2) return;
    const node = ev.target.closest('.gn');
    g = { type: node ? 'node' : 'pan', id: node?.dataset.id, sx: ev.clientX, sy: ev.clientY, vb0: { ...vb }, moved: false, trail: [] };
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!pts.has(ev.pointerId) || !g) return;
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (g.type === 'pinch') {
      if (pts.size < 2) return;
      const [a, b] = [...pts.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = box();
      const nw = clampW(g.w0 * (g.d0 / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1)));
      const u = nw / r.width;
      // 처음 손가락 사이에 있던 그림 점(c)이 지금 손가락 가운데에 오도록
      setVB({ x: g.c.x - (mid.x - r.left) * u, y: g.c.y - (mid.y - r.top) * u, w: nw, h: nw * (r.height / r.width) });
      return;
    }
    const dx = ev.clientX - g.sx, dy = ev.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    g.moved = true;
    if (g.type === 'pan') {
      const u = g.vb0.w / box().width;
      setVB({ ...g.vb0, x: g.vb0.x - dx * u, y: g.vb0.y - dy * u });
      g.trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
      if (g.trail.length > 5) g.trail.shift();
    } else if (g.type === 'node') {
      P.set(g.id, toSvg(ev.clientX, ev.clientY));
      draw();
    }
  });

  // 손을 놓을 때의 속도로 살짝 미끄러지다 멈춘다
  function flingFrom(trail) {
    if (trail.length < 2) return;
    const a = trail[0], b = trail[trail.length - 1];
    const dt = Math.max(b.t - a.t, 1);
    if (performance.now() - b.t > 80) return; // 멈췄다가 놓았으면 그대로
    let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt; // px/ms
    let prev = performance.now();
    const step = (now) => {
      const t = Math.min(now - prev, 32); prev = now;
      const u = vb.w / box().width;
      setVB({ ...vb, x: vb.x - vx * t * u, y: vb.y - vy * t * u });
      vx *= Math.pow(0.95, t / 16); vy *= Math.pow(0.95, t / 16);
      if (Math.hypot(vx, vy) > 0.02) fling = requestAnimationFrame(step);
    };
    fling = requestAnimationFrame(step);
  }

  // 빈 곳 두 번 탭: 확대돼 있으면 전체로, 아니면 그 자리를 두 배로
  function zoomAt(x, y, factor) {
    const c = toSvg(x, y);
    const r = box();
    const nw = clampW(vb.w / factor);
    const u = nw / r.width;
    setVB({ x: c.x - (x - r.left) * u, y: c.y - (y - r.top) * u, w: nw, h: nw * (r.height / r.width) });
  }

  const up = (ev) => {
    const p = pts.get(ev.pointerId);
    pts.delete(ev.pointerId);
    if (!g) return;
    if (g.type === 'pinch') {
      // 한 손가락만 남으면 그 손가락으로 이어서 이동 (튀지 않게 지금 자리에서 새로 시작)
      if (pts.size === 1) startPan([...pts.values()][0]);
      else if (pts.size === 0) g = null;
      return;
    }
    if (pts.size) return;
    if (g.type === 'node' && g.moved) {
      // 옮긴 자리를 기억 (자동 배치 좌표로 바꿔서)
      (w.graph ||= {})[g.id] = fromStage(P.get(g.id));
      put('works', w, { touch: false });
    } else if (g.type === 'pan' && g.moved) {
      if (ev.type === 'pointerup') flingFrom(g.trail);
    } else if (!g.moved && ev.type === 'pointerup' && p) {
      const now = performance.now();
      if (g.type === 'pan' && lastTap && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
        lastTap = null;
        if (vb.w < home.w * 0.9) setVB({ ...home }); else zoomAt(p.x, p.y, 2);
      } else {
        lastTap = g.type === 'pan' ? { x: p.x, y: p.y, t: now } : null;
        focus = g.type === 'node' ? (focus === g.id ? null : g.id) : null;
        draw();
        if (focus) keepVisible(focus);
      }
    }
    g = null;
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  // PC: 트랙패드 두 손가락·휠은 이동, 트랙패드 오므리기(=Ctrl+휠)는 커서 아래를 기준으로 확대·축소
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    cancelAnimationFrame(fling);
    const px = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? box().height : 1; // 줄·쪽 단위를 픽셀로
    if (ev.ctrlKey || ev.metaKey) {
      zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * px * 0.01));
    } else {
      const u = vb.w / box().width;
      setVB({ ...vb, x: vb.x + ev.deltaX * px * u, y: vb.y + ev.deltaY * px * u });
    }
  }, { passive: false });

  // 아래 목록에 가려질 자리라면, 누른 사람이 위쪽에 보이게 화면을 옮긴다
  function keepVisible(id) {
    const p = P.get(id);
    if (!p) return;
    const covered = panel.offsetHeight / (svg.clientHeight || 1); // 목록이 가리는 비율
    const y = (p.y - vb.y) / vb.h;
    if (y < 1 - covered - 0.08) return;
    vb = { ...vb, y: p.y - vb.h * Math.max(0.3, (1 - covered) / 2) };
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  function menu() {
    actions([
      { label: '자리 다시 잡기', run: () => { delete w.graph; put('works', w, { touch: false }); relayout(false); } },
      { label: '전체가 보이게', run: () => relayout(false) },
    ], '관계도');
  }

  drawAt();
  const el = h('div', { class: 'screen graph-screen' },
    topbar({ onBack: () => back(`/w/${wid}/lore`), title: '관계도', right: [iconBtn('more', '관계도 메뉴', menu)] }),
    atBar,
    h('main', { class: 'graph-main' }, stage, empty, panel));
  // 크기가 정해진 뒤에 배치
  setTimeout(() => relayout(false), 0);
  const onResize = () => relayout(true);
  window.addEventListener('resize', onResize);
  el.cleanup = () => window.removeEventListener('resize', onResize);
  return el;
}
