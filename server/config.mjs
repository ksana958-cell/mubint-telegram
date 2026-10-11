import { resolve } from 'node:path';
export function readConfig(env = process.env) {
  const candidate = env.APP_URL?.trim() || (env.DOMAIN?.trim() ? `https://${env.DOMAIN.trim().replace(/^https?:\/\//, '')}` : '');
  let appUrl = '';
  if (candidate) {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('APP_URL должен быть HTTPS-адресом приложения без пути и параметров.');
    appUrl = url.origin;
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Неверный PORT.');
  const anchor = env.SCHEDULE_ANCHOR_DATE || '2026-10-12';
  if (!/^20\d\d-\d\d-\d\d$/.test(anchor) || new Date(`${anchor}T12:00:00Z`).toISOString().slice(0, 10) !== anchor) throw new Error('Неверный SCHEDULE_ANCHOR_DATE.');
  return { port, appUrl, token: env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || env.API_TOKEN || '', username: env.BOT_USERNAME || 'RaspisanieMuBINT_bot',
    databasePath: env.DATABASE_PATH || resolve('data/campus.sqlite'), anchor, background: env.DISABLE_BACKGROUND !== '1' };
}
