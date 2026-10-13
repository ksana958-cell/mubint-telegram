import { useEffect, useRef, useState } from 'react';
import { Check, Download, Image, LoaderCircle, Share2, X } from 'lucide-react';
import type { ScheduleDay } from '@/lib/schedule';
import { matchesSport, type Homework, type SportChoice } from '@/lib/student';
const dateText = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const classCount = (n: number) => `${n} ${n % 100 >= 11 && n % 100 <= 14 ? 'занятий' : n % 10 === 1 ? 'занятие' : n % 10 >= 2 && n % 10 <= 4 ? 'занятия' : 'занятий'}`;

type ShareInput = { group: string; dates: string[]; days: Record<string, ScheduleDay>; sport: SportChoice; homework: Homework[]; includeHomework: boolean };
export async function scheduleImage(input: ShareInput): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 100;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Не удалось создать картинку на этом устройстве.');
  const style = getComputedStyle(document.documentElement), color = (key: string) => style.getPropertyValue(key).trim();
  const palette = { bg: color('--bg'), surface: color('--surface'), ink: color('--ink'), muted: color('--muted'), line: color('--line'), accent: color('--accent-strong'), tint: color('--accent-soft'), banner: color('--banner-start') };
  const font = (size: number, weight = 400) => { ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`; };
  const wrap = (value: string, width: number, size: number, weight = 400, max = 99) => {
    font(size, weight); const lines: string[] = []; let line = '';
    for (const word of value.replace(/\s+/g, ' ').trim().split(' ')) {
      if (ctx.measureText((line ? line + ' ' : '') + word).width <= width) line += (line ? ' ' : '') + word;
      else {
        if (line) lines.push(line); line = '';
        for (const char of word) { if (ctx.measureText(line + char).width > width) { lines.push(line); line = ''; } line += char; }
      }
    }
    if (line) lines.push(line);
    if (lines.length > max) { lines.length = max; let end = lines[max - 1]; while (ctx.measureText(end + '…').width > width) end = end.slice(0, -1); lines[max - 1] = end + '…'; }
    return lines;
  };
  const blocks = input.dates.map(date => {
    const day = input.days[date];
    if (!day || day.status === 'unavailable') throw new Error('Дождись загрузки всех выбранных дней.');
    const lessons = day.lessons.filter(l => matchesSport(l, input.sport)).sort((a,b) => a.start.localeCompare(b.start)).map(lesson => {
      const title = wrap(lesson.subject, 800, 30, 650, 4);
      const meta = wrap(`${lesson.type}${lesson.cancelled ? ' · ОТМЕНЕНО' : ''} · ${lesson.online ? 'Онлайн' : 'Ауд.'} ${lesson.room || 'не указана'}`, 800, 22, 500, 3);
      const teacher = wrap(lesson.teacher || 'Преподаватель не указан', 800, 20, 400, 2);
      return { lesson, title, meta, teacher, height: 38 + title.length * 38 + meta.length * 29 + teacher.length * 27 };
    });
    const tasks = input.includeHomework ? input.homework.filter(r => r.dueDate === date && !r.done).map(r => {
      const excerpt = `${r.subject}: ${r.content} ${(r.checklist || []).map(x => `${x.done ? '✓' : '□'} ${x.text}`).join('; ')}${r.photos?.length ? ` · Фото: ${r.photos.length}` : ''}`;
      const lines = wrap(excerpt, 986, 23, 400, 4); return { lines, height: lines.length * 31 + 20 };
    }) : [];
    const height = 70 + (lessons.length ? lessons.reduce((n,l) => n + l.height + 12, 0) : 72) + (tasks.length ? 56 + tasks.reduce((n,t) => n + t.height, 0) : 0) + 28;
    return { date, day, lessons, tasks, height };
  });
  const height = 255 + blocks.reduce((n,b) => n + b.height, 0) + 145;
  if (height > 16000) throw new Error('Слишком много текста для одной картинки. Выбери один день или убери ДЗ.');
  canvas.height = height;
  const text = (value: string, x: number, y: number, size: number, weight = 400, fill = palette.ink) => { font(size, weight); ctx.fillStyle = fill; ctx.fillText(value, x, y); };
  const rect = (x: number,y: number,w: number,h: number,fill: string,radius = 20) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x,y,w,h,radius); ctx.fill(); };
  ctx.fillStyle = palette.bg; ctx.fillRect(0,0,1200,height);
  rect(48,36,1104,184,palette.banner,28);
  text('кампус.',80,87,36,750,palette.accent); text('МУБиНТ',982,84,24,650,palette.accent);
  text(input.group,80,143,43,750); text(input.dates.length === 1 ? dateText(input.dates[0],{ day:'numeric',month:'long',year:'numeric' }) : `${dateText(input.dates[0],{day:'numeric',month:'short'})} — ${dateText(input.dates.at(-1)!,{day:'numeric',month:'long',year:'numeric'})}`,80,187,26,500);
  let y = 263;
  for (const block of blocks) {
    text(dateText(block.date,{weekday:'long',day:'numeric',month:'long'}),64,y,29,700);
    text(classCount(block.lessons.filter(l => !l.lesson.cancelled).length),998,y,21,500,palette.muted); y += 26;
    if (!block.lessons.length) { rect(64,y,1072, 60,palette.surface); text('На эту дату занятия не опубликованы',88,y+38,23,400,palette.muted); y += 72; }
    for (const row of block.lessons) {
      rect(64,y,1072,row.height,palette.surface); rect(64,y+20,5,row.height-40,palette.accent,2);
      text(row.lesson.start,88,y+47,31,700); text(row.lesson.end,88,y+79,23,450,palette.muted);
      let lineY = y+42;
      for (const line of row.title) { text(line,244,lineY,30,650); lineY += 38; }
      for (const line of row.meta) { text(line,244,lineY,22,500,palette.accent); lineY += 29; }
      for (const line of row.teacher) { text(line,244,lineY,20,400,palette.muted); lineY += 27; }
      y += row.height+12;
    }
    if (block.tasks.length) {
      text('МОИ ДЗ · КРАТКО',88,y+29,21,700,palette.accent); y += 56;
      for (const task of block.tasks) { for (const line of task.lines) { text(line,88,y+24,23); y += 31; } y += 20; }
    }
    y += 54;
  }
  ctx.strokeStyle = palette.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(64,y); ctx.lineTo(1136,y); ctx.stroke();
  text('lk.mubint.ru · Время московское',64,y+40,22,500,palette.muted);
  const stamp = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date());
  text(`Снимок расписания · ${stamp}${blocks.some(b => b.day.status !== 'live') ? ' · Есть сохранённые копии' : ''}`,64,y+76,20,400,palette.muted);
  const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Не удалось сохранить картинку.')), 'image/png'));
  canvas.width = 0; canvas.height = 0; return blob;
}

export function ShareSchedule({ group, date, week, days, sport, homework, view, onClose }: { group: string; date: string; week: string[]; days: Record<string, ScheduleDay>; sport: SportChoice; homework: Homework[]; view: 'day'|'week'; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), [range,setRange] = useState(view), [include,setInclude] = useState(false), [url,setUrl] = useState(''), [file,setFile] = useState<File | null>(null), [busy,setBusy] = useState(true), [error,setError] = useState(''), [message,setMessage] = useState('');
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  useEffect(() => {
    let alive = true, objectUrl = ''; setBusy(true); setError(''); setFile(null); setUrl(''); setMessage('');
    void scheduleImage({ group, dates: range === 'day' ? [date] : week, days, sport, homework, includeHomework: include }).then(blob => {
      if (!alive) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); setFile(new File([blob],`campus-${group}-${date}-${range}.png`,{type:'image/png'}));
    }).catch(e => { if (alive) setError(e.message || 'Не удалось создать картинку.'); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [group,date,week,days,sport,homework,range,include]);
  const nativeShare = !!file && !!navigator.canShare?.({files:[file]});
  const share = async () => {
    if (!file) return;
    try { await navigator.share({ files:[file], title:`Расписание ${group}` }); setMessage('Картинка передана в меню отправки.'); }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError('Системная отправка недоступна. Сохрани картинку и прикрепи её в Telegram.'); }
  };
  return <dialog ref={ref} className="share-dialog" aria-labelledby="share-title" onCancel={e => { e.preventDefault(); onClose(); }}><div className="dialog-top"><span>РАСПИСАНИЕ В КАРТИНКЕ</span><button className="icon-button" onClick={onClose} aria-label="Закрыть экспорт"><X size={21} /></button></div><h2 id="share-title">Поделись учебными планами</h2><p>Группа {group} · фото личных заданий в картинку не попадают.</p>
    <div className="share-options"><div className="view-toggle"><button aria-pressed={range==='day'} className={range==='day'?'selected':''} onClick={() => setRange('day')}>День</button><button aria-pressed={range==='week'} className={range==='week'?'selected':''} onClick={() => setRange('week')}>Неделя</button></div><label className="done-option"><input type="checkbox" checked={include} onChange={e => setInclude(e.target.checked)} />Добавить краткие записи моих ДЗ</label></div>
    {busy ? <div className="share-loading" role="status"><LoaderCircle className="spinning" />Готовим картинку…</div> : url ? <div className="share-preview"><img src={url} alt={`Предпросмотр расписания группы ${group}`} /></div> : null}
    {error && <p className="homework-error" role="alert">{error}</p>}<div className="share-actions">{nativeShare && <button className="primary-button" disabled={busy} onClick={() => void share()}><Share2 size={17} />Отправить</button>}{url && <a href={url} download={file?.name} className="secondary-button" onClick={() => setMessage('Если файл не сохранился, открой картинку и удерживай её для сохранения.')}><Download size={17} />Сохранить PNG</a>}{url && <a className="text-button" href={url} target="_blank" rel="noreferrer"><Image size={16} />Открыть картинку</a>}</div>
    {message && <p role="status" className="editor-hint"><Check size={14} />{message}</p>}{!nativeShare && !busy && file && <p className="editor-hint">Сохрани PNG или удерживай картинку для сохранения, затем прикрепи её в чат Telegram.</p>}
  </dialog>;
}
