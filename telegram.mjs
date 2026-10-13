import { createHash } from 'node:crypto';
import { addDays, forGroup, normalizeGroup } from './shared/schedule.mjs';
import { reminderDue, matchesSport, changedFields } from './shared/student.mjs';
const scheduleRule = 'daily-20:00-Moscow';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const shortDate = date => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`));
const trimMessage = text => text.length > 4000 ? text.slice(0, 3920) + '\n…Все подробности в приложении.' : text;
const minute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function moscowClock(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return { date, time, after730: time >= '07:30' };
}
export function scheduleSlot(now, anchor = '2026-10-12') {
  const { date, time } = moscowClock(now);
  const available = time >= '20:00' ? date : addDays(date, -1);
  return available < anchor ? null : available;
}
function taskSummary(record) {
  const lines = [record.content, ...(record.checklist || []).map(x => `${x.done ? '☑' : '☐'} ${x.text}`)];
  if (record.photos?.length) lines.push(`📷 Фото задания: ${record.photos.length}. Открой ДЗ, чтобы посмотреть.`);
  return lines.filter(Boolean).join('\n');
}
export function queueReminders(store, schedule, now = new Date()) {
  const { date, after730 } = moscowClock(now);
  if (!after730) return;
  for (const { userId, record: original } of store.allHomework()) {
    const record = schedule.syncRecord(userId, original), user = store.user(userId);
    if (!user?.chat_id || !user.notifications || record.done || !record.remind || record.remindedAt || !reminderDue(record.dueDate, date)) continue;
    const id = hash([userId, record.group, record.lessonKey, record.version]);
    store.enqueue(id, userId, { type: 'homework', group: record.group, key: record.lessonKey, version: record.version,
      text: trimMessage(`📚 ДЗ к ${shortDate(record.dueDate)}\n${record.subject}\nГруппа ${record.group}\n\n${taskSummary(record)}`) });
  }
}
export function queueChanges(store, now = new Date()) {
  const { date, time } = moscowClock(now);
  for (const user of store.users()) {
    const settings = store.settings(user.id);
    if (!user.notifications || !user.chat_id || !user.group_code || !settings.changeAlerts) { store.setChangeCursor(user.id, store.latestChangeId()); continue; }
    const rows = store.changesSince(store.changeCursor(user.id));
    if (!rows.length) continue;
    const byDate = new Map();
    for (const row of rows) {
      const c = row.change, variants = [c.before, c.after].filter(Boolean);
      if (c.date < date || (c.date === date && variants.every(l => l.end <= time)) || !c.groups.some(g => normalizeGroup(g) === normalizeGroup(user.group_code)) || !variants.some(l => matchesSport(l, user.sport))) continue;
      const list = byDate.get(c.date) || []; list.push(row); byDate.set(c.date, list);
    }
    store.db.exec('BEGIN');
    try {
      for (const [day, changes] of byDate) {
        const lines = changes.map(({ change: c }) => {
          const l = c.after || c.before;
          const description = c.kind === 'changed' ? changedFields(c).map(f => `${f.label}: ${f.before} → ${f.after}`).join('\n') : `${l.start}–${l.end} · ${l.type} · ${l.room || 'аудитория не указана'}`;
          return `${c.kind === 'added' ? 'Добавлено' : c.kind === 'removed' ? 'Убрано из расписания' : 'Изменено'}: ${l.subject}\n${description}`;
        });
        const id = hash(['schedule', user.id, changes.map(c => c.id)]);
        store.enqueue(id, user.id, { type: 'schedule', date: day, group: user.group_code, sport: user.sport,
          text: trimMessage(`🔔 Изменения на ${shortDate(day)}\nГруппа ${user.group_code}\n\n${lines.join('\n\n')}`) });
      }
      store.setChangeCursor(user.id, rows.at(-1).id);
      store.db.exec('COMMIT');
    } catch (e) { store.db.exec('ROLLBACK'); throw e; }
  }
}
export async function queueDigests(store, schedule, now = new Date()) {
  const { date, time } = moscowClock(now);
  const candidates = store.users().filter(user => {
    const s = store.settings(user.id), since = minute(time) - minute(s.morningTime);
    return user.notifications && user.chat_id && user.group_code && s.morningEnabled && since >= 0 && since <= 120 && store.state(`digest:${user.id}`) !== date;
  });
  if (!candidates.length) return;
  // A single shared source request, independent of the number of subscribers.
  if (now.getTime() - store.state('digest-source-attempt', 0) < 60000) return;
  store.setState('digest-source-attempt', now.getTime());
  const day = await schedule.getDay(date);
  if (day.status === 'unavailable') return; // A source failure must never become "no classes".
  for (const candidate of candidates) {
    // Settings may have changed while fetching the source.
    const user = store.user(candidate.id), s = store.settings(candidate.id);
    if (!user?.notifications || !user.chat_id || !user.group_code || !s.morningEnabled || time < s.morningTime || minute(time) - minute(s.morningTime) > 120) continue;
    const lessons = forGroup(day.lessons, user.group_code).filter(l => !l.cancelled && matchesSport(l, user.sport)).sort((a,b) => a.start.localeCompare(b.start));
    // Only a fresh response can prove that today has no classes.
    if (!lessons.length && day.status !== 'live') continue;
    store.db.exec('BEGIN');
    try {
      if (lessons.length || !s.schoolDaysOnly) {
        const tasks = store.records(user.id, user.group_code).map(r => schedule.syncRecord(user.id, r)).filter(r => !r.done && r.dueDate === date);
        const first = lessons[0], last = lessons.at(-1);
        const timetable = lessons.length ? `Занятий: ${lessons.length}\nНачало: ${first.start} · Конец: ${last.end}\nПервая пара: ${first.subject}\n${first.online ? 'Онлайн' : 'Аудитория'}: ${first.room || 'не указана'}` : 'На сегодня занятия не опубликованы.';
        const homework = tasks.length ? `\n\n📚 ДЗ на сегодня:\n${tasks.map(r => `• ${r.subject}: ${taskSummary(r).slice(0, 250)}`).join('\n')}` : '\n\nДЗ на сегодня в приложении нет.';
        store.enqueue(hash(['digest', user.id, date]), user.id, { type: 'digest', date, group: user.group_code, sport: user.sport, morningTime: s.morningTime,
          text: trimMessage(`☀️ Доброе утро! ${shortDate(date)}\nГруппа ${user.group_code}\n\n${timetable}${homework}${day.status !== 'live' ? '\n\n⚠️ Источник недоступен: расписание из сохранённой копии.' : ''}`) });
      }
      store.setState(`digest:${user.id}`, date);
      store.db.exec('COMMIT');
    } catch (e) { store.db.exec('ROLLBACK'); throw e; }
  }
}
export async function deliverOutbox(store, telegram, now = new Date()) {
  const clock = moscowClock(now);
  const pending = store.db.prepare("SELECT * FROM outbox WHERE status='pending' AND next_attempt<=? ORDER BY rowid LIMIT 15").all(now.getTime());
  for (const item of pending) {
    const body = JSON.parse(item.body), user = store.user(item.user_id), settings = store.settings(item.user_id);
    const record = body.type === 'homework' ? store.record(item.user_id, body.group, body.key) : null;
    const stale = body.type === 'homework' ? !record || record.version !== body.version || record.done || !record.remind || record.remindedAt || !record.dueDate || record.dueDate < clock.date
      : body.type === 'schedule' ? !settings.changeAlerts || body.date < clock.date || user?.group_code !== body.group || user?.sport !== body.sport
      : body.type === 'digest' ? !settings.morningEnabled || settings.morningTime !== body.morningTime || body.date !== clock.date || minute(clock.time) - minute(body.morningTime) > 120 || user?.group_code !== body.group || user?.sport !== body.sport
      : true;
    if (stale || !user?.notifications || !user?.chat_id) { store.db.prepare("UPDATE outbox SET status='cancelled' WHERE id=?").run(item.id); continue; }
    try {
      await telegram.call('sendMessage', { chat_id: user.chat_id, text: body.text,
        reply_markup: telegram.keyboard(body.type === 'homework' ? 'homework' : 'today', body.date || record?.dueDate) });
      const current = body.type === 'homework' ? store.record(item.user_id, body.group, body.key) : null;
      store.db.exec('BEGIN');
      try {
        store.db.prepare("UPDATE outbox SET status='sent' WHERE id=?").run(item.id);
        if (current && current.version === body.version) store.putRecord(item.user_id, { ...current, remindedAt: now.toISOString() });
        store.db.exec('COMMIT');
      } catch (e) { store.db.exec('ROLLBACK'); throw e; }
    } catch (error) {
      if (error.code === 403) store.db.prepare('UPDATE users SET notifications=0 WHERE id=?').run(item.user_id);
      const seconds = Math.max(error.retryAfter || 0, Math.min(3600, 30 * 2 ** Math.min(item.attempts, 7)));
      store.db.prepare('UPDATE outbox SET attempts=attempts+1,next_attempt=? WHERE id=?').run(now.getTime() + seconds * 1000, item.id);
    }
  }
}
export class Jobs {
  constructor(store, schedule, telegram, config, now = () => new Date()) { Object.assign(this, { store, schedule, telegram, config, now }); this.busy = false; }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = this.now(), { date } = moscowClock(now), slot = scheduleSlot(now, this.config.anchor);
      const check = this.store.state('schedule-job', {}), first = !this.store.state('warmup-done');
      if (first || (slot && (check.slot !== slot || check.rule !== scheduleRule)) || (slot && check.partial && now.getTime() >= (check.retryAt || 0))) {
        this.store.setState('schedule-job', { rule: scheduleRule, slot, partial: true, retryAt: now.getTime() + 900000 });
        const result = await this.schedule.check(date);
        this.store.setState('warmup-done', true);
        this.store.setState('schedule-job', { rule: scheduleRule, slot, partial: result.status !== 'completed', retryAt: this.now().getTime() + 900000 });
      }
      queueReminders(this.store, this.schedule, this.now());
      await queueDigests(this.store, this.schedule, this.now());
      queueChanges(this.store, this.now());
      if (this.telegram) await deliverOutbox(this.store, this.telegram, this.now());
      if (this.store.state('photo-cleanup') !== date) { this.store.cleanPhotos(this.now()); this.store.setState('photo-cleanup', date); }
    } finally { this.busy = false; }
  }
  start() {
    const run = () => this.tick().catch(() => console.error('Фоновая задача не завершилась. Будет повторена.'));
    void run(); this.timer = setInterval(run, 30000);
  }
  stop() { clearInterval(this.timer); }
}
