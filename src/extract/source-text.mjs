const hasHan = (text) => /\p{Script=Han}/u.test(text);
const hasKana = (text) => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
const countMatches = (text, pattern) => (text.match(pattern) || []).length;
const compactCjkSpacing = (line) => line.replace(/\s+/gu, '');

// Multilingual learning pages often place the lesson beside its English
// translation or romanization. Keep only readable paragraphs in the target
// writing system before sending them to the model.
export function originalLanguageText(text, language, languageConfig = {}) {
  if (language !== 'zh' && language !== 'ja') return text;
  const lines = String(text || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return text;

  if (language === 'zh') {
    const translationStart = lines.findIndex((line) =>
      /\bshow\s+english\s+translation\b/i.test(line),
    );
    const sourceLines = translationStart >= 0 ? lines.slice(0, translationStart) : lines;
    const chineseLines = sourceLines
      .filter((line) => hasHan(line) && !hasKana(line) && !/\p{Script=Latin}/u.test(line))
      .map(compactCjkSpacing);
    return chineseLines.length >= 2 ? chineseLines.join('\n') : text;
  }

  const markers = languageConfig.text_markers || [];
  const japaneseLines = lines
    .filter((line) => {
      const japaneseChars = countMatches(
        line,
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,
      );
      const latinChars = countMatches(line, /\p{Script=Latin}/gu);
      return (
        hasKana(line) &&
        japaneseChars >= latinChars * 2 &&
        (japaneseChars >= 3 || markers.some((marker) => line.includes(marker)))
      );
    })
    .map(compactCjkSpacing);
  return japaneseLines.length >= 2 ? japaneseLines.join('\n') : text;
}
