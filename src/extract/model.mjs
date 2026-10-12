import { AppError } from '../errors.mjs';

// Provider/model choice is intentionally left open; add the selected adapter here.
export async function extractPhrases() {
  throw new AppError(
    'model_error',
    'No model provider has been configured. See docs/open-questions.md.',
    503,
  );
}
