import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateInitData } from './auth.mjs';
import { normalizeGroup, validDate, forGroup, addDays, moscowToday } from './shared/schedule.mjs';
import { homeworkKey } from './shared/student.mjs';
const publicRecord = ({ version, ...record }) => record;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
function groupValue(value) { if (typeof value !== 'string' || !value.trim() || value.length > 80) throw bad('Выбери группу.'); return normalizeGroup(value); }
function dateValue(value) { if (typeof value !== 'string' || !validDate(value)) throw bad('Проверь дату.'); return value; }
function subjectValue(value) { if (typeof value !== 'string' || !value.trim() || value.length > 300) throw bad('Проверь название предмета.'); return value.trim(); }
async function readJson(request) {
  if (!request.headers['content-type']?.includes('application/json')) throw bad('Ожидается JSON.', 415);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 24000) throw bad('Слишком большой запрос.', 413); chunks.push(chunk); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; }
  catch { throw bad('Неверный JSON.'); }
}
export function createApp({ config, store, schedule, webDir = fileURLToPath(new URL('../web', import.meta.url)), now = () => new Date() }) {
  const limits = new Map();
  return createServer(async (request, response) => {
    const json = (body, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }); response.end(JSON.stringify(body)); };
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname, params = url.searchParams, method = request.method;
      if (path === '/health' && method === 'GET') return json({ ok: true, appConfigured: !!config.appUrl, botConfigured: !!config.token });
      if (path.startsWith('/api/')) {
        const key = request.socket.remoteAddress || 'unknown', current = now().getTime();
        let bucket = limits.get(key);
        if (!bucket || current > bucket.until) { bucket = { count: 0, until: current + 60000 }; limits.set(key, bucket); }
        if (++bucket.count > 600) throw bad('Слишком много запросов. Подожди минуту.', 429);
        if (limits.size > 5000) for (const [id, entry] of limits) if (current > entry.until) limits.delete(id);
        if (!['GET', 'PUT', 'DELETE'].includes(method)) throw bad('Метод не поддерживается.', 405);
        if (method !== 'GET' && request.headers.origin && config.appUrl && request.headers.origin !== config.appUrl) throw bad('Неверный источник запроса.', 403);
        if (path === '/api/groups' && method === 'GET') {
          const day = store.day(moscowToday());
          return json({ groups: [...new Set([...schedule.catalog, ...(day?.lessons.flatMap(l => l.groups) || [])])].sort((a, b) => a.localeCompare(b, 'ru')) });
        }
        if (path === '/api/schedule' && method === 'GET') {
          const date = dateValue(params.get('date')), group = params.has('group') ? groupValue(params.get('group')) : '';
          const today = moscowToday();
          if (date < addDays(today, -370) || date > addDays(today, 370)) throw bad('Выбери дату в пределах года.');
          // A shared five-minute cache limits requests to the university even on manual refresh.
          const day = await schedule.getDay(date);
          return json({ ...day, lessons: group ? forGroup(day.lessons, group) : day.lessons });
        }
        if (path === '/api/monitor/status' && method === 'GET') return json(schedule.monitor(groupValue(params.get('group')), config));
        if (!['/api/profile', '/api/homework', '/api/homework/next'].includes(path)) throw bad('Страница не найдена.', 404);
        const header = request.headers.authorization || '';
        const user = validateInitData(header.startsWith('tma ') ? header.slice(4) : '', config.token, now().getTime());
        if (!user) throw bad('Открой приложение кнопкой в Telegram-боте. Если оно уже открыто, закрой и запусти снова.', 401);
        let profile = store.touchUser(user);
        if (user.allowsWrite && !profile.chat_id) { store.db.prepare('UPDATE users SET chat_id=? WHERE id=?').run(user.id, user.id); profile = store.user(user.id); }
        if (path === '/api/profile') {
          if (method === 'PUT') {
            const data = await readJson(request), group = groupValue(data.group);
            if (!['all', 'pe', 'chess'].includes(data.sport)) throw bad('Выбери физкультуру или шахматы.');
            store.preferences(user.id, group, data.sport); profile = store.user(user.id);
          } else if (method !== 'GET') throw bad('Метод не поддерживается.', 405);
          return json({ user: { id: user.id, name: user.name }, group: profile.group_code, sport: profile.sport, remindersAvailable: !!(config.background && profile.chat_id && profile.notifications) });
        }
        if (path === '/api/homework/next' && method === 'GET') {
          const group = groupValue(params.get('group')), subject = subjectValue(params.get('subject')), date = dateValue(params.get('date'));
          return json({ lessons: schedule.upcoming(group, subject, date).lessons });
        }
        if (path !== '/api/homework') throw bad('Метод не поддерживается.', 405);
        if (method === 'GET') {
          const group = groupValue(params.get('group'));
          return json({ records: store.records(user.id, group).map(r => publicRecord(schedule.syncRecord(user.id, r))), remindersAvailable: !!(config.background && profile.chat_id && profile.notifications) });
        }
        const data = await readJson(request), group = groupValue(data.group), subject = subjectValue(data.subject), sourceDate = dateValue(data.sourceDate);
        const lessonKey = homeworkKey({ date: sourceDate, subject });
        if (method === 'DELETE') { store.deleteRecord(user.id, group, lessonKey); return json({ deleted: true, lessonKey }); }
        if (typeof data.content !== 'string' || !data.content.trim() || data.content.length > 4000 || typeof data.done !== 'boolean' || typeof data.autoTarget !== 'boolean' || typeof data.remind !== 'boolean') throw bad('Добавь задание до 4000 символов и проверь параметры.');
        const previous = store.record(user.id, group, lessonKey);
        if (!previous && store.db.prepare('SELECT count(*) AS n FROM homework WHERE user_id=?').get(user.id).n >= 1000) throw bad('Лимит: 1000 личных заданий. Удали ненужные записи.');
        let target;
        if (data.autoTarget) target = schedule.upcoming(group, subject, sourceDate).lessons[0]?.date || '';
        else { target = dateValue(data.lessonDate); if (target <= sourceDate && previous?.lessonDate !== target) throw bad('Выбери дату следующего занятия.'); }
        const content = data.content.trim();
        const changed = !previous || previous.content !== content || previous.dueDate !== target || previous.remind !== data.remind;
        const record = { group, lessonKey, subject, sourceDate, lessonDate: target, dueDate: target, content, done: data.done, autoTarget: data.autoTarget, remind: data.remind,
          updatedAt: now().toISOString(), version: changed ? randomUUID() : previous.version, remindedAt: changed ? null : previous.remindedAt };
        store.putRecord(user.id, record);
        return json({ record: publicRecord(record) });
      }
      if (method !== 'GET' && method !== 'HEAD') throw bad('Метод не поддерживается.', 405);
      const name = decodeURIComponent(path);
      const file = resolve(webDir, name === '/' ? 'index.html' : '.' + name);
      if (!file.startsWith(resolve(webDir) + sep)) throw bad('Страница не найдена.', 404);
      let bytes;
      try { bytes = await readFile(file); } catch { throw bad('Страница не найдена.', 404); }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      response.end(method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (!response.headersSent) json({ error: error.status ? error.message : 'Не удалось выполнить запрос. Попробуй ещё раз.' }, error.status || 500);
      else response.end();
    }
  });
}
