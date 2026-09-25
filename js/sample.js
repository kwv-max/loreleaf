// 샘플 작품. 설명서를 읽지 않아도, 만져보면 앱이 어떻게 도는지 알 수 있도록.
import { put, uid, db } from './store.js';
import { migrateChapter } from './quotes.js';

const CH1 = `루멘에 첫눈이 내리던 밤, 유나는 성채의 서쪽 회랑을 혼자 걷고 있었다.

회랑 끝에서 카이렌이 기다리고 있었다. 부단장의 망토에는 눈이 녹지도 않은 채 쌓여 있었다.

“또 밤 순찰이야? 단장님이 너한테만 이런 일을 시키는 건 이상하지 않아?”

유나는 대답 대신 어깨를 으쓱했다. 기사단 안에서 그녀를 마녀라고 부르는 사람은 적지 않았다. 대놓고 부르는 사람은 카이렌 하나뿐이었지만.

“마녀는 추위를 안 탄다며.”

“그건 소문이고.” 유나가 장갑 낀 손을 비볐다. “추운 건 추워.”

두 사람이 회랑을 돌아설 때, 아래쪽 마당에서 작은 그림자 하나가 뛰어가는 것이 보였다. 미로였다. 성채 부엌에서 심부름을 하는 아이는 이 시간에 밖에 있을 이유가 없었다.

카이렌이 무언가 말하려 했지만, 유나는 이미 난간을 넘고 있었다.`;

const CH2 = `검은 숲은 루멘의 북쪽 성벽 너머에서 시작된다. 기사단원들은 해가 진 뒤엔 그 숲에 들어가지 않는다는 규칙을 지켰다. 유나만 빼고.

미로는 숲 입구의 쓰러진 참나무 아래에 웅크리고 있었다.

“누가 너를 여기로 불렀어?”

“어떤 아저씨가요. 검은 여우를 찾으면 은화를 준다고 했어요.”

유나의 손이 순간 멈췄다. 검은 여우라는 이름을 아는 사람은 기사단 안에서도 손에 꼽았다. 세라핀 단장, 그리고 몇 년 전 그 계약에 입회했던 사람들뿐이었다.

그녀는 품 안의 여우 가면을 확인했다. 가면은 아직 차가웠다. 계약이 깨어나지 않았다는 뜻이었다.

“돌아가자, 미로. 그 아저씨 얼굴은 기억나?”

아이는 고개를 끄덕였다가, 곧 가로저었다. 기억나는데 떠올리려 하면 흐려진다고 했다. 유나는 그게 무슨 뜻인지 알았다. 누군가 이미 이 아이에게 마력을 썼다.`;

const CH3 = `다음 날 아침, 단장실의 난로는 꺼져 있었다.

세라핀은 창가에 선 채 돌아보지 않았다. “숲에 들어갔다고 들었다.”

“아이가 있었습니다.” 유나가 말했다. “그리고 누군가 검은 여우를 찾고 있습니다.”

단장의 어깨가 아주 조금 굳었다. 유나는 그걸 놓치지 않았다. 은빛 단장이라고 불리는 사람이 무언가를 두려워하는 모습은 처음이었다.

“카이렌에게는 말하지 마라.”

“부단장에게 숨길 이유가 있습니까?”

세라핀은 그제야 돌아섰다. “그 계약서에 서명한 사람이 셋이었다. 나, 너, 그리고 한 명 더. 그 사람이 누군지 알게 되기 전까지는, 아무도 믿지 마라.”

유나는 단장실을 나서며 가면을 다시 쓰다듬었다. 이번엔 미지근했다.`;

