// Simple i18n for Electron main process (no React)
import { app } from 'electron';
import { readStore } from './store';
import zhCN from '../src/locales/zh-CN.json';
import en from '../src/locales/en.json';

type TranslationMap = Record<string, any>;

const translations: Record<string, TranslationMap> = {
  'zh-CN': zhCN,
  'zh': zhCN,
  'en': en,
};

function getLanguage(): string {
  // Check user preference first
  const store = readStore();
  if (store.settings?.language) return store.settings.language;
  // Fall back to system locale
  const locale = app.getLocale();
  if (locale.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function t(key: string, params?: Record<string, string | number>): string {
  const lang = getLanguage();
  const dict = translations[lang] || translations['en'];
  
  // Navigate nested keys like 'menu.quit'
  const parts = key.split('.');
  let value: any = dict;
  for (const part of parts) {
    value = value?.[part];
  }
  
  if (typeof value !== 'string') {
    // Fallback to English
    value = translations['en'];
    for (const part of parts) {
      value = value?.[part];
    }
  }
  
  if (typeof value !== 'string') return key;
  
  // Simple interpolation: {{key}}
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => String(params[k] ?? k));
  }
  return value;
}

export function getSpeechLines(type: 'idle' | 'active' | 'error'): string[] {
  const lang = getLanguage();
  const dict = translations[lang] || translations['en'];
  return dict?.speech?.[type] || [];
}
