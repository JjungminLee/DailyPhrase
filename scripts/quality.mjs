import { readJson } from '../src/config.mjs';

const { feeds } = await readJson('config/feeds.json');
const cases = await readJson('data/inputs.json');
const errors = [];
if (cases.length !== 20) errors.push(`Expected 20 input cases; found ${cases.length}.`);
for (const [i, item] of cases.entries()) {
  if (
    !item.id ||
    !item.feed_id ||
    !['en', 'zh', 'fr', 'ja'].includes(item.language) ||
    !['short', 'medium', 'long'].includes(item.size_class) ||
    !['success', 'blocked'].includes(item.expected)
  )
    errors.push(`Case ${i + 1} has invalid fields.`);
  if (item.expected === 'blocked' && !item.block_reason)
    errors.push(`Blocked case ${item.id} needs block_reason.`);
  if (!item.article_url && !feeds.some((f) => f.id === item.feed_id && f.verified))
    errors.push(`Case ${item.id} references an unverified feed.`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Validated ${cases.length} cases.`);
