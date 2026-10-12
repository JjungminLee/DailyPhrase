export type LanguageMeta = { flag: string; label: string; subtitle: string };

export const languageMeta: Record<string, LanguageMeta> = {
  en: { flag: '🇺🇸', label: 'English', subtitle: '영어' },
  zh: { flag: '🇹🇼', label: '中文', subtitle: '중국어' },
  fr: { flag: '🇫🇷', label: 'Français', subtitle: '프랑스어' },
  ja: { flag: '🇯🇵', label: '日本語', subtitle: '일본어' },
};

export function seoulDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
