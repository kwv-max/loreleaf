// 제작자 후원 링크. 링크가 있는 것만 보이고, 하나도 없으면 후원 자리 자체가 안 보인다.
// 링크가 생기면 url만 채우면 된다.
import { h, sheet } from './ui.js';

export const SUPPORT = [
  { label: 'Ko-fi', sub: 'R Leaf Studio · PayPal', url: 'https://ko-fi.com/rleafstudio' },
  { label: '포스타입', sub: '국내', url: '' },
];

export const supportLinks = () => SUPPORT.filter((s) => s.url);

export function supportSheet() {
  const list = supportLinks();
  if (!list.length) return;
  sheet(h('div', { class: 'support-sheet' },
    h('p', { class: 'muted small' }, '갈피는 무료예요. 마음이 닿으면 편한 곳으로 보내 주세요.'),
    list.map((s) => h('a', { class: 'support-row', href: s.url, target: '_blank', rel: 'noopener' },
      h('b', null, s.label), h('span', { class: 'muted small' }, s.sub)))),
  { title: '제작자 후원하기' });
}
