// 글이 바뀌었을 때, 글에 붙어 있는 것들(대사 줄 표시, 주석)이 제자리를 따라가게 하는 계산.

// 바뀐 구간: 공통 앞부분 p, 옛 글의 바뀐 끝 oEnd, 새 글의 바뀐 끝 nEnd.
// caret(입력 직후 커서)으로 모호한 경우(같은 글자가 이어질 때)를 입력 위치 쪽으로 맞춘다.
export function diffRange(O, N, caret = N.length) {
  const max = Math.min(O.length, N.length);
  let p = 0;
  while (p < max && O[p] === N[p]) p++;
  p = Math.min(p, caret);
  const smax = Math.min(O.length - p, N.length - Math.max(p, caret));
  let s = 0;
  while (s < smax && O[O.length - 1 - s] === N[N.length - 1 - s]) s++;
  return { p, oEnd: O.length - s, nEnd: N.length - s };
}

// 구간 [start, end)를 바뀐 글에 맞게 옮긴다.
//  - 구간 안에서 고치면 구간이 늘거나 줄고
//  - 구간 바로 뒤에 이어 써도 구간에 들어가지 않고
//  - 구간의 글이 다 지워지면 길이 0이 된다 (주석은 남아 있고 '지워진 글'로 표시)
export function remapRange(r, d) {
  if (d.p === d.oEnd && d.p === d.nEnd) return r;
  const delta = d.nEnd - d.oEnd;
  const mapStart = (x) => (x < d.p ? x : x >= d.oEnd ? x + delta : d.p);
  const mapEnd = (x) => (x <= d.p ? x : x >= d.oEnd ? x + delta : d.nEnd);
  const start = mapStart(r.start);
  const end = Math.max(start, mapEnd(r.end));
  return start === r.start && end === r.end ? r : { ...r, start, end };
}
