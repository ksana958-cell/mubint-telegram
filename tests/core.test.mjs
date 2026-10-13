import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { validateInitData } from '../server/auth.mjs';
import { ScheduleService } from '../server/schedule.mjs';
import { createApp } from '../server/http.mjs';
import { queueReminders, queueChanges, queueDigests, deliverOutbox, scheduleSlot, Jobs } from '../server/jobs.mjs';
import { Telegram } from '../server/telegram.mjs';
import { parseSchedule, forGroup } from '../server/shared/schedule.mjs';
import { matchesSport } from '../server/shared/student.mjs';
const token = '123456789:TEST_ONLY_NOT_A_REAL_TOKEN';
const now = new Date('2026-10-12T04:30:00Z');
function signed(id = 101, time = now, extras = {}) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(time.getTime() / 1000)), user: JSON.stringify({ id, first_name: 'Студент' }), ...extras });
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  p.sort(); p.set('hash', createHmac('sha256', key).update([...p].map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex'));
  return p.toString();
}
const lesson = (date, extra = {}) => ({ id: date, date, pair: 1, start: '08:30', end: '10:00', type: 'Лекции', kind: 'lecture', subject: 'Экономика', teacher: 'Преподаватель', room: '301', groups: ['26-ИБ131'], cancelled: false, online: false, added: false, ...extra });
const day = (date, lessons) => ({ date, lessons, status: 'live', fetchedAt: now.toISOString(), source: '' });
const record = (extra = {}) => ({ group: '26-ИБ131', lessonKey: '["2026-10-12","экономика"]', subject: 'Экономика', sourceDate: '2026-10-12', lessonDate: '2026-10-15', dueDate: '2026-10-15', autoTarget: false, content: 'Задачи 1–5', done: false, remind: true, version: 'v1', remindedAt: null, updatedAt: now.toISOString(), ...extra });
function fixture(date = '2026-10-12', rows = '') {
  return `<p style="text-align: center; font-weight: bold;">${Number(date.slice(8))} Октябрь, Понедельник</p><table id="sampleTable"><thead><th>Нагрузка</th></thead><tbody>${rows}</tbody></table>`;
}
const row = '<tr class="all_row para1"><td>8:30–10:00</td><td>Практические занятия</td><td>Экономика</td><td>Преподаватель</td><td>301</td><td>26-ИБ131, 26-ИБ121</td></tr>';
function setup(t, options = {}) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const schedule = new ScheduleService(store, { seed: false, now: () => now, fetcher: async () => new Response(fixture()), ...options });
  return { store, schedule };
}
test('Telegram signature rejects tampering, expiry, future auth and repeated keys', () => {
  assert.equal(validateInitData(signed(), token, +now).id, '101');
  assert.equal(validateInitData(signed().replace('101', '102'), token, +now), null);
  assert.equal(validateInitData(signed(), token + 'wrong', +now), null);
  assert.equal(validateInitData(signed(101, new Date(+now - 86401000)), token, +now), null);
  assert.equal(validateInitData(signed(101, new Date(+now + 60000)), token, +now), null);
  assert.equal(validateInitData(signed() + '&auth_date=1', token, +now), null);
  assert.equal(validateInitData(signed(101, now, { signature: 'also-covered-by-hmac' }), token, +now).id, '101');
});
test('20:00 Moscow every day, including weekends and catch-up after downtime', () => {
  const a = '2026-10-12';
  assert.equal(scheduleSlot(new Date('2026-10-12T16:59:59Z'), a), null);
  assert.equal(scheduleSlot(new Date('2026-10-12T17:00:00Z'), a), a);
  assert.equal(scheduleSlot(new Date('2026-10-13T16:59:59Z'), a), a);
  assert.equal(scheduleSlot(new Date('2026-10-13T17:00:00Z'), a), '2026-10-13');
  assert.equal(scheduleSlot(new Date('2026-10-14T17:00:00Z'), a), '2026-10-14');
  assert.equal(scheduleSlot(new Date('2026-10-18T17:00:00Z'), a), '2026-10-18');
  assert.equal(scheduleSlot(new Date('2026-10-19T01:00:00Z'), a), '2026-10-18');
});
test('Parser preserves lecture/practice, groups and sport lectures', () => {
  const parsed = parseSchedule(fixture('2026-10-12', row), '2026-10-12');
  assert.equal(parsed[0].kind, 'practice'); assert.equal(parsed[0].start, '08:30');
  assert.equal(forGroup(parsed, '26-иб131').length, 1); assert.equal(forGroup(parsed, '26-ИБ1310').length, 0);
  assert.equal(matchesSport(lesson('2026-10-12', { subject: 'Физическая культура' }), 'chess'), true);
  assert.equal(matchesSport(lesson('2026-10-12', { subject: 'Физическая культура', kind: 'practice', type: 'Практические занятия' }), 'chess'), false);
});
test('Login/error pages never erase the last schedule or invent cancellations', async t => {
  const { store, schedule } = setup(t, { fetcher: async () => new Response('<html>Войти</html>') });
  store.putDay(day('2026-10-12', [lesson('2026-10-12')]));
  const fallback = await schedule.getDay('2026-10-12', true);
  assert.equal(fallback.status, 'cached'); assert.equal(fallback.lessons.length, 1); assert.equal(store.changes('2026-10-12').length, 0);
});
test('Room changes are saved, subsequent checks do not duplicate changes', async t => {
  const { store, schedule } = setup(t, { fetcher: async () => new Response(fixture('2026-10-12', row.replace('301', '402'))) });
  store.putDay(day('2026-10-12', parseSchedule(fixture('2026-10-12', row), '2026-10-12')));
  await schedule.getDay('2026-10-12', true); await schedule.getDay('2026-10-12', true);
  const changes = store.changes('2026-10-12'); assert.equal(changes.length, 1); assert.equal(changes[0].kind, 'changed'); assert.equal(changes[0].after.room, '402');
});
test('Next homework target skips double pairs and cancelled lessons; pending targets resolve', t => {
  const { store, schedule } = setup(t);
  store.putDay(day('2026-10-12', [lesson('2026-10-12'), lesson('2026-10-12', { start: '10:15' })]));
  store.putDay(day('2026-10-14', [lesson('2026-10-14', { cancelled: true })]));
  const pending = record({ autoTarget: true, lessonDate: '', dueDate: '' }); store.putRecord('101', pending);
  assert.equal(schedule.syncRecord('101', pending).dueDate, '');
  store.putDay(day('2026-10-15', [lesson('2026-10-15')]));
  const resolved = schedule.syncRecord('101', pending); assert.equal(resolved.dueDate, '2026-10-15');
  store.putDay(day('2026-10-15', [])); store.putDay(day('2026-10-19', [lesson('2026-10-19')]));
  const moved = schedule.syncRecord('101', resolved); assert.equal(moved.dueDate, '2026-10-19'); assert.notEqual(moved.version, resolved.version);
});
test('Reminder due three days before, late-added eligible, done and old work excluded', t => {
  const { store, schedule } = setup(t); store.startUser({ id: '101' }, '101');
  store.putRecord('101', record());
  queueReminders(store, schedule, new Date('2026-10-12T04:29:00Z')); assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get().n, 0);
  queueReminders(store, schedule, now); queueReminders(store, schedule, now); assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get().n, 1);
  store.putRecord('101', record({ lessonKey: 'late', version: 'late', dueDate: '2026-10-13' }));
  store.putRecord('101', record({ lessonKey: 'done', version: 'done', done: true }));
  store.putRecord('101', record({ lessonKey: 'old', version: 'old', dueDate: '2026-10-11' }));
  store.putRecord('101', record({ lessonKey: 'far', version: 'far', dueDate: '2026-10-16' }));
  queueReminders(store, schedule, now); assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get().n, 2);
});
test('Unsuccessful deliveries retry; successful reminders remain delivered across scans', async t => {
  const { store, schedule } = setup(t); store.startUser({ id: '101' }, '101'); store.putRecord('101', record());
  queueReminders(store, schedule, now);
  await deliverOutbox(store, { call: async () => { throw new Error('Offline'); }, keyboard: () => undefined }, now);
  assert.equal(store.record('101', record().group, record().lessonKey).remindedAt, null);
  let count = 0;
  const tg = { call: async () => { count++; }, keyboard: () => undefined };
  const later = new Date(+now + 60000);
  await deliverOutbox(store, tg, later); queueReminders(store, schedule, later); await deliverOutbox(store, tg, later);
  assert.equal(count, 1); assert.ok(store.record('101', record().group, record().lessonKey).remindedAt);
});
test('Queued deleted, completed or edited homework cannot send a stale reminder', async t => {
  const { store, schedule } = setup(t); store.startUser({ id: '101' }, '101');
  for (const key of ['deleted', 'done', 'edited']) store.putRecord('101', record({ lessonKey: key }));
  queueReminders(store, schedule, now);
  store.deleteRecord('101', '26-ИБ131', 'deleted');
  store.putRecord('101', record({ lessonKey: 'done', done: true }));
  store.putRecord('101', record({ lessonKey: 'edited', version: 'v2', content: 'Новый текст' }));
  let count = 0; await deliverOutbox(store, { call: async () => { count++; }, keyboard: () => undefined }, now);
  assert.equal(count, 0);
});
test('SQLite survives process reopen and isolates users with the same group and subject', () => {
  const dir = mkdtempSync(join(tmpdir(), 'campus-test-')); const file = join(dir, 'campus.sqlite');
  try {
    let store = new Store(file); store.putRecord('101', record()); store.putRecord('102', record({ content: 'Чужое ДЗ' })); store.setState('schedule-job', { slot: '2026-10-12' }); store.close();
    store = new Store(file); assert.equal(store.records('101', '26-ИБ131')[0].content, 'Задачи 1–5'); assert.equal(store.records('102', '26-ИБ131')[0].content, 'Чужое ДЗ'); assert.equal(store.state('schedule-job').slot, '2026-10-12'); store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('HTTP rejects fake headers and cross-origin writes; never exposes another user homework', async t => {
  const { store, schedule } = setup(t);
  store.putDay(day('2026-10-15', [lesson('2026-10-15')]));
  const server = createApp({ config: { token, appUrl: 'https://campus.example', background: true }, store, schedule, now: () => now });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, id, init = {}) => {
    const response = await fetch(base + path, { ...init, headers: { ...(id ? { Authorization: `tma ${signed(id)}` } : {}), ...init.headers } });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await call('/api/homework?group=26-ИБ131', null, { headers: { 'oai-authenticated-user-id': '101', 'X-Telegram-User-ID': '101' } })).status, 401);
  const input = record({ autoTarget: true });
  const saved = await call('/api/homework', 101, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://campus.example' }, body: JSON.stringify(input) });
  assert.equal(saved.status, 200); assert.equal(saved.data.record.dueDate, '2026-10-15'); assert.equal(saved.data.record.version, undefined);
  assert.equal((await call('/api/homework?group=26-ИБ131', 102)).data.records.length, 0);
  await call('/api/homework', 102, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal((await call('/api/homework?group=26-ИБ131', 101)).data.records.length, 1);
  assert.equal((await call('/api/homework', 101, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(input) })).status, 403);
  const html = await fetch(base); assert.equal(html.status, 200); assert.match(await html.text(), /telegram-web-app/);
  assert.equal((await fetch(base + '/server/config.mjs')).status, 404); assert.equal((await fetch(base + '/.env')).status, 404);
});
test('Private /start opens Mini App, /stop disables future messages, group chat is ignored', async t => {
  const { store } = setup(t); const bot = new Telegram({ token, appUrl: 'https://campus.example' }, store); const messages = [];
  bot.call = async (method, body) => { messages.push({ method, body }); };
  await bot.handle({ message: { text: '/start', from: { id: 101 }, chat: { id: 101, type: 'private' } } });
  assert.equal(store.user('101').chat_id, '101'); assert.equal(messages[0].body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://campus.example/');
  await bot.handle({ message: { text: '/stop', from: { id: 101 }, chat: { id: 101, type: 'private' } } }); assert.equal(store.user('101').notifications, 0);
  await bot.handle({ message: { text: '/start', from: { id: 102 }, chat: { id: -500, type: 'group' } } }); assert.equal(messages.length, 2);
});
test('Recurring check persists its slot and does not rerun on restart', async t => {
  const { store, schedule } = setup(t); let count = 0;
  schedule.check = async () => { count++; return { status: 'completed' }; };
  const config = { anchor: '2026-10-12' };
  await new Jobs(store, schedule, null, config, () => now).tick();
  await new Jobs(store, schedule, null, config, () => now).tick(); assert.equal(count, 1);
  await new Jobs(store, schedule, null, config, () => new Date('2026-10-12T17:00:00Z')).tick(); assert.equal(count, 2);
  await new Jobs(store, schedule, null, config, () => new Date('2026-10-13T16:59:00Z')).tick(); assert.equal(count, 2);
  await new Jobs(store, schedule, null, config, () => new Date('2026-10-13T17:00:00Z')).tick(); assert.equal(count, 3);
});

test('Daily rule replaces the old same-day 07:30 job and survives restart', async t => {
  const { store, schedule } = setup(t); let checks = 0;
  store.setState('warmup-done', true); store.setState('schedule-job', { slot: '2026-10-12', partial: false });
  schedule.check = async () => { checks++; return { status: 'completed' }; };
  const config = { anchor: '2026-10-12' }, evening = new Date('2026-10-12T17:00:00Z');
  await new Jobs(store, schedule, null, config, () => evening).tick();
  await new Jobs(store, schedule, null, config, () => evening).tick(); assert.equal(checks, 1);
  assert.equal(schedule.monitor('26-ИБ131', { ...config, background: true }).schedule.time, '20:00');
});

test('Change alerts match group and sport, show before/after, dedupe across restart', async t => {
  const { store } = setup(t); store.startUser({ id: '101' }, '101'); store.preferences('101', '26-ИБ131', 'chess');
  store.startUser({ id: '102' }, '102'); store.preferences('102', '26-ИБ121', 'all');
  const a = lesson('2026-10-13'), b = { ...a, room: '402', start: '10:15', end: '11:45' };
  store.putChange({ kind: 'changed', date: a.date, groups: a.groups, before: a, after: b, detectedAt: now.toISOString() });
  const pe = lesson('2026-10-13', { subject: 'Физическая культура', kind: 'practice', type: 'Практические занятия' });
  store.putChange({ kind: 'added', date: pe.date, groups: pe.groups, after: pe, detectedAt: now.toISOString() });
  queueChanges(store, now); queueChanges(store, now);
  const outbox = store.db.prepare('SELECT * FROM outbox').all(); assert.equal(outbox.length, 1); assert.equal(outbox[0].user_id, '101');
  const text = JSON.parse(outbox[0].body).text; assert.match(text, /301 → 402/); assert.match(text, /08:30–10:00 → 10:15–11:45/); assert.doesNotMatch(text, /Физическая культура/);
  let sent = 0; const tg = { call: async () => { sent++; }, keyboard: (section, date) => { assert.equal(section, 'today'); assert.equal(date, '2026-10-13'); } };
  await deliverOutbox(store, tg, now); await deliverOutbox(store, tg, now); assert.equal(sent, 1);
});

test('Disabling change alerts and changing group cancel pending notifications', async t => {
  const { store } = setup(t); store.startUser({ id: '101' }, '101'); store.preferences('101', '26-ИБ131', 'all');
  const a = lesson('2026-10-13');
  store.putChange({ detectedAt: now.toISOString(), kind: 'added', date: a.date, groups: a.groups, after: a }); queueChanges(store, now);
  store.updateSettings('101', { changeAlerts: false });
  let sent = 0; const tg = { call: async () => { sent++; }, keyboard: () => undefined };
  await deliverOutbox(store, tg, now); assert.equal(sent, 0);
  store.putChange({ detectedAt: now.toISOString(), kind: 'changed', date: a.date, groups: a.groups, before: a, after: { ...a, room: '500' } });
  store.updateSettings('101', { changeAlerts: true }); queueChanges(store, now); assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE status='pending'").get().n, 0);
  store.putChange({ detectedAt: now.toISOString(), kind: 'removed', date: a.date, groups: a.groups, before: a }); queueChanges(store, now);
  store.preferences('101', '26-ИБ121', 'all'); await deliverOutbox(store, tg, now); assert.equal(sent, 0);
});

test('Morning digest respects chosen time, sport, due homework and once-per-day delivery', async t => {
  const { store, schedule } = setup(t); store.startUser({ id: '101' }, '101'); store.preferences('101', '26-ИБ131', 'chess');
  store.updateSettings('101', { morningEnabled: true, morningTime: '08:10' });
  let fetches = 0; schedule.getDay = async date => { fetches++; return day(date, [lesson(date), lesson(date, { start: '10:15', end: '11:45', subject: 'Физическая культура', kind: 'practice', type: 'Практические занятия' }), lesson(date, { start: '12:00', end: '13:30', subject: 'Шахматы', kind: 'practice', type: 'Практические занятия' })]); };
  store.putRecord('101', record({ dueDate: '2026-10-12', lessonDate: '2026-10-12', content: '', photos: ['test-photo'], checklist: [{ id:'a', text:'Решить задачу', done:false }] }));
  await queueDigests(store, schedule, new Date('2026-10-12T05:09:00Z')); assert.equal(fetches, 0);
  const morning = new Date('2026-10-12T05:10:00Z'); await queueDigests(store, schedule, morning); await queueDigests(store, schedule, morning);
  assert.equal(fetches, 1); const row = store.db.prepare('SELECT body FROM outbox').get(), body = JSON.parse(row.body);
  assert.match(body.text, /Занятий: 2/); assert.match(body.text, /Начало: 08:30 · Конец: 13:30/); assert.match(body.text, /Аудитория: 301/); assert.match(body.text, /Фото задания: 1/); assert.match(body.text, /Решить задачу/);
  let sent = 0; await deliverOutbox(store, { call: async () => { sent++; }, keyboard: () => undefined }, morning);
  await queueDigests(store, schedule, new Date('2026-10-12T05:11:00Z')); assert.equal(sent, 1); assert.equal(store.db.prepare("SELECT status FROM outbox").get().status, 'sent');
});

test('Digest never invents a free day on source failure; no stale evening summary', async t => {
  const { store, schedule } = setup(t); store.startUser({ id: '101' }, '101'); store.preferences('101','26-ИБ131','all'); store.updateSettings('101',{morningEnabled:true,schoolDaysOnly:false});
  schedule.getDay = async date => ({ ...day(date, []), status:'unavailable' });
  await queueDigests(store,schedule,now); assert.equal(store.state('digest:101'), null);
  schedule.getDay = async date => ({ ...day(date, []), status:'cached' });
  await queueDigests(store,schedule,new Date(+now+60000)); assert.equal(store.state('digest:101'), null);
  schedule.getDay = async date => day(date,[]);
  await queueDigests(store,schedule,new Date(+now+120000)); assert.equal(store.state('digest:101'), '2026-10-12');
  let sent=0; await deliverOutbox(store,{call:async()=>{sent++;},keyboard:()=>undefined},new Date('2026-10-12T17:00:00Z')); assert.equal(sent,0);
});

test('HTTP photos are private; photo-only homework, checklist, delete and settings work end to end', async t => {
  const { store, schedule } = setup(t); store.putDay(day('2026-10-15',[lesson('2026-10-15')]));
  const server = createApp({config:{token,appUrl:'https://campus.example',background:true},store,schedule,now:()=>now});
  server.listen(0,'127.0.0.1'); await once(server,'listening'); t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path,id=101,options={}) => fetch(base+path,{...options,headers:{...(id?{Authorization:`tma ${signed(id)}`}:{ }),...options.headers}});
  const json = (body,method='PUT') => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV9sAAAAASUVORK5CYII=','base64');
  assert.equal((await request('/api/photos',null,{method:'POST',headers:{'Content-Type':'image/png'},body:png})).status,401);
  assert.equal((await request('/api/photos',101,{method:'POST',headers:{'Content-Type':'image/png'},body:'<script>bad</script>'})).status,400);
  assert.equal((await request('/api/photos',101,{method:'POST',headers:{'Content-Type':'image/svg+xml'},body:'<svg/>'})).status,415);
  assert.equal((await request('/api/photos',101,{method:'POST',headers:{'Content-Type':'image/png'},body:Buffer.alloc(4*1024*1024+1)})).status,413);
  const upload = await request('/api/photos',101,{method:'POST',headers:{'Content-Type':'image/png'},body:png}); assert.equal(upload.status,201); const {id} = await upload.json();
  const own = await request(`/api/photos/${id}`); assert.equal(own.status,200); assert.equal(own.headers.get('cache-control'),'private, no-store'); assert.equal(Buffer.compare(Buffer.from(await own.arrayBuffer()),png),0);
  assert.equal((await request(`/api/photos/${id}`,102)).status,404);
  assert.equal((await request(`/api/photos/${id}`,102,{method:'DELETE'})).status,404);
  const task = record({content:'',photos:[id],checklist:[],autoTarget:true});
  assert.equal((await request('/api/homework',102,json(task))).status,400);
  const saved = await request('/api/homework',101,json(task)); assert.equal(saved.status,200); assert.equal((await saved.json()).record.photos[0],id);
  assert.equal((await request(`/api/photos/${id}`,101,{method:'DELETE'})).status,409);
  assert.equal((await request('/api/homework',101,json({...task,checklist:[{id:'a',text:'Пункт 1',done:false},{id:'a',text:'Дубль',done:false}]}))).status,400);
  let good = await request('/api/homework',101,json({...task,checklist:[{id:'a',text:'Пункт 1',done:false}]})); assert.equal(good.status,200);
  const version = store.record('101',task.group,task.lessonKey).version;
  good = await request('/api/homework',101,json({...task,checklist:[{id:'a',text:'Пункт 1',done:true}]})); assert.equal(good.status,200); assert.equal(store.record('101',task.group,task.lessonKey).version,version);
  // Older clients that don't know photos/checklist must not drop either field.
  good = await request('/api/homework',101,json(record({done:true,content:'Текст',autoTarget:true}))); assert.equal(good.status,200); const preserved = (await good.json()).record; assert.deepEqual(preserved.photos,[id]); assert.equal(preserved.checklist[0].done,true);
  assert.equal((await request('/api/settings',101,json({morningTime:'24:00'}))).status,400);
  assert.equal((await request('/api/settings',101,json({morningTime:'08:05',morningEnabled:true,appearance:'dark'}))).status,200);
  assert.equal((await (await request('/api/settings')).json()).settings.appearance,'dark');
  assert.equal((await (await request('/api/settings',102)).json()).settings.appearance,'system');
  const subjects = await (await request('/api/subjects?group=26-ИБ131')).json(); assert.equal(subjects.lessons[0].subject,'Экономика');
  assert.equal((await request('/api/homework',101,json(task,'DELETE'))).status,200); assert.equal((await request(`/api/photos/${id}`)).status,404);
});

test('Additive database upgrade preserves legacy tasks, schedules and delivery history', () => {
  const dir=mkdtempSync(join(tmpdir(),'campus-upgrade-')),file=join(dir,'campus.sqlite');
  try {
    let store=new Store(file); store.startUser({id:'101'},'101');store.putRecord('101',record());store.putDay(day('2026-10-15',[lesson('2026-10-15')]));store.enqueue('old','101',{type:'homework'});
    store.putChange({ detectedAt: now.toISOString(),kind:'added',date:'2026-10-15',groups:['26-ИБ131'],after:lesson('2026-10-15')});
    store.db.exec('DROP TABLE settings; DROP TABLE photos;'); store.close();
    store=new Store(file);assert.equal(store.record('101',record().group,record().lessonKey).content,'Задачи 1–5');assert.equal(store.day('2026-10-15').lessons.length,1);assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get().n,1);assert.equal(store.settings('101').morningEnabled,false);assert.equal(store.changeCursor('101'),store.latestChangeId());store.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('Unattached uploads expire, attached photos survive cleanup and restart', () => {
  const dir=mkdtempSync(join(tmpdir(),'campus-photo-')),file=join(dir,'campus.sqlite');
  try {
    let store=new Store(file);const old='2026-10-10T00:00:00Z';store.putPhoto('101','kept','image/png',Buffer.from('fake test bytes'),old);store.putPhoto('101','orphan','image/png',Buffer.from('test bytes'),old);store.putRecord('101',record({photos:['kept']}));store.close();
    store=new Store(file);store.cleanPhotos(now);assert.ok(store.photo('101','kept'));assert.equal(store.photo('101','orphan'),undefined);assert.equal(store.photo('102','kept'),undefined);store.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test('Admin endpoints and profile require the single configured signed Telegram ID', async t => {
  const { store, schedule } = setup(t);
  const config = { token, appUrl: 'https://campus.example', background: true, adminId: '101' };
  const server = createApp({ config, store, schedule, now: () => now });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, id = null) => {
    const headers = id === null ? {} : { Authorization: `tma ${signed(id)}` };
    const response = await fetch(base + path, { headers });
    return { status: response.status, body: await response.json() };
  };
  const health = await call('/health');
  assert.equal(health.body.adminConfigured, true);
  assert.equal(health.body.frontendFeatures, 'old_build'); // Current ZIP requires a new web build.
  assert.equal((await call('/api/admin/status')).status, 401);
  assert.equal((await call('/api/admin/status', 102)).status, 403);
  assert.equal((await call('/api/admin/status', 101)).status, 200);
  assert.equal((await call('/api/profile', 101)).body.isAdmin, true);
  assert.equal((await call('/api/profile', 102)).body.isAdmin, false);
  const forged = await fetch(base + '/api/admin/check', { method: 'POST', headers: { 'X-Telegram-User-ID': '101' } });
  assert.equal(forged.status, 401);
});
