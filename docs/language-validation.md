# Phrase language validation

Phrase validation checks the sentence containing each candidate expression against the requested language. It scores configured writing-system signatures and language markers from `config/languages.json`. A candidate is dropped when another configured language scores at least three points higher. The check is intentionally conservative for short, ambiguous, or code-switched text.

When adding a language, add it under `languages` in `config/languages.json` and define:

- `script_signatures`: Unicode script names that occur in that language, such as `Cyrillic`, `Arabic`, or `Han`.
- `language_markers`: whole-word tokens that distinguish it from languages using the same script.
- `text_markers`: distinctive substrings for languages without whitespace-delimited words, when needed.

Keep marker lists distinctive. Common words shared with another configured language can make the detector less useful. Add mixed-language regression cases to `scripts/phrase-language-harness.mjs` and run them with `npm run harness:language` when validating a language change.
