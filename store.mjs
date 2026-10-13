import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export const defaultSettings = { appearance: 'system', changeAlerts: true, morningEnabled: false, morningTime: '07:30', schoolDaysOnly: true };
export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', chat_id TEXT, group_code TEXT NOT NULL DEFAULT '', sport TEXT NOT NULL DEFAULT 'all', notifications INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS homework (user_id TEXT NOT NULL, group_code TEXT NOT NULL, lesson_key TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(user_id,group_code,lesson_key));
      CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, detected_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS changes_date ON changes(date);
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, body TEXT NOT NULL, change_cursor INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS photos_owner ON photos(user_id);
    `);
    // Additive migration: existing homework JSON and delivery history stay intact.
    for (const user of this.users()) this.ensureSettings(user.id);
  }
  state(key, fallback = null) { const row = this.db.prepare('SELECT value FROM state WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
  setState(key, value) { this.db.prepare('INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  user(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  touchUser(user) { this.db.prepare('INSERT INTO users(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(user.id, user.name || ''); this.ensureSettings(user.id); return this.user(user.id); }
  startUser(user, chatId) { this.touchUser(user); this.db.prepare('UPDATE users SET chat_id=?,notifications=1 WHERE id=?').run(String(chatId), user.id); }
  preferences(id, group, sport) {
    const old = this.user(id);
    this.db.prepare('UPDATE users SET group_code=?,sport=? WHERE id=?').run(group, sport, id);
    if (old?.group_code !== group || old?.sport !== sport) this.setChangeCursor(id, this.latestChangeId());
  }
  users() { return this.db.prepare('SELECT * FROM users').all(); }
  ensureSettings(id) { this.db.prepare('INSERT OR IGNORE INTO settings(user_id,body,change_cursor) VALUES(?,?,?)').run(id, JSON.stringify(defaultSettings), this.latestChangeId()); }
  settings(id) { const row = this.db.prepare('SELECT body FROM settings WHERE user_id=?').get(id); return { ...defaultSettings, ...(row ? JSON.parse(row.body) : {}) }; }
  updateSettings(id, values) {
    this.ensureSettings(id);
    const before = this.settings(id), next = { ...before, ...values };
    this.db.prepare('UPDATE settings SET body=? WHERE user_id=?').run(JSON.stringify(next), id);
    if (before.changeAlerts !== next.changeAlerts) this.setChangeCursor(id, this.latestChangeId());
    return next;
  }
  latestChangeId() { return this.db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM changes').get().id; }
  changeCursor(id) { return this.db.prepare('SELECT change_cursor FROM settings WHERE user_id=?').get(id)?.change_cursor || 0; }
  setChangeCursor(id, value) { this.db.prepare('UPDATE settings SET change_cursor=? WHERE user_id=?').run(value, id); }
  changesSince(id) { return this.db.prepare('SELECT id,body FROM changes WHERE id>? ORDER BY id LIMIT 3000').all(id).map(r => ({ id: r.id, change: JSON.parse(r.body) })); }
  records(user, group) { return this.db.prepare('SELECT body FROM homework WHERE user_id=? AND group_code=?').all(user, group).map(r => JSON.parse(r.body)); }
  record(user, group, key) { const row = this.db.prepare('SELECT body FROM homework WHERE user_id=? AND group_code=? AND lesson_key=?').get(user, group, key); return row ? JSON.parse(row.body) : null; }
  allHomework() { return this.db.prepare('SELECT user_id,body FROM homework').all().map(r => ({ userId: r.user_id, record: JSON.parse(r.body) })); }
  putRecord(user, record) {
    const previous = this.record(user, record.group, record.lessonKey);
    this.db.prepare('INSERT INTO homework VALUES(?,?,?,?) ON CONFLICT(user_id,group_code,lesson_key) DO UPDATE SET body=excluded.body').run(user, record.group, record.lessonKey, JSON.stringify(record));
    for (const id of previous?.photos || []) if (!(record.photos || []).includes(id)) this.deletePhoto(user, id);
  }
  deleteRecord(user, group, key) {
    const previous = this.record(user, group, key);
    this.db.prepare('DELETE FROM homework WHERE user_id=? AND group_code=? AND lesson_key=?').run(user, group, key);
    for (const id of previous?.photos || []) this.deletePhoto(user, id);
  }
  photo(user, id) { return this.db.prepare('SELECT * FROM photos WHERE user_id=? AND id=?').get(user, id); }
  ownsPhoto(user, id) { return !!this.db.prepare('SELECT id FROM photos WHERE user_id=? AND id=?').get(user, id); }
  photoBytes(user) { return this.db.prepare('SELECT COALESCE(SUM(length(data)),0) AS n FROM photos WHERE user_id=?').get(user).n; }
  putPhoto(user, id, mime, bytes, createdAt) { this.db.prepare('INSERT INTO photos VALUES(?,?,?,?,?)').run(id, user, mime, bytes, createdAt); }
  photoReferenced(user, id) { return this.db.prepare('SELECT body FROM homework WHERE user_id=?').all(user).some(r => (JSON.parse(r.body).photos || []).includes(id)); }
  deletePhoto(user, id) { if (this.photoReferenced(user, id)) return false; this.db.prepare('DELETE FROM photos WHERE user_id=? AND id=?').run(user, id); return true; }
  cleanPhotos(now) {
    const cutoff = new Date(now.getTime() - 86400000).toISOString();
    const used = new Set(this.allHomework().flatMap(({ userId, record }) => (record.photos || []).map(id => JSON.stringify([userId, id]))));
    for (const row of this.db.prepare('SELECT id,user_id FROM photos WHERE created_at<?').all(cutoff)) {
      if (!used.has(JSON.stringify([row.user_id, row.id]))) this.db.prepare('DELETE FROM photos WHERE user_id=? AND id=?').run(row.user_id, row.id);
    }
  }
  day(date) { const row = this.db.prepare('SELECT body FROM days WHERE date=?').get(date); return row ? JSON.parse(row.body) : null; }
  putDay(day) { this.db.prepare('INSERT INTO days VALUES(?,?) ON CONFLICT(date) DO UPDATE SET body=excluded.body').run(day.date, JSON.stringify(day)); }
  days(after, end) { return this.db.prepare('SELECT body FROM days WHERE date>? AND date<=? ORDER BY date').all(after, end).map(r => JSON.parse(r.body)); }
  putChange(change) { this.db.prepare('INSERT INTO changes(date,detected_at,body) VALUES(?,?,?)').run(change.date, change.detectedAt, JSON.stringify(change)); }
  changes(after) { return this.db.prepare('SELECT body FROM changes WHERE date>=? ORDER BY detected_at DESC,id DESC LIMIT 3000').all(after).map(r => JSON.parse(r.body)); }
  enqueue(id, userId, body) { this.db.prepare('INSERT OR IGNORE INTO outbox(id,user_id,body) VALUES(?,?,?)').run(id, userId, JSON.stringify(body)); }
  close() { this.db.close(); }
}
