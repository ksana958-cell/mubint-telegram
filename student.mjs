import { addDays, normalizeGroup } from "./schedule.mjs";
const normalized = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");
export const homeworkKey = (lesson) => JSON.stringify([lesson.date, normalized(lesson.subject)]);
export function nextSubjectLessons(lessons, group, subject, after) {
    const sorted = lessons.filter(l => l.date > after && !l.cancelled && normalized(l.subject) === normalized(subject) && l.groups.some(g => normalizeGroup(g) === normalizeGroup(group))).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    // Consecutive pairs of the same subject on one day form one homework deadline.
    return sorted.filter((l, index) => index === 0 || l.date !== sorted[index - 1].date);
}
export const reminderDue = (dueDate, today) => !!dueDate && dueDate >= today && dueDate <= addDays(today, 3);
export function sportKind(lesson) {
    if (/шахмат/i.test(lesson.subject))
        return "chess";
    if (lesson.kind === "lecture" || /лекци/i.test(lesson.type))
        return null;
    if (/физкультур|физическ[а-яё]*\s+(?:культур|подготов)|^офп$/i.test(lesson.subject.trim()))
        return "pe";
    return null;
}
export const matchesSport = (lesson, choice) => choice === "all" || sportKind(lesson) === null || sportKind(lesson) === choice;
const lessonState = (l) => JSON.stringify([l.date, l.start, l.end, normalized(l.subject), l.type, l.teacher, l.room, l.cancelled]);
const occurrence = (l) => JSON.stringify([l.date, l.start, normalized(l.subject)]);
export function withChanges(lessons, date, changes) {
    const relevant = changes.filter(c => c.date === date).sort((a, b) => (b.detectedAt || "").localeCompare(a.detectedAt || ""));
    const cards = lessons.map(lesson => ({ lesson, removed: false, change: relevant.find(c => c.after && lessonState(c.after) === lessonState(lesson) && c.kind !== "removed") }));
    const handled = new Set(lessons.map(occurrence));
    for (const change of relevant) {
        const l = change.after || change.before;
        if (!l)
            continue;
        const key = occurrence(l);
        if (change.kind === "removed" && change.before && !handled.has(key))
            cards.push({ lesson: { ...change.before, id: `removed-${key}`, cancelled: true }, change, removed: true });
        handled.add(key);
    }
    return cards.sort((a, b) => a.lesson.start.localeCompare(b.lesson.start) || Number(a.removed) - Number(b.removed));
}
export function changedFields(change) {
    if (!change.before || !change.after)
        return [];
    const before = change.before, after = change.after;
    const rows = [
        ["Время", `${before.start}–${before.end}`, `${after.start}–${after.end}`],
        ["Аудитория", before.room || "Не указана", after.room || "Не указана"],
        ["Преподаватель", before.teacher || "Не указан", after.teacher || "Не указан"],
        ["Вид занятия", before.type, after.type],
        ["Статус", before.cancelled ? "Отменено" : "По расписанию", after.cancelled ? "Отменено" : "По расписанию"],
    ];
    return rows.filter(([, a, b]) => a !== b).map(([label, a, b]) => ({ label, before: a, after: b }));
}