export function insertSample() {
  const now = Date.now();
  const wid = uid();
  const chapters = [['1화 첫눈', CH1], ['2화 검은 숲', CH2], ['3화 가면 아래', CH3]].map(([title, text], i) => ({
    id: uid(), workId: wid, title, text, order: i + 1, createdAt: now + i, updatedAt: now + i,
  }));
  const folderSide = { id: uid(), workId: wid, type: 'character', parentId: null, name: '조연', createdAt: now };
  const folderPlot = { id: uid(), workId: wid, type: 'memo', parentId: null, name: '플롯 구상', createdAt: now };
  const F = (label, value) => ({ id: uid(), label, value });
  const E = (type, name, o = {}) => ({
    id: uid(), workId: wid, type, name, folderId: null, aliases: [], fields: [], note: '', color: null, createdAt: now, updatedAt: now, ...o,
  });
  const [, c2, c3] = chapters.map((c) => c.id);
  const Ch = (label, value, changes) => ({ ...F(label, value), changes: changes.map(([chapterId, v]) => ({ id: uid(), chapterId, value: v })) });
  const entries = [
    E('character', '유나', {
      color: '#f58fb0', aliases: ['마녀', '검은 여우'],
      fields: [
        F('나이', '21세'),
        Ch('현재 위치', '수도 루멘 성채', [[c2, '검은 숲'], [c3, '수도 루멘 성채 (단장실)']]),
        F('소속', '왕립 기사단'),
        F('가진 물건', '여우 가면'),
        Ch('알고 있는 정보', '없음', [[c2, '누군가 검은 여우를 찾고 있다'], [c3, '계약자가 셋이라는 것']]),
      ],
      note: '밤에만 움직인다. 추위를 잘 타지만 티를 내지 않는다.',
    }),
    E('character', '카이렌', {
      color: '#6fb7f2', aliases: ['부단장'],
      fields: [F('나이', '27세'), F('현재 위치', '수도 루멘'), F('소속', '왕립 기사단 부단장'), F('성격', '원칙주의자. 유나를 마녀라고 놀리지만 제일 먼저 챙긴다.')],
    }),
    E('character', '세라핀', {
      color: '#b99bf5', aliases: ['은빛 단장'],
      fields: [F('나이', '41세'), F('소속', '왕립 기사단 단장'), F('알고 있는 정보', '세 번째 계약자의 정체를 의심하고 있다')],
    }),
    E('character', '미로', {
      color: '#7cc98a', folderId: folderSide.id,
      fields: [F('나이', '9세'), F('소속', '성채 부엌 심부름꾼'), Ch('몸 상태', '건강함', [[c2, '누군가의 마력으로 기억이 흐려짐']])],
    }),
    E('place', '루멘', { fields: [F('위치', '왕국 북부의 수도'), F('특징', '겨울이 길다. 성채가 도시 한가운데 있다.')] }),
    E('place', '검은 숲', { fields: [F('위치', '루멘 북쪽 성벽 너머'), F('분위기', '해가 지면 아무도 들어가지 않는다')] }),
    E('org', '왕립 기사단', { fields: [F('우두머리', '세라핀'), F('본거지', '루멘 성채')] }),
    E('item', '여우 가면', { fields: [F('소유자', '유나'), F('능력', '계약이 깨어나면 따뜻해진다'), Ch('상태', '차가움', [[c3, '미지근함 — 계약이 깨어나는 중']])] }),
    E('world', '마녀의 계약', { fields: [F('요약', '마녀는 계약으로 힘을 얻는다. 계약자는 서로의 이름을 부를 수 없다.')] }),
    E('memo', '2부 방향', { folderId: folderPlot.id, note: '세 번째 계약자는 카이렌? → 너무 뻔한가. 다른 후보도 생각해 보기.' }),
  ];
  const who = (name) => entries.find((e) => e.name === name).id;
  const side = (value, changes = []) => ({ id: uid(), label: '', value, changes: changes.map(([chapterId, v]) => ({ id: uid(), chapterId, value: v })) });
  const relations = [
    { id: uid(), workId: wid, pair: [who('유나'), who('카이렌')], ab: side('잔소리 많은 부단장'), ba: side('마녀라고 놀리지만 제일 먼저 챙기는 후배'), createdAt: now },
    { id: uid(), workId: wid, pair: [who('유나'), who('세라핀')], ab: side('존경하는 단장'), ba: side('믿는 부하', [[c3, '정체를 의심하는 부하']]), createdAt: now },
  ];
  const work = { id: wid, title: '검은 여우의 겨울', sample: true, createdAt: now, updatedAt: now - 1000, lastChapterId: chapters[0].id };

  put('works', work, { touch: false });
  for (const c of chapters) { migrateChapter(c); put('chapters', c, { touch: false }); }
  for (const f of [folderSide, folderPlot]) put('folders', f, { touch: false });
  for (const e of entries) put('entries', e, { touch: false });
  for (const r of relations) put('relations', r, { touch: false });
  return work;
}

export const hasSample = () => [...db.works.values()].some((w) => w.sample);
