import { addDays, normalizeGroup, type Lesson } from "./schedule";
import type { ScheduleChange } from "./schedule-diff";
export type SportChoice = "all" | "pe" | "chess";
export type Appearance = "system" | "light" | "dark";
export interface UserSettings {
  appearance: Appearance; changeAlerts: boolean; morningEnabled: boolean;
  morningTime: string; schoolDaysOnly: boolean;
}
export interface ChecklistItem { id: string; text: string; done: boolean }
export interface Homework {
  group: string; lessonKey: string; subject: string; lessonDate: string;
  dueDate: string; content: string; done: boolean; updatedAt: string;
  sourceDate: string; autoTarget: boolean; remind: boolean; remindedAt?: string | null;
  photos?: string[]; checklist?: ChecklistItem[];
}
const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
export const homeworkKey = (lesson: Pick<Lesson, "date" | "subject">) => JSON.stringify([lesson.date, normalized(lesson.subject)]);
export function nextSubjectLessons(lessons: Lesson[], group: string, subject: string, after: string): Lesson[] {
  const sorted = lessons.filter(l => l.date > after && !l.cancelled && normalized(l.subject) === normalized(subject) && l.groups.some(g => normalizeGroup(g) === normalizeGroup(group))).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  // Consecutive pairs of the same subject on one day form one homework deadline.
  return sorted.filter((l, index) => index === 0 || l.date !== sorted[index - 1].date);
}
export const reminderDue = (dueDate: string, today: string) => !!dueDate && dueDate >= today && dueDate <= addDays(today, 3);
export function sportKind(lesson: Lesson): "pe" | "chess" | null {
  if (/шахмат/i.test(lesson.subject)) return "chess";
  if (lesson.kind === "lecture" || /лекци/i.test(lesson.type)) return null;
  if (/физкультур|физическ[а-яё]*\s+(?:культур|подготов)|^офп$/i.test(lesson.subject.trim())) return "pe";
  return null;
}
export const matchesSport = (lesson: Lesson, choice: SportChoice) => choice === "all" || sportKind(lesson) === null || sportKind(lesson) === choice;
const lessonState = (l: Lesson) => JSON.stringify([l.date, l.start, l.end, normalized(l.subject), l.type, l.teacher, l.room, l.cancelled]);
const occurrence = (l: Lesson) => JSON.stringify([l.date, l.start, normalized(l.subject)]);
export interface LessonCardData { lesson: Lesson; change?: ScheduleChange; removed: boolean }
export function withChanges(lessons: Lesson[], date: string, changes: ScheduleChange[]): LessonCardData[] {
  const relevant = changes.filter(c => c.date === date).sort((a, b) => (b.detectedAt || "").localeCompare(a.detectedAt || ""));
  const cards: LessonCardData[] = lessons.map(lesson => ({ lesson, removed: false, change: relevant.find(c => c.after && lessonState(c.after) === lessonState(lesson) && c.kind !== "removed") }));
  const handled = new Set(lessons.map(occurrence));
  for (const change of relevant) {
    const l = change.after || change.before;
    if (!l) continue;
    const key = occurrence(l);
    if (change.kind === "removed" && change.before && !handled.has(key)) cards.push({ lesson: { ...change.before, id: `removed-${key}`, cancelled: true }, change, removed: true });
    handled.add(key);
  }
  return cards.sort((a, b) => a.lesson.start.localeCompare(b.lesson.start) || Number(a.removed) - Number(b.removed));
}
export function changedFields(change: ScheduleChange): Array<{ label: string; before: string; after: string }> {
  if (!change.before || !change.after) return [];
  const before = change.before, after = change.after;
  const rows: Array<[string, string, string]> = [
    ["Время", `${before.start}–${before.end}`, `${after.start}–${after.end}`],
    ["Аудитория", before.room || "Не указана", after.room || "Не указана"],
    ["Преподаватель", before.teacher || "Не указан", after.teacher || "Не указан"],
    ["Вид занятия", before.type, after.type],
    ["Статус", before.cancelled ? "Отменено" : "По расписанию", after.cancelled ? "Отменено" : "По расписанию"],
  ];
  return rows.filter(([, a, b]) => a !== b).map(([label, a, b]) => ({ label, before: a, after: b }));
}
