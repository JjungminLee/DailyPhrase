import styled from '@emotion/styled';

export const Surface = styled.section({
  background: 'var(--dp-color-surface)',
  border: '1px solid var(--dp-color-border)',
  borderRadius: 'var(--dp-radius-md)',
  boxShadow: 'var(--dp-shadow-card)',
  marginBottom: 'var(--dp-space-4)',
  padding: 'var(--dp-space-5)',
});

export const FormSurface = styled.form({
  background: 'var(--dp-color-surface)',
  border: '1px solid var(--dp-color-border)',
  borderRadius: 'var(--dp-radius-md)',
  boxShadow: 'var(--dp-shadow-card)',
  marginBottom: 'var(--dp-space-4)',
  padding: 'var(--dp-space-5)',
});

export const Eyebrow = styled.span({
  color: 'var(--dp-color-accent)',
  font: '600 10px var(--dp-font-mono)',
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
});

export const ActionButton = styled.button<{ tone?: 'primary' | 'secondary' }>(
  ({ tone = 'secondary' }) => ({
    minHeight: '42px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--dp-space-2)',
    padding: '0 var(--dp-space-4)',
    border: tone === 'primary' ? '1px solid transparent' : '1px solid var(--dp-color-border)',
    borderRadius: 'var(--dp-radius-sm)',
    color: tone === 'primary' ? '#fff' : 'var(--dp-color-ink)',
    background: tone === 'primary' ? 'var(--dp-color-accent)' : 'var(--dp-color-surface)',
    font: '600 13px var(--dp-font-body)',
    cursor: 'pointer',
    transition: 'transform var(--dp-motion-fast), box-shadow var(--dp-motion-fast)',
    '&:hover:not(:disabled)': { transform: 'translateY(-1px)', boxShadow: 'var(--dp-shadow-card)' },
    '&:disabled': { cursor: 'wait', opacity: 0.62 },
  }),
);

export const TextField = styled.input({
  minHeight: '42px',
  width: '100%',
  minWidth: 0,
  padding: '0 var(--dp-space-3)',
  border: '1px solid var(--dp-color-border)',
  borderRadius: 'var(--dp-radius-sm)',
  color: 'var(--dp-color-ink)',
  background: 'var(--dp-color-surface)',
  font: '13px var(--dp-font-body)',
  '&:focus-visible': { outline: '3px solid var(--dp-color-focus)', outlineOffset: '2px' },
});

export const SelectField = styled.select({
  minHeight: '42px',
  width: '100%',
  minWidth: 0,
  padding: '0 var(--dp-space-3)',
  border: '1px solid var(--dp-color-border)',
  borderRadius: 'var(--dp-radius-sm)',
  color: 'var(--dp-color-ink)',
  background: 'var(--dp-color-surface)',
  font: '13px var(--dp-font-body)',
  '&:focus-visible': { outline: '3px solid var(--dp-color-focus)', outlineOffset: '2px' },
});
