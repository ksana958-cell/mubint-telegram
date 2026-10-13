import type { Appearance } from '@/lib/student';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export const SEASON_EVENT = 'campus:seasonchange';
export const seasonNames: Record<Season, string> = { winter: 'Зима', spring: 'Весна', summer: 'Лето', autumn: 'Осень' };
const monthInMoscow = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', month: 'numeric' });
export function getSeason(date = new Date()): Season {
  const month = Number(monthInMoscow.format(date));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}
export function currentSeason(): Season {
  const value = document.documentElement.dataset.season;
  return value && Object.hasOwn(seasonNames, value) ? value as Season : getSeason();
}
export function currentAppearance(): Appearance {
  const value = document.documentElement.dataset.themeMode;
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function themeColors() {
  const style = getComputedStyle(document.documentElement);
  return { header: style.getPropertyValue('--navy').trim(), background: style.getPropertyValue('--bg').trim(), bottom: style.getPropertyValue('--surface').trim() };
}
function refreshTheme() {
  const root = document.documentElement, mode = currentAppearance();
  const scheme = window.Telegram?.WebApp.initData ? window.Telegram.WebApp.colorScheme : undefined;
  const appearance = mode === 'system' ? scheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
  const season = getSeason();
  if (root.dataset.season === season && root.dataset.appearance === appearance) return;
  root.dataset.season = season; root.dataset.appearance = appearance;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors().header);
  window.dispatchEvent(new Event(SEASON_EVENT));
}
export function setAppearance(mode: Appearance) {
  document.documentElement.dataset.themeMode = mode;
  try { localStorage.setItem('campus.appearance', mode); } catch { /* Theme still applies to the current session. */ }
  refreshTheme();
}
export function startSeasonTheme() {
  try { const value = localStorage.getItem('campus.appearance'); if (value && ['system', 'light', 'dark'].includes(value)) document.documentElement.dataset.themeMode = value; } catch { /* System theme by default. */ }
  refreshTheme();
  const refresh = () => { if (document.visibilityState !== 'hidden') refreshTheme(); };
  const media = window.matchMedia('(prefers-color-scheme: dark)'), tg = window.Telegram?.WebApp;
  media.addEventListener('change', refresh); tg?.onEvent?.('themeChanged', refresh);
  const timer = window.setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
  return () => { window.clearInterval(timer); media.removeEventListener('change', refresh); tg?.offEvent?.('themeChanged', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); };
}
