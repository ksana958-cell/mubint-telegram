import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
    `);
  }
  state(key, fallback = null) { const row = this.db.prepare('SELECT value FROM state WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
  setState(key, value) { this.db.prepare('INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  user(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  touchUser(user) { this.db.prepare('INSERT INTO users(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(user.id, user.name || ''); return this.user(user.id); }
  startUser(user, chatId) { this.touchUser(user); this.db.prepare('UPDATE users SET chat_id=?,notifications=1 WHERE id=?').run(String(chatId), user.id); }
  preferences(id, group, sport) { this.db.prepare('UPDATE users SET group_code=?,sport=? WHERE id=?').run(group, sport, id); }
  users() { return this.db.prepare('SELECT * FROM users').all(); }
  records(user, group) { return this.db.prepare('SELECT body FROM homework WHERE user_id=? AND group_code=?').all(user, group).map(r => JSON.parse(r.body)); }
  record(user, group, key) { const row = this.db.prepare('SELECT body FROM homework WHERE user_id=? AND group_code=? AND lesson_key=?').get(user, group, key); return row ? JSON.parse(row.body) : null; }
  allHomework() { return this.db.prepare('SELECT user_id,body FROM homework').all().map(r => ({ userId: r.user_id, record: JSON.parse(r.body) })); }
  putRecord(user, record) { this.db.prepare('INSERT INTO homework VALUES(?,?,?,?) ON CONFLICT(user_id,group_code,lesson_key) DO UPDATE SET body=excluded.body').run(user, record.group, record.lessonKey, JSON.stringify(record)); }
  deleteRecord(user, group, key) { this.db.prepare('DELETE FROM homework WHERE user_id=? AND group_code=? AND lesson_key=?').run(user, group, key); }
  day(date) { const row = this.db.prepare('SELECT body FROM days WHERE date=?').get(date); return row ? JSON.parse(row.body) : null; }
  putDay(day) { this.db.prepare('INSERT INTO days VALUES(?,?) ON CONFLICT(date) DO UPDATE SET body=excluded.body').run(day.date, JSON.stringify(day)); }
  days(after, end) { return this.db.prepare('SELECT body FROM days WHERE date>? AND date<=? ORDER BY date').all(after, end).map(r => JSON.parse(r.body)); }
  putChange(change) { this.db.prepare('INSERT INTO changes(date,detected_at,body) VALUES(?,?,?)').run(change.date, change.detectedAt, JSON.stringify(change)); }
  changes(after) { return this.db.prepare('SELECT body FROM changes WHERE date>=? ORDER BY detected_at DESC,id DESC LIMIT 3000').all(after).map(r => JSON.parse(r.body)); }
  enqueue(id, userId, body) { this.db.prepare('INSERT OR IGNORE INTO outbox(id,user_id,body) VALUES(?,?,?)').run(id, userId, JSON.stringify(body)); }
  close() { this.db.close(); }
}
