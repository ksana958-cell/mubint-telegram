import { useEffect, useRef, useState } from 'react';
import { Check, Download, Image, LoaderCircle, Share2, X } from 'lucide-react';
import type { ScheduleDay } from '@/lib/schedule';
import { matchesSport, type SportChoice } from '@/lib/student';
const dateText = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

type ShareInput = { dates: string[]; days: Record<string, ScheduleDay>; sport: SportChoice };
export async function scheduleImage(input: ShareInput): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 100;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Не удалось создать картинку на этом устройстве.');
  const style = getComputedStyle(document.documentElement), color = (key: string) => style.getPropertyValue(key).trim();
  const palette = { bg: color('--bg'), surface: color('--surface'), ink: color('--ink'), muted: color('--muted'), accent: color('--accent-strong') };
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
    const height = 54 + (lessons.length ? lessons.reduce((n,l) => n + l.height, 0) + (lessons.length - 1) * 12 : 60);
    return { date, lessons, height };
  });
  const height = 128 + blocks.reduce((n,b) => n + b.height, 0) + Math.max(0, blocks.length - 1) * 32;
  if (height > 16000) throw new Error('Слишком много текста для одной картинки. Выбери один день.');
  canvas.height = height;
  const text = (value: string, x: number, y: number, size: number, weight = 400, fill = palette.ink) => { font(size, weight); ctx.fillStyle = fill; ctx.fillText(value, x, y); };
  const rect = (x: number,y: number,w: number,h: number,fill: string,radius = 20) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x,y,w,h,radius); ctx.fill(); };
  ctx.fillStyle = palette.bg; ctx.fillRect(0,0,1200,height);
  let y = 64;
  for (const block of blocks) {
    text(dateText(block.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}),64,y+28,29,700); y += 54;
    if (!block.lessons.length) { rect(64,y,1072, 60,palette.surface); text('На эту дату занятия не опубликованы',88,y+38,23,400,palette.muted); y += 60; }
    for (const [index, row] of block.lessons.entries()) {
      rect(64,y,1072,row.height,palette.surface); rect(64,y+20,5,row.height-40,palette.accent,2);
      text(row.lesson.start,88,y+47,31,700); text(row.lesson.end,88,y+79,23,450,palette.muted);
      let lineY = y+42;
      for (const line of row.title) { text(line,244,lineY,30,650); lineY += 38; }
      for (const line of row.meta) { text(line,244,lineY,22,500,palette.accent); lineY += 29; }
      for (const line of row.teacher) { text(line,244,lineY,20,400,palette.muted); lineY += 27; }
      y += row.height + (index < block.lessons.length - 1 ? 12 : 0);
    }
    y += 32;
  }
  const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Не удалось сохранить картинку.')), 'image/png'));
  canvas.width = 0; canvas.height = 0; return blob;
}

export function ShareSchedule({ date, week, days, sport, view, onClose }: { date: string; week: string[]; days: Record<string, ScheduleDay>; sport: SportChoice; view: 'day'|'week'; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), [range,setRange] = useState(view), [url,setUrl] = useState(''), [file,setFile] = useState<File | null>(null), [busy,setBusy] = useState(true), [error,setError] = useState(''), [message,setMessage] = useState('');
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  useEffect(() => {
    let alive = true, objectUrl = ''; setBusy(true); setError(''); setFile(null); setUrl(''); setMessage('');
    void scheduleImage({ dates: range === 'day' ? [date] : week, days, sport }).then(blob => {
      if (!alive) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); setFile(new File([blob],`raspisanie-${date}-${range}.png`,{type:'image/png'}));
    }).catch(e => { if (alive) setError(e.message || 'Не удалось создать картинку.'); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [date,week,days,sport,range]);
  const hasCachedDays = (range === 'day' ? [date] : week).some(value => days[value] && days[value].status !== 'live');
  const nativeShare = !!file && !!navigator.canShare?.({files:[file]});
  const share = async () => {
    if (!file) return;
    try { await navigator.share({ files:[file] }); setMessage('Картинка передана в меню отправки.'); }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError('Системная отправка недоступна. Сохрани картинку и прикрепи её в Telegram.'); }
  };
  return <dialog ref={ref} className="share-dialog" aria-labelledby="share-title" onCancel={e => { e.preventDefault(); onClose(); }}><div className="dialog-top"><span>РАСПИСАНИЕ В КАРТИНКЕ</span><button className="icon-button" onClick={onClose} aria-label="Закрыть экспорт"><X size={21} /></button></div><h2 id="share-title">Поделиться расписанием</h2><p>Только даты и расписание занятий.</p>
    <div className="share-options"><div className="view-toggle"><button aria-pressed={range==='day'} className={range==='day'?'selected':''} onClick={() => setRange('day')}>День</button><button aria-pressed={range==='week'} className={range==='week'?'selected':''} onClick={() => setRange('week')}>Неделя</button></div></div>
    {busy ? <div className="share-loading" role="status"><LoaderCircle className="spinning" />Готовим картинку…</div> : url ? <div className="share-preview"><img src={url} alt="Предпросмотр расписания" /></div> : null}
    {hasCachedDays && !busy && url && <p className="editor-hint">Часть расписания загружена из сохранённой копии.</p>}
    {error && <p className="homework-error" role="alert">{error}</p>}<div className="share-actions">{nativeShare && <button className="primary-button" disabled={busy} onClick={() => void share()}><Share2 size={17} />Отправить</button>}{url && <a href={url} download={file?.name} className="secondary-button" onClick={() => setMessage('Если файл не сохранился, открой картинку и удерживай её для сохранения.')}><Download size={17} />Сохранить PNG</a>}{url && <a className="text-button" href={url} target="_blank" rel="noreferrer"><Image size={16} />Открыть картинку</a>}</div>
    {message && <p role="status" className="editor-hint"><Check size={14} />{message}</p>}{!nativeShare && !busy && file && <p className="editor-hint">Сохрани PNG или удерживай картинку для сохранения, затем прикрепи её в чат Telegram.</p>}
  </dialog>;
}
