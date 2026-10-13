import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseSchedule, sourceUrl, addDays, normalizeGroup } from './shared/schedule.mjs';
import { diffLessons } from './shared/schedule-diff.mjs';
import { nextSubjectLessons } from './shared/student.mjs';
export class ScheduleService {
  constructor(store, { fetcher = fetch, now = () => new Date(), seed = true } = {}) {
    this.store = store; this.fetcher = fetcher; this.now = now; this.pending = new Map(); this.failures = new Map(); this.active = 0; this.waiters = [];
    this.catalog = JSON.parse(readFileSync(new URL('../seed/groups.json', import.meta.url), 'utf8')).groups;
    if (seed) for (const day of Object.values(JSON.parse(readFileSync(new URL('../seed/snapshot.json', import.meta.url), 'utf8')))) {
      if (!store.day(day.date)) store.putDay({ ...day, status: 'snapshot' });
    }
  }
  async limit(fn) {
    if (this.active >= 2) await new Promise(resolve => this.waiters.push(resolve));
    this.active++;
    try { return await fn(); } finally { this.active--; this.waiters.shift()?.(); }
  }
  async getDay(date, force = false) {
    const existing = this.store.day(date), now = this.now().getTime();
    if (!force && existing?.status === 'live' && now - Date.parse(existing.fetchedAt) < 300000) return existing;
    if (!force && now - (this.failures.get(date) || 0) < 60000) return this.fallback(date);
    if (this.pending.has(date)) return this.pending.get(date);
    const task = this.limit(async () => {
      try {
        const response = await this.fetcher(sourceUrl(date), { headers: { Accept: 'text/html', 'User-Agent': 'Campus-MUBiNT-Schedule/1.0' }, signal: AbortSignal.timeout(18000), redirect: 'follow' });
        if (!response.ok) throw new Error(`Источник HTTP ${response.status}`);
        const html = await response.text();
        if (html.length > 6000000) throw new Error('Слишком большой ответ источника');
        const lessons = parseSchedule(html, date), fetchedAt = this.now().toISOString();
        const old = this.store.day(date);
        const changes = old ? diffLessons(old.lessons, lessons).map(c => ({ ...c, detectedAt: fetchedAt })) : [];
        const day = { date, lessons, fetchedAt, status: 'live', source: sourceUrl(date) };
        this.store.db.exec('BEGIN');
        try { this.store.putDay(day); for (const c of changes) this.store.putChange(c); this.store.db.exec('COMMIT'); }
        catch (e) { this.store.db.exec('ROLLBACK'); throw e; }
        this.failures.delete(date);
        return day;
      } catch {
        this.failures.set(date, this.now().getTime());
        return this.fallback(date);
      }
    }).finally(() => this.pending.delete(date));
    this.pending.set(date, task);
    return task;
  }
  fallback(date) {
    const stored = this.store.day(date);
    return stored ? { ...stored, status: stored.status === 'snapshot' ? 'snapshot' : 'cached', message: 'Сайт вуза временно не ответил. Показана сохранённая копия — проверь изменения в источнике.' }
      : { date, lessons: [], fetchedAt: null, status: 'unavailable', source: sourceUrl(date), message: 'Не удалось получить расписание с сайта вуза. Попробуй обновить или открой источник.' };
  }
  upcoming(group, subject, sourceDate) {
    const days = this.store.days(sourceDate, addDays(sourceDate, 42));
    return { lessons: nextSubjectLessons(days.flatMap(d => d.lessons), group, subject, sourceDate).slice(0, 8), dates: days.map(d => d.date) };
  }
  syncRecord(userId, record) {
    if (!record.autoTarget || record.done) return record;
    const { lessons, dates } = this.upcoming(record.group, record.subject, record.sourceDate);
    const target = lessons[0]?.date || (dates.includes(record.lessonDate) ? '' : record.lessonDate);
    if (target === record.lessonDate) return record;
    const changed = { ...record, lessonDate: target, dueDate: target, version: randomUUID(), remindedAt: null, updatedAt: this.now().toISOString() };
    this.store.putRecord(userId, changed);
    return changed;
  }
  syncAll() { for (const { userId, record } of this.store.allHomework()) this.syncRecord(userId, record); }
  async check(startDate) {
    if (this.checking) return this.checking;
    this.checking = (async () => {
      const startedAt = this.now().toISOString();
      const run = { id: randomUUID(), startedAt, checkedAt: startedAt, startDate, endDate: addDays(startDate, 13), status: 'running', checkedDays: 0, failedDates: [], baselineDays: 0, totalChanges: 0, changes: [] };
      this.store.setState('monitor', run);
      const dates = Array.from({ length: 14 }, (_, i) => addDays(startDate, i));
      const initial = new Map(dates.map(date => [date, this.store.day(date)]));
      const results = await Promise.all(dates.map(date => this.getDay(date, true)));
      for (const day of results) {
        if (day.status !== 'live') { run.failedDates.push(day.date); continue; }
        run.checkedDays++;
        const before = initial.get(day.date);
        if (!before) run.baselineDays++; else run.changes.push(...diffLessons(before.lessons, day.lessons).map(c => ({ ...c, detectedAt: day.fetchedAt })));
      }
      run.totalChanges = run.changes.length; run.checkedAt = this.now().toISOString(); run.status = run.failedDates.length ? 'partial' : 'completed';
      this.store.setState('monitor', run); this.syncAll();
      return run;
    })().finally(() => { this.checking = null; });
    return this.checking;
  }
  monitor(group, config) {
    const match = c => c.groups.some(g => normalizeGroup(g) === normalizeGroup(group));
    const latest = this.store.state('monitor');
    const changes = latest?.changes.filter(match) || [];
    return { schedule: config.background ? { enabled: true, automationId: 'bothost', firstRun: `${config.anchor}T20:00:00+03:00`, time: '20:00', cadence: 'daily', timezone: 'Europe/Moscow' } : null,
      latest: latest ? { ...latest, changes, totalChanges: changes.length } : null,
      recentChanges: this.store.changes(addDays(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(this.now()), -7)).filter(match).slice(0, 100) };
  }
}
