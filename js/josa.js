// 받침에 따라 한국어 조사 고르기: josa('유나', '을', '를') → '를'
// (언어 파일 ko.js에서도 쓰므로 다른 것을 불러오지 않는 작은 모듈로 둔다)
export function josa(word, withFinal, withoutFinal) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  const hasFinal = c >= 0xac00 && c <= 0xd7a3
    ? (c - 0xac00) % 28 !== 0
    : /[013678lmnr]$/i.test(String(word).trim()); // 숫자·영문은 읽는 소리로 대강 판단
  return hasFinal ? withFinal : withoutFinal;
}
