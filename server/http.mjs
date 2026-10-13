import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateInitData } from './auth.mjs';
import { normalizeGroup, validDate, forGroup, addDays, moscowToday } from './shared/schedule.mjs';
import { homeworkKey, matchesSport } from './shared/student.mjs';
const publicRecord = ({ version, ...record }) => record;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
function groupValue(value) { if (typeof value !== 'string' || !value.trim() || value.length > 80) throw bad('Выбери группу.'); return normalizeGroup(value); }
function dateValue(value) { if (typeof value !== 'string' || !validDate(value)) throw bad('Проверь дату.'); return value; }
function subjectValue(value) { if (typeof value !== 'string' || !value.trim() || value.length > 300) throw bad('Проверь название предмета.'); return value.trim(); }
async function readJson(request) {
  if (!request.headers['content-type']?.includes('application/json')) throw bad('Ожидается JSON.', 415);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 64000) throw bad('Слишком большой запрос.', 413); chunks.push(chunk); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; }
  catch { throw bad('Неверный JSON.'); }
}
async function readPhoto(request) {
  const mime = request.headers['content-type']?.split(';')[0];
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw bad('Прикрепи фото в формате JPEG, PNG или WebP.', 415);
  const max = 4 * 1024 * 1024;
  if (Number(request.headers['content-length']) > max) throw bad('Фото слишком большое. Максимум — 4 МБ.', 413);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > max) throw bad('Фото слишком большое. Максимум — 4 МБ.', 413); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  const valid = mime === 'image/jpeg' ? bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
    : mime === 'image/png' ? bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR'
    : bytes.length >= 30 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!valid) throw bad('Файл не похож на фотографию. Выбери другой снимок.');
  return { mime, bytes };
}
function settingsValue(data) {
  const result = {};
  for (const key of ['changeAlerts', 'morningEnabled', 'schoolDaysOnly']) if (key in data) { if (typeof data[key] !== 'boolean') throw bad('Проверь настройки уведомлений.'); result[key] = data[key]; }
  if ('appearance' in data) { if (!['system', 'light', 'dark'].includes(data.appearance)) throw bad('Выбери тему оформления.'); result.appearance = data.appearance; }
  if ('morningTime' in data) { if (typeof data.morningTime !== 'string' || !/^(0[5-9]|1[01]):[0-5]\d$/.test(data.morningTime)) throw bad('Выбери время сводки с 05:00 до 11:59 МСК.'); result.morningTime = data.morningTime; }
  return result;
}
// For /health: check the exact JS selected by web/index.html, not stale assets beside it.
async function frontendStatus(webDir) {
  try {
    const html = await readFile(resolve(webDir, 'index.html'), 'utf8');
    const entry = html.match(/src="\/assets\/([a-zA-Z0-9_.-]+\.js)"/);
    if (!entry) return 'not_built';
    const js = await readFile(resolve(webDir, 'assets', entry[1]), 'utf8');
    return js.includes('campus-2026-10-13-reviewed-admin') ? 'ready' : 'old_build';
  } catch { return 'not_built'; }
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
      if (path === '/health' && method === 'GET') return json({ ok: true, appConfigured: !!config.appUrl, botConfigured: !!config.token, adminConfigured: !!config.adminId, frontendFeatures: await frontendStatus(webDir) });
      if (path.startsWith('/api/')) {
        const key = request.socket.remoteAddress || 'unknown', current = now().getTime();
        let bucket = limits.get(key);
        if (!bucket || current > bucket.until) { bucket = { count: 0, until: current + 60000 }; limits.set(key, bucket); }
        if (++bucket.count > 600) throw bad('Слишком много запросов. Подожди минуту.', 429);
        if (limits.size > 5000) for (const [id, entry] of limits) if (current > entry.until) limits.delete(id);
        if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw bad('Метод не поддерживается.', 405);
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
        const photoPath = path.match(/^\/api\/photos\/([a-f0-9-]{36})$/);
        if (!['/api/profile', '/api/settings', '/api/subjects', '/api/photos', '/api/homework', '/api/homework/next', '/api/admin/status', '/api/admin/check'].includes(path) && !photoPath) throw bad('Страница не найдена.', 404);
        const header = request.headers.authorization || '';
        const user = validateInitData(header.startsWith('tma ') ? header.slice(4) : '', config.token, now().getTime());
        if (!user) throw bad('Открой приложение кнопкой в Telegram-боте. Если оно уже открыто, закрой и запусти снова.', 401);
        if (path.startsWith('/api/admin/')) {
          if (!config.adminId || user.id !== config.adminId) throw bad('Доступ запрещён.', 403);
          if (path === '/api/admin/status' && method === 'GET') {
            const count = table => store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
            return json({ users: count('users'), homework: count('homework'), groups: schedule.catalog.length,
              lastCheck: store.state('monitor'), queued: store.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status='pending'").get().n });
          }
          if (path === '/api/admin/check' && method === 'POST') {
            if (schedule.checking) throw bad('Проверка уже выполняется.', 409);
            const result = await schedule.check(moscowToday());
            return json({ result });
          }
          throw bad('Метод не поддерживается.', 405);
        }
        let profile = store.touchUser(user);
        if (user.allowsWrite && !profile.chat_id) { store.db.prepare('UPDATE users SET chat_id=? WHERE id=?').run(user.id, user.id); profile = store.user(user.id); }
        if (path === '/api/photos') {
          if (method !== 'POST') throw bad('Метод не поддерживается.', 405);
          const { mime, bytes } = await readPhoto(request);
          if (store.photoBytes(user.id) + bytes.length > 200 * 1024 * 1024) throw bad('Для фото доступно 200 МБ. Удали ненужные снимки из старых заданий.', 409);
          const id = randomUUID(); store.putPhoto(user.id, id, mime, bytes, now().toISOString());
          return json({ id }, 201);
        }
        if (photoPath) {
          const photo = store.photo(user.id, photoPath[1]);
          if (!photo) throw bad('Фото не найдено.', 404);
          if (method === 'DELETE') { if (!store.deletePhoto(user.id, photo.id)) throw bad('Сначала убери фото из задания и сохрани его.', 409); return json({ deleted: true }); }
          if (method !== 'GET') throw bad('Метод не поддерживается.', 405);
          response.writeHead(200, { 'Content-Type': photo.mime, 'Content-Length': photo.data.length, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'Cross-Origin-Resource-Policy': 'same-origin' });
          return response.end(Buffer.from(photo.data));
        }
        if (path === '/api/settings') {
          if (method === 'PUT') store.updateSettings(user.id, settingsValue(await readJson(request)));
          else if (method !== 'GET') throw bad('Метод не поддерживается.', 405);
          return json({ settings: store.settings(user.id), remindersAvailable: !!(config.background && profile.chat_id && profile.notifications) });
        }
        if (path === '/api/subjects') {
          if (method !== 'GET') throw bad('Метод не поддерживается.', 405);
          const group = groupValue(params.get('group')), today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now()), end = addDays(today, 41);
          const days = store.days(addDays(today, -1), end);
          const lessons = forGroup(days.flatMap(d => d.lessons), group).filter(l => matchesSport(l, profile.group_code === group ? profile.sport : 'all')).sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
          return json({ lessons, from: today, to: end, loadedDays: days.length });
        }
        if (path === '/api/profile') {
          if (method === 'PUT') {
            const data = await readJson(request), group = groupValue(data.group);
            if (!['all', 'pe', 'chess'].includes(data.sport)) throw bad('Выбери физкультуру или шахматы.');
            store.preferences(user.id, group, data.sport); profile = store.user(user.id);
          } else if (method !== 'GET') throw bad('Метод не поддерживается.', 405);
          return json({ user: { id: user.id, name: user.name }, group: profile.group_code, sport: profile.sport, settings: store.settings(user.id), remindersAvailable: !!(config.background && profile.chat_id && profile.notifications), isAdmin: !!config.adminId && user.id === config.adminId });
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
        if (method !== 'PUT') throw bad('Метод не поддерживается.', 405);
        if (typeof data.content !== 'string' || data.content.length > 4000 || typeof data.done !== 'boolean' || typeof data.autoTarget !== 'boolean' || typeof data.remind !== 'boolean') throw bad('Добавь задание до 4000 символов и проверь параметры.');
        const previous = store.record(user.id, group, lessonKey);
        const photos = data.photos ?? previous?.photos ?? [], checklist = data.checklist ?? previous?.checklist ?? [];
        if (!Array.isArray(photos) || photos.length > 6 || new Set(photos).size !== photos.length || photos.some(id => typeof id !== 'string' || !store.ownsPhoto(user.id, id))) throw bad('Можно прикрепить до 6 своих фотографий. Если загрузка прервалась, прикрепи фото ещё раз.');
        if (!Array.isArray(checklist) || checklist.length > 30 || new Set(checklist.map(x => x?.id)).size !== checklist.length || checklist.some(x => !x || typeof x.id !== 'string' || !/^[\w-]{1,80}$/.test(x.id) || typeof x.text !== 'string' || !x.text.trim() || x.text.length > 240 || typeof x.done !== 'boolean')) throw bad('В списке может быть до 30 пунктов, по 240 символов каждый.');
        const items = checklist.map(({ id, text, done }) => ({ id, text: text.trim(), done }));
        if (!data.content.trim() && !photos.length && !items.length) throw bad('Добавь текст, фотографию или пункт списка.');
        if (!previous && store.db.prepare('SELECT count(*) AS n FROM homework WHERE user_id=?').get(user.id).n >= 1000) throw bad('Лимит: 1000 личных заданий. Удали ненужные записи.');
        let target;
        if (data.autoTarget) target = schedule.upcoming(group, subject, sourceDate).lessons[0]?.date || '';
        else { target = dateValue(data.lessonDate); if (target <= sourceDate && previous?.lessonDate !== target) throw bad('Выбери дату следующего занятия.'); }
        const content = data.content.trim();
        const taskText = list => JSON.stringify((list || []).map(({ id, text }) => [id, text]));
        const changed = !previous || previous.content !== content || previous.dueDate !== target || previous.remind !== data.remind || JSON.stringify(previous.photos || []) !== JSON.stringify(photos) || taskText(previous.checklist) !== taskText(items);
        const record = { group, lessonKey, subject, sourceDate, lessonDate: target, dueDate: target, content, photos, checklist: items, done: data.done, autoTarget: data.autoTarget, remind: data.remind,
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
