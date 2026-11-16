export function projectSummary(description) {
  const sentences=new Intl.Segmenter('en',{granularity:'sentence'}).segment(description);
  return sentences[Symbol.iterator]().next().value?.segment.trim() || '';
}
