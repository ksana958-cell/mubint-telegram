type TelegramApp = {
  initData: string; ready: () => void; expand: () => void; setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void; setBottomBarColor?: (color: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
};
declare global { interface Window { Telegram?: { WebApp: TelegramApp } } }
export const botLink = 'https://t.me/RaspisanieMuBINT_bot';
export const telegram = () => window.Telegram?.WebApp;
export function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const data = telegram()?.initData;
  if (data) headers.set('Authorization', `tma ${data}`);
  return fetch(input, { ...init, headers });
}
let namespace = 'guest';
const memory = new Map<string, string>();
export const storage = {
  getItem(key: string) { const scoped = `campus.${namespace}.${key}`; try { return localStorage.getItem(scoped) ?? memory.get(scoped) ?? null; } catch { return memory.get(scoped) ?? null; } },
  setItem(key: string, value: string) { const scoped = `campus.${namespace}.${key}`; memory.set(scoped, value); try { localStorage.setItem(scoped, value); } catch { /* Memory keeps the current session usable. */ } }
};
export async function initializeTelegram() {
  const tg = telegram();
  if (!tg?.initData) return '';
  tg.ready(); tg.expand();
  if (tg.isVersionAtLeast?.('6.1')) { tg.setHeaderColor?.('#172f40'); tg.setBackgroundColor?.('#f6f8fa'); }
  if (tg.isVersionAtLeast?.('7.10')) tg.setBottomBarColor?.('#ffffff');
  try {
    const response = await apiFetch('/api/profile', { signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) return data.error || 'Не удалось войти через Telegram. Закрой и снова открой приложение.';
    namespace = data.user.id;
    if (data.group) {
      storage.setItem('mubint.group', data.group);
      let choices: Record<string, string> = {};
      try { choices = JSON.parse(storage.getItem('mubint.sports') || '{}'); } catch { /* Recover corrupted local preferences. */ }
      storage.setItem('mubint.sports', JSON.stringify({ ...choices, [data.group]: data.sport }));
    }
    return '';
  } catch { return 'Нет связи с сервером. Расписание доступно, а личные задания загрузятся после восстановления соединения.'; }
}
