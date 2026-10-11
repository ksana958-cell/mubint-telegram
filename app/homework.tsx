"use client";
import { apiFetch, storage, telegram, botLink } from "./telegram";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Check, CheckCheck, BellRing, CalendarDays, ClipboardList, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { homeworkKey, reminderDue, type Homework } from "@/lib/student";
import { addDays, type Lesson } from "@/lib/schedule";
import type { HomeworkDraft, HomeworkStore } from "./use-homework";

const shortDate = (date: string) => !date ? "дата пока не опубликована" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export function HomeworkAccess({ store }: { store: HomeworkStore }) {
  if (store.ready) return null;
  return <div className="homework-access" role="status">
    {store.loading ? <><LoaderCircle size={15} className="spinning" /> Загружаем личные задания…</> : <>
      <span>{store.error || "Задания пока недоступны."}</span>
      {store.authRequired ? <a className="text-button" href={botLink} target="_blank" rel="noreferrer">Открыть бота <ArrowUpRight size={14} /></a> : <button className="text-button" onClick={store.reload}><RefreshCw size={14} /> Повторить</button>}
    </>}
  </div>;
}

function HomeworkEditor({ record, subject, sourceDate, group, store, onClose }: { record?: Homework; subject: string; sourceDate: string; group: string; store: HomeworkStore; onClose: () => void }) {
  const id = useId();
  const [content, setContent] = useState(record?.content || "");
  const [dueDate, setDueDate] = useState(record?.dueDate || "");
  const [autoTarget, setAutoTarget] = useState(record?.autoTarget ?? true);
  const [remind, setRemind] = useState(record?.remind ?? store.remindersAvailable);
  const [done, setDone] = useState(record?.done || false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [next, setNext] = useState<Lesson[]>([]);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setChecking(true); setCheckError(false);
    const params = new URLSearchParams({ group, subject, date: sourceDate });
    apiFetch(`/api/homework/next?${params}`, { signal: controller.signal, cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error("Cannot find the next lesson");
      const data = await r.json() as { lessons: Lesson[] };
      if (!controller.signal.aborted) setNext(data.lessons);
    }).catch(() => { if (!controller.signal.aborted) setCheckError(true); }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [group, subject, sourceDate, retry]);
  const targetDate = autoTarget ? next[0]?.date || "" : dueDate;
  const submit = async (remove = false) => {
    setBusy(true); setError("");
    try {
      if (remove) await store.remove({ subject, sourceDate });
      else await store.save({ subject, sourceDate, lessonDate: targetDate, dueDate: targetDate, autoTarget, remind, content, done });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Нет связи. Текст остался в редакторе — попробуй ещё раз."); }
    finally { setBusy(false); }
  };
  return <form className="homework-editor assignment-editor" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="editor-heading"><label htmlFor={`${id}-text`}>{record ? "Задание, записанное на этой паре" : "Что задали на этой паре?"}</label></div>
    <textarea id={`${id}-text`} value={content} onChange={event => setContent(event.target.value)} placeholder="Например: решить задачи 1–5 и прочитать главу 3…" maxLength={4000} rows={4} required disabled={busy} />
    <div className="assignment-target"><CalendarDays size={20} /><div><span>{autoTarget ? "К следующему занятию" : "Выбранный срок"}</span><strong>{autoTarget && checking ? "Ищем следующую пару…" : autoTarget && checkError ? "Не удалось проверить расписание" : targetDate ? `${shortDate(targetDate)}${autoTarget && next[0] ? ` · ${next[0].start}` : ""}` : "Ждём публикации следующей пары"}</strong>{autoTarget && !checking && !checkError && <p>{next[0] ? next[0].type : "ДЗ сохранится. Дату подставим автоматически, когда она появится в расписании."}</p>}</div>{autoTarget && checkError && <button type="button" className="text-button" onClick={() => setRetry(n => n + 1)}>Повторить</button>}</div>
    <button className="text-button target-mode" type="button" disabled={busy} onClick={() => { setAutoTarget(!autoTarget); if (!dueDate) setDueDate(next[0]?.date || addDays(sourceDate, 1)); }}>{autoTarget ? "Выбрать другую дату" : "Привязать к ближайшей паре автоматически"}</button>
    {!autoTarget && <label className="manual-deadline" htmlFor={`${id}-date`}>Дата занятия<input id={`${id}-date`} type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} min={record && record.lessonDate <= sourceDate ? undefined : addDays(sourceDate, 1)} required disabled={busy} /></label>}
    <label className="reminder-option"><input type="checkbox" checked={remind} disabled={busy || !store.remindersAvailable} onChange={event => setRemind(event.target.checked)} /><BellRing size={17} /><span>Напомнить за 3 дня<small>{store.remindersAvailable ? "В Telegram · за 3 дня, в 07:30 МСК. Если добавишь задание позже — напомним при ближайшей проверке." : "Для напоминаний отправь /start или /notifications боту, затем открой приложение заново."}</small></span></label>
    {record && <label className="done-option assignment-done"><input type="checkbox" checked={done} onChange={event => setDone(event.target.checked)} disabled={busy} /> Выполнено</label>}
    <p className="editor-hint">Личная запись. Двойные пары одного предмета в один день используют одно ДЗ.</p>
    {error && <p className="homework-error" role="alert">{error}</p>}
    <div className="editor-actions"><button className="save-homework" type="submit" disabled={busy || !content.trim() || (!autoTarget && !dueDate) || (autoTarget && (checking || checkError))}>{busy ? <LoaderCircle size={15} className="spinning" /> : <Check size={15} />} {busy ? "Сохраняем…" : "Сохранить задание"}</button><button className="text-button" type="button" onClick={onClose} disabled={busy}>Отмена</button>{record && <button className="delete-homework" type="button" disabled={busy} onClick={() => setDeleting(!deleting)} aria-label="Удалить задание"><Trash2 size={16} /></button>}</div>
    {deleting && <div className="delete-confirm"><span>Удалить это задание?</span><button type="button" onClick={() => void submit(true)} disabled={busy}>Удалить</button><button type="button" onClick={() => setDeleting(false)} disabled={busy}>Оставить</button></div>}
  </form>;
}

export function LessonDialog({ lesson, group, store, onClose }: { lesson: Lesson; group: string; store: HomeworkStore; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current; element?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previous; };
  }, []);
  const record = store.records.find(r => r.lessonKey === homeworkKey(lesson));
  const incoming = store.records.filter(r => r.lessonDate === lesson.date && homeworkKey({ date: r.lessonDate, subject: r.subject }) === homeworkKey(lesson) && r.sourceDate !== lesson.date);
  const toggle = async (r: Homework) => {
    setBusy(r.lessonKey); setError("");
    try { await store.save({ ...r, done: !r.done }); } catch { setError("Не удалось сохранить статус. Попробуй ещё раз."); }
    finally { setBusy(null); }
  };
  return <dialog className="lesson-dialog" ref={dialog} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-top"><span>ПАРА · {shortDate(lesson.date)} · {lesson.start}</span><button className="icon-button" onClick={onClose} aria-label="Закрыть окно пары"><X size={20} /></button></div>
    <h2 id={`${id}-title`}>{lesson.subject}</h2><p className="dialog-meta">{lesson.type} · {lesson.room || "Аудитория не указана"}</p>
    <HomeworkAccess store={store} />
    {store.ready && <>
      {!!incoming.length && <section className="incoming-homework"><h3>Подготовить к этой паре</h3>{incoming.map(r => <div className={r.done ? "is-done" : ""} key={r.lessonKey}><button className={`task-check ${r.done ? "checked" : ""}`} aria-label={r.done ? "Вернуть задание в работу" : "Отметить задание выполненным"} role="checkbox" aria-checked={r.done} disabled={busy === r.lessonKey} onClick={() => void toggle(r)}>{busy === r.lessonKey ? <LoaderCircle size={16} className="spinning" /> : r.done ? <Check size={16} /> : null}</button><p>{r.content}<small>Задано {shortDate(r.sourceDate)}</small></p></div>)}</section>}
      {error && <p className="homework-error" role="alert">{error}</p>}
      <HomeworkEditor key={record?.lessonKey || "new"} record={record} group={group} subject={lesson.subject} sourceDate={lesson.date} store={store} onClose={onClose} />
    </>}
  </dialog>;
}

