export const percentile = (values, p) =>
  values.length
    ? [...values].sort((a, b) => a - b)[
        Math.min(values.length - 1, Math.ceil(values.length * p) - 1)
      ]
    : 0;
export const summary = (values) => ({
  count: values.length,
  p50_ms: percentile(values, 0.5),
  p95_ms: percentile(values, 0.95),
});
