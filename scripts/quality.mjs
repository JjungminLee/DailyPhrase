import { readJson } from '../src/config.mjs';

const cases = await readJson('data/inputs.json');
const { feeds } = await readJson('config/default-feeds.json');
const errors = [];
const languages = ['en', 'zh', 'fr', 'ja'];

if (!Array.isArray(cases)) {
  errors.push('data/inputs.json must contain an array.');
} else {
  if (cases.length !== 20) errors.push(`Expected 20 input cases; found ${cases.length}.`);
  for (const language of languages) {
    const count = cases.filter((item) => item.language === language).length;
    if (count !== 5) errors.push(`Expected 5 ${language} cases; found ${count}.`);
  }

  const ids = new Set();
  for (const [i, item] of cases.entries()) {
    const label = item?.id || `case ${i + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`Case ${i + 1} must be an object.`);
      continue;
    }
    if (!item.id || ids.has(item.id)) errors.push(`${label} needs a unique id.`);
    ids.add(item.id);
    if (!item.feed_id || !feeds.some((feed) => feed.id === item.feed_id && feed.verified))
      errors.push(`${label} must reference a verified default feed.`);
    if (!languages.includes(item.language)) errors.push(`${label} has unsupported language.`);
    if (!['short', 'medium', 'long'].includes(item.size_class))
      errors.push(`${label} needs size_class: short, medium, or long.`);
    if (!['success', 'blocked'].includes(item.expected))
      errors.push(`${label} needs expected: success or blocked.`);
    if (!item.article_url && !item.article_text)
      errors.push(`${label} needs article_url or reproducible article_text.`);
    if (item.article_text && item.article_text.length > 40000)
      errors.push(`${label} article_text exceeds the API limit of 40000 characters.`);
    if (!item.source_reference)
      errors.push(`${label} needs source_reference (citation or source URL).`);
    if (item.expected === 'success' && (!Array.isArray(item.expected_phrases) || !item.expected_phrases.length))
      errors.push(`${label} needs reviewed expected_phrases.`);
    if (item.expected === 'blocked' && !item.block_reason)
      errors.push(`${label} needs block_reason.`);
    if (item.reviewed !== true) errors.push(`${label} must be reviewed before it is a quality case.`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${cases.length} reviewed cases (5 per language).`);
}
