import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, Clock3, LoaderCircle, MapPin, Search, Users } from 'lucide-react';
import type { Lesson, ScheduleDay } from '@/lib/schedule';
import { matchesSport, type Homework, type SportChoice } from '@/lib/student';
import { apiFetch } from './telegram';
import { HomeworkAccess, HomeworkContent } from './homework';
import type { HomeworkStore } from './use-homework';
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const shortDate = (s: string) => s ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${s}T12:00:00Z`)) : 'Дата ожидается';
export function SubjectsPage({ group, store, days, today, sport, onOpenLesson, onHomework }: { group: string; store: HomeworkStore; days: Record<string, ScheduleDay>; today: string; sport: SportChoice; onOpenLesson: (lesson: Lesson) => void; onHomework: () => void }) {
  const [remote, setRemote] = useState<Lesson[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [query, setQuery] = useState(''), [selected, setSelected] = useState<string | null>(null), [history, setHistory] = useState(false), [busy, setBusy] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    void apiFetch(`/api/subjects?group=${encodeURIComponent(group)}`, { signal: controller.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Не удалось загрузить предметы.'); if (!controller.signal.aborted) { setRemote(data.lessons); setError(''); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [group]);
  const subjects = useMemo(() => {
    const entries = new Map<string, { name: string; lessons: Lesson[]; homework: Homework[] }>();
    const ensure = (name: string) => { const key = norm(name); if (!entries.has(key)) entries.set(key, { name, lessons: [], homework: [] }); return entries.get(key)!; };
    // Newer days currently on screen override an older server snapshot by date.
    const loaded = new Set(Object.values(days).filter(d => d.status !== 'unavailable').map(d => d.date));
    const lessons = [...remote.filter(l => !loaded.has(l.date)), ...Object.values(days).filter(d => d.status !== 'unavailable').flatMap(d => d.lessons)];
    for (const l of lessons) if (l.date >= today && !l.cancelled && matchesSport(l, sport)) ensure(l.subject).lessons.push(l);
    for (const r of store.records) ensure(r.subject).homework.push(r);
    for (const entry of entries.values()) entry.lessons.sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    return [...entries.entries()].sort(([,a],[,b]) => a.name.localeCompare(b.name, 'ru'));
  }, [remote, days, store.records, today, sport]);
  const current = subjects.find(([key]) => key === selected)?.[1];
  const tasks = current?.homework.filter(r => r.done === history).sort((a,b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')) || [];
  const toggle = async (record: Homework) => { setBusy(record.lessonKey); setError(''); try { await store.save({ ...record, done: !record.done }); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить статус.'); } finally { setBusy(''); } };
  return <section className={`subjects-page ${current ? 'subject-is-open' : ''}`}>
    <div className="subjects-intro"><BookOpen size={22} /><p>Пары, преподаватели и задания по каждому предмету. Ближайшие занятия показаны по уже загруженному расписанию.</p></div>
    {error && <p className="homework-error" role="alert">{error}</p>}
    <div className="subjects-layout"><div className="subject-directory"><div className="search-field"><Search size={16} /><input placeholder="Найти предмет" aria-label="Поиск предмета" value={query} onChange={e => setQuery(e.target.value)} /></div>
      {loading && <p className="editor-hint" role="status"><LoaderCircle size={14} className="spinning" /> Загружаем предметы…</p>}
      {!subjects.length && !loading && <p className="editor-hint">Предметы появятся после загрузки расписания или добавления первого ДЗ.</p>}
      {subjects.filter(([,s]) => norm(s.name).includes(norm(query))).map(([key,s]) => <button className={`subject-item ${selected === key ? 'selected' : ''}`} key={key} aria-pressed={selected === key} onClick={() => { setSelected(key); setHistory(false); }}><span className="subject-icon"><BookOpen size={19} /></span><span><strong>{s.name}</strong><small>{s.lessons[0] ? `${shortDate(s.lessons[0].date)} · ${s.lessons[0].start}` : 'Следующая пара пока не загружена'}</small><em>{s.homework.filter(r => !r.done).length} ДЗ в работе</em></span><ChevronRight size={16} /></button>)}
      {!!subjects.length && !subjects.some(([,s]) => norm(s.name).includes(norm(query))) && <p className="editor-hint">Такого предмета пока нет.</p>}
    </div>
    <div className="subject-detail">{current ? <><button className="text-button subject-back" onClick={() => setSelected(null)}><ArrowLeft size={16} />Все предметы</button><div className="subject-title"><span className="feature-icon green"><BookOpen size={23} /></span><h2>{current.name}</h2></div>
      <div className="subject-teachers"><Users size={17} /><span>{[...new Set(current.lessons.map(l => l.teacher).filter(Boolean))].join(' · ') || 'Преподаватель появится вместе с расписанием'}</span></div>
      <h3><CalendarDays size={17} />Ближайшие занятия</h3><div className="subject-lessons">{current.lessons.slice(0, 8).map(l => <button key={l.id} onClick={() => onOpenLesson(l)}><span><strong>{shortDate(l.date)}</strong><small><Clock3 size={12} />{l.start}–{l.end}</small></span><span className={`type-tag ${l.kind}`}>{l.type}</span><span className="subject-room"><MapPin size={13} />{l.room || 'Не указана'}</span><ChevronRight size={14} /></button>)}</div>{!current.lessons.length && <p className="editor-hint">Следующая пара пока не загружена. Её можно найти в календаре; опубликованные дни сохранятся здесь.</p>}
      <div className="subject-tasks-heading"><h3>Задания по предмету</h3><button className="text-button" onClick={onHomework}>Все ДЗ<ArrowUpRight size={14} /></button></div><HomeworkAccess store={store} />
      <div className="task-filter"><button className={!history ? 'active' : ''} aria-pressed={!history} onClick={() => setHistory(false)}>В работе<span>{current.homework.filter(r => !r.done).length}</span></button><button className={history ? 'active' : ''} aria-pressed={history} onClick={() => setHistory(true)}>История<span>{current.homework.filter(r => r.done).length}</span></button></div>
      {!tasks.length && store.ready && <p className="subject-empty">{history ? 'Выполненные задания появятся здесь.' : 'По этому предмету нет заданий в работе.'}</p>}
      {tasks.map(r => <article className="task-card subject-task" key={r.lessonKey}><div className="task-card-heading"><button className={`task-check ${r.done ? 'checked' : ''}`} role="checkbox" aria-checked={r.done} aria-label={r.done ? 'Вернуть ДЗ в работу' : 'Отметить ДЗ выполненным'} disabled={busy === r.lessonKey} onClick={() => void toggle(r)}>{busy === r.lessonKey ? <LoaderCircle size={16} className="spinning" /> : r.done ? <Check size={16} /> : null}</button><div><strong>{r.dueDate ? `К ${shortDate(r.dueDate)}` : 'Ждём следующую пару'}</strong><small>Задано {shortDate(r.sourceDate)}</small></div></div><HomeworkContent record={r} store={store} /></article>)}
    </> : <div className="subject-placeholder"><BookOpen size={38} /><h2>Всё по полочкам</h2><p>Выбери предмет, чтобы увидеть его пары и задания.</p></div>}</div></div>
  </section>;
}