export function HomeworkBoard({ store, today, onOpenDay }: { store: HomeworkStore; today: string; onOpenDay: (date: string) => void }) {
  const [filter, setFilter] = useState<"pending" | "done" | "all">("pending");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState("");
  const remaining = store.records.filter(record => !record.done);
  const list = store.records.filter(record => filter === "all" || (filter === "done" ? record.done : !record.done)).sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.subject.localeCompare(b.subject, "ru"));
  const toggle = async (record: HomeworkDraft & { lessonKey: string }) => {
    setPending(p => [...p, record.lessonKey]); setError("");
    try { await store.save({ ...record, done: !record.done }); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить статус."); }
    finally { setPending(p => p.filter(key => key !== record.lessonKey)); }
  };
  return <section className="homework-board" aria-label="Личные домашние задания">
    <div className="homework-board-intro"><span className="feature-icon green"><ClipboardList size={23} /></span><div><h2>Меньше держать в голове</h2><p>Нажми на пару в расписании — запиши ДЗ к следующему занятию. Все задания собраны здесь.</p></div>{store.ready && <span className="tasks-remaining">{remaining.length}<small>в работе</small></span>}</div>
    <HomeworkAccess store={store} />
    {store.ready && remaining.some(r => reminderDue(r.dueDate, today)) && <div className="homework-due-notice"><BellRing size={18} /><span>Есть ДЗ к занятиям в ближайшие три дня. Самое время подготовиться.</span></div>}
    {store.ready && <>
      <div className="task-filter" aria-label="Статус задания">{([["pending", "В работе", remaining.length], ["done", "Выполнено", store.records.length - remaining.length], ["all", "Все", store.records.length]] as const).map(([key, label, count]) => <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key} className={filter === key ? "active" : ""}>{label}<span>{count}</span></button>)}</div>
      {error && <p className="homework-error" role="alert">{error}</p>}
      {!list.length ? <div className="empty-state task-empty"><span>{filter === "done" ? <CheckCheck size={26} /> : <ClipboardList size={26} />}</span><h3>{filter === "done" ? "Выполненных заданий пока нет" : remaining.length === 0 && store.records.length ? "Все задания выполнены" : "Здесь появятся твои задания"}</h3><p>{store.records.length && filter === "pending" ? "Можно выдохнуть и заняться своими планами." : "Нажми на карточку пары в расписании и запиши, что задали."}</p><button className="secondary-button" onClick={() => onOpenDay(today)}>Открыть расписание</button></div> : <div className="task-list">{list.map(record => <article className={`task-card ${record.done ? "is-done" : ""}`} key={record.lessonKey}>
        <div className="task-card-heading"><button className={`task-check ${record.done ? "checked" : ""}`} role="checkbox" aria-checked={record.done} aria-label={`${record.done ? "Вернуть в работу" : "Отметить выполненным"}: ${record.subject}`} disabled={pending.includes(record.lessonKey) || editing === record.lessonKey} onClick={() => void toggle(record)}>{pending.includes(record.lessonKey) ? <LoaderCircle size={16} className="spinning" /> : record.done ? <Check size={16} /> : null}</button><div><h3>{record.subject}</h3><span className={`task-deadline ${!record.done && !!record.dueDate && record.dueDate < today ? "overdue" : ""}`}>{!record.done && !!record.dueDate && record.dueDate < today ? "Срок прошёл · " : record.dueDate ? "К занятию " : ""}{shortDate(record.dueDate)}</span></div><button className="icon-button" onClick={() => setEditing(editing === record.lessonKey ? null : record.lessonKey)} disabled={pending.includes(record.lessonKey)} aria-label={`Редактировать ДЗ: ${record.subject}`}><Pencil size={16} /></button></div>
        {editing === record.lessonKey ? <HomeworkEditor record={record} group={record.group} subject={record.subject} sourceDate={record.sourceDate} store={store} onClose={() => setEditing(null)} /> : <p className="task-content">{record.content}</p>}
        <div className="task-card-footer"><span>{record.remind ? record.remindedAt ? "Напоминание отправлено" : "Напомним за 3 дня" : "Личная запись"}</span><button onClick={() => onOpenDay(record.lessonDate || record.sourceDate)}>{record.lessonDate ? `К паре ${shortDate(record.lessonDate)}` : `Задано ${shortDate(record.sourceDate)}`} <ArrowUpRight size={13} /></button></div>
      </article>)}</div>}
    </>}
  </section>;
}
