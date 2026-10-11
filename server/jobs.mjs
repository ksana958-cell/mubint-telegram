import { createHash } from 'node:crypto';
import { addDays } from './shared/schedule.mjs';
import { reminderDue } from './shared/student.mjs';
export function moscowClock(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return { date, after730: time >= '07:30' };
}
export function scheduleSlot(now, anchor) {
  const { date, after730 } = moscowClock(now);
  const available = after730 ? date : addDays(date, -1);
  const days = Math.floor((Date.parse(`${available}T12:00:00Z`) - Date.parse(`${anchor}T12:00:00Z`)) / 86400000);
  return days < 0 ? null : addDays(anchor, days - days % 2);
}
export function queueReminders(store, schedule, now = new Date()) {
  const { date, after730 } = moscowClock(now);
  if (!after730) return;
  for (const { userId, record: original } of store.allHomework()) {
    const record = schedule.syncRecord(userId, original), user = store.user(userId);
    if (!user?.chat_id || !user.notifications || record.done || !record.remind || record.remindedAt || !reminderDue(record.dueDate, date)) continue;
    const id = createHash('sha256').update(JSON.stringify([userId, record.group, record.lessonKey, record.version])).digest('hex');
    const due = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${record.dueDate}T12:00:00Z`));
    const text = `📚 ДЗ к ${due}\n${record.subject}\nГруппа ${record.group}\n\n${record.content}`;
    store.enqueue(id, userId, { type: 'homework', group: record.group, key: record.lessonKey, version: record.version, text: text.length > 4000 ? text.slice(0, 3950) + '\n…Полный текст в приложении.' : text });
  }
}
export async function deliverOutbox(store, telegram, now = new Date()) {
  const pending = store.db.prepare("SELECT * FROM outbox WHERE status='pending' AND next_attempt<=? ORDER BY rowid LIMIT 15").all(now.getTime());
  for (const item of pending) {
    const body = JSON.parse(item.body), user = store.user(item.user_id);
    const record = store.record(item.user_id, body.group, body.key);
    if (!record || record.version !== body.version || record.done || !record.remind || record.remindedAt || record.dueDate < moscowClock(now).date) {
      store.db.prepare("UPDATE outbox SET status='cancelled' WHERE id=?").run(item.id); continue;
    }
    if (!user?.notifications || !user?.chat_id) continue;
    try {
      await telegram.call('sendMessage', { chat_id: user.chat_id, text: body.text, reply_markup: telegram.keyboard('homework') });
      // Re-read after await so an edit while sending cannot mark its new version delivered.
      const current = store.record(item.user_id, body.group, body.key);
      store.db.exec('BEGIN');
      try {
        store.db.prepare("UPDATE outbox SET status='sent' WHERE id=?").run(item.id);
        if (current?.version === body.version) store.putRecord(item.user_id, { ...current, remindedAt: now.toISOString() });
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
      const check = this.store.state('schedule-job', {});
      const first = !this.store.state('warmup-done');
      if (first || (slot && check.slot !== slot) || (slot && check.partial && now.getTime() >= (check.retryAt || 0))) {
        // Persist the attempt before network access; a restart resumes incomplete work.
        this.store.setState('schedule-job', { slot: first ? null : slot, partial: true, retryAt: now.getTime() + 900000 });
        const result = await this.schedule.check(date);
        this.store.setState('warmup-done', true);
        this.store.setState('schedule-job', { slot, partial: result.status !== 'completed', retryAt: this.now().getTime() + 900000 });
      }
      queueReminders(this.store, this.schedule, this.now());
      if (this.telegram) await deliverOutbox(this.store, this.telegram, this.now());
    } finally { this.busy = false; }
  }
  start() {
    const run = () => this.tick().catch(() => console.error('Фоновая задача не завершилась. Будет повторена.'));
    void run(); this.timer = setInterval(run, 30000);
  }
  stop() { clearInterval(this.timer); }
}
