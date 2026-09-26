function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
}
const text = "b.tech computer science";
const alias = "b.tech";
const escaped = escapeRegExp(alias);
console.log('Escaped JSON:', JSON.stringify(escaped));
const r = new RegExp('(^|[^a-zA-Z0-9_])' + escaped + '([^a-zA-Z0-9_]|$)', 'i');
console.log('Regex literal:', r.toString());
console.log('Using ^|[^a-zA-Z0-9_]:', r.test(text));
