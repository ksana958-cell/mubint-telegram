export type LessonKind = "lecture" | "practice" | "exam" | "other";
export interface Lesson {
  id: string; date: string; pair: number; start: string; end: string;
  type: string; kind: LessonKind; subject: string; teacher: string; room: string;
  groups: string[]; online: boolean; cancelled: boolean; added: boolean;
}
export interface ScheduleDay {
  date: string; lessons: Lesson[]; fetchedAt: string | null;
  status: "live" | "cached" | "snapshot" | "unavailable";
  source: string; message?: string;
}
export const sourceUrl = (date: string) => `https://lk.mubint.ru/schedule/nextday/${date.replaceAll("-", "")}/`;
export function validDate(value: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function addDays(date: string, count: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function monday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}
export const normalizeGroup = (group: string) => group.toUpperCase().replace(/[\s\u00a0]/g, "").replace(/[–—]/g, "-");
export function forGroup(lessons: Lesson[], group: string) {
  return lessons.filter(lesson => lesson.groups.some(g => normalizeGroup(g) === normalizeGroup(group)));
}
export function moscowToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clean(value: string) {
  const named: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", laquo: "«", raquo: "»" };
  return value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
      if (entity[0] === "#") {
        const n = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
      }
      return named[entity.toLowerCase()] ?? whole;
    }).replace(/\s+/g, " ").trim();
}
export function parseSchedule(html: string, date: string): Lesson[] {
  if (!validDate(date)) throw new Error("Invalid date");
  if (!/<table\b[^>]*id=["']sampleTable["']/i.test(html) || !html.includes("Нагрузка")) throw new Error("Schedule table missing");
  const heading = html.match(/<p\b[^>]*text-align:\s*center;\s*font-weight:\s*bold;[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const months = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  if (!heading) throw new Error("Schedule date missing");
  const parts = clean(heading).toLowerCase().match(/^(\d{1,2})\s+([а-яё]+)/);
  if (!parts || Number(parts[1]) !== Number(date.slice(8)) || months.indexOf(parts[2]) + 1 !== Number(date.slice(5, 7))) throw new Error("Schedule date mismatch");
  const lessons: Lesson[] = [];
  for (const row of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    if (!/\ball_row\b/.test(row[1])) continue;
    const cells = [...row[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => clean(c[1]));
    if (cells.length !== 6) throw new Error("Schedule columns changed");
    const [time, type, subject, teacher, room, groups] = cells;
    const times = time.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
    if (!times || !subject || !groups) throw new Error("Schedule row incomplete");
    const kind: LessonKind = /лекци/i.test(type) ? "lecture" : /практическ/i.test(type) ? "practice" : /экзам|зач[её]т|пересдач/i.test(type) ? "exam" : "other";
    lessons.push({ id: `${date}-${lessons.length}`, date, pair: Number(row[1].match(/para(\d+)/)?.[1] || 0),
      start: times[1].padStart(5, "0"), end: times[2].padStart(5, "0"), type, kind, subject, teacher, room,
      groups: groups.split(/,\s*/).map(g => g.trim()).filter(Boolean), online: /эиос|moodle|онлайн|дистанц/i.test(`${type} ${room}`),
      cancelled: /\bschedule_delete\b/.test(row[1]), added: /\bschedule_add\b/.test(row[1]) });
  }
  return lessons;
}
