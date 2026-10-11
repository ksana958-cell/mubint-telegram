import { ArrowRight, MapPin, Timer } from 'lucide-react';
import type { Lesson } from '@/lib/schedule';
const minute = (time: string) => Number(time.slice(0,2)) * 60 + Number(time.slice(3));
const duration = (n: number) => n >= 60 ? `${Math.floor(n / 60)} ч${n % 60 ? ` ${n % 60} мин` : ''}` : `${n} мин`;
export function LiveLesson({ lessons, now, date, today }: { lessons: Lesson[]; now: string; date: string; today: string }) {
  if (date !== today || !now) return null;
  const sorted = lessons.filter(l => !l.cancelled).slice().sort((a,b) => a.start.localeCompare(b.start));
  const index = sorted.findIndex(l => l.end > now), current = sorted[index];
  if (!current) return null;
  const ongoing = current.start <= now;
  const remaining = Math.max(0, minute(ongoing ? current.end : current.start) - minute(now));
  const elapsed = Math.max(0, Math.min(100, 100 * (minute(now) - minute(current.start)) / Math.max(1, minute(current.end) - minute(current.start))));
  const next = sorted[index + 1];
  return <div className="live-lesson"><div className="live-countdown"><Timer size={17} /><strong>{ongoing ? 'До конца' : 'До начала'} {duration(remaining)}</strong>{ongoing && <span>{Math.round(elapsed)}%</span>}</div>
    {ongoing && <div className="lesson-progress" role="progressbar" aria-label="Прошло времени текущей пары" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed)}><i style={{ width: `${elapsed}%` }} /></div>}
    {ongoing && (next ? <div className="live-next"><ArrowRight size={15} /><span>Дальше в {next.start}: <strong>{next.subject}</strong><small><MapPin size={12} />{next.room ? `Ауд. ${next.room}` : 'Аудитория пока не указана'}</small></span></div> : <p className="live-last">Последняя пара на сегодня — скоро можно выдохнуть.</p>)}
  </div>;
}
