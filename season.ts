import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { apiFetch } from './telegram';

function usePhoto(id: string) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    setUrl(''); setError('');
    void apiFetch(`/api/photos/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async r => {
      if (!r.ok) { const data = await r.json(); throw new Error(data.error || 'Не удалось загрузить фото.'); }
      const blob = await r.blob();
      if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || 'Нет связи.'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, retry]);
  return { url, error, reload: () => setRetry(x => x + 1) };
}
function Photo({ id, alt }: { id: string; alt: string }) {
  const { url, error } = usePhoto(id);
  return url ? <img src={url} alt={alt} loading="lazy" /> : <span className="photo-placeholder">{error ? 'Не загрузилось · открой ещё раз' : <LoaderCircle size={20} className="spinning" />}</span>;
}
function PhotoViewer({ ids, initial, onClose }: { ids: string[]; initial: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), [index, setIndex] = useState(initial), [zoom, setZoom] = useState(1);
  const { url, error, reload } = usePhoto(ids[index]);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  const move = (offset: number) => { setIndex(i => Math.max(0, Math.min(ids.length - 1, i + offset))); setZoom(1); };
  return <dialog className="photo-lightbox" ref={ref} aria-label="Фотография домашнего задания" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="photo-viewer-bar"><strong>Фото {index + 1} / {ids.length}</strong><div><button type="button" className="icon-button" disabled={zoom === 1} onClick={() => setZoom(z => Math.max(1, z - .5))} aria-label="Уменьшить фото"><ZoomOut size={21} /></button><button type="button" className="icon-button" disabled={zoom === 3} onClick={() => setZoom(z => Math.min(3, z + .5))} aria-label="Увеличить фото"><ZoomIn size={21} /></button><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть фото"><X size={23} /></button></div></div>
    <div className="photo-viewport" tabIndex={0} aria-label="Фото: увеличь и прокручивай для чтения">{url ? <img src={url} alt={`Фотография задания ${index + 1}`} style={{ width: `${zoom * 100}%` }} /> : error ? <div className="photo-load-error"><p>{error}</p><button type="button" className="secondary-button" onClick={reload}><RefreshCw size={16} />Повторить</button></div> : <LoaderCircle className="spinning" />}</div>
    <div className="photo-viewer-footer"><button type="button" className="secondary-button" onClick={() => move(-1)} disabled={index === 0}><ChevronLeft size={19} />Назад</button><span>{Math.round(zoom * 100)}%</span><button type="button" className="secondary-button" onClick={() => move(1)} disabled={index === ids.length - 1}>Далее<ChevronRight size={19} /></button></div>
  </dialog>;
}
export function PhotoGallery({ ids, onRemove, disabled = false }: { ids: string[]; onRemove?: (id: string) => void; disabled?: boolean }) {
  const [opened, setOpened] = useState<number | null>(null);
  if (!ids.length) return null;
  return <><div className="photo-grid">{ids.map((id, i) => <div className="photo-tile" key={id}><button type="button" className="photo-open" onClick={() => setOpened(i)} aria-label={`Открыть фото задания ${i + 1}`}><Photo id={id} alt={`Фото задания ${i + 1}`} /><span><ZoomIn size={13} /> {i + 1}</span></button>{onRemove && <button type="button" className="photo-remove" disabled={disabled} onClick={() => onRemove(id)} aria-label={`Убрать фото ${i + 1}`}><X size={15} /></button>}</div>)}</div>{opened !== null && ids[opened] && <PhotoViewer ids={ids} initial={opened} onClose={() => setOpened(null)} />}</>;
}
async function compressPhoto(file: File) {
  if (file.size > 35 * 1024 * 1024) throw new Error('Исходное фото больше 35 МБ. Выбери снимок поменьше.');
  if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) throw new Error('Выбери фотографию из галереи.');
  const src = URL.createObjectURL(file), img = new Image();
  try {
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Не удалось открыть снимок. Попробуй JPEG или скриншот.')); img.src = src; });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('Пустое изображение.');
    const ratio = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Телефон не смог обработать фото. Попробуй снова.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Не удалось подготовить фото.')), 'image/jpeg', .88));
    canvas.width = 0; canvas.height = 0;
    if (blob.size > 4 * 1024 * 1024) throw new Error('Фото слишком большое после обработки. Попробуй обрезать лишнее.');
    return blob;
  } finally { URL.revokeObjectURL(src); }
}
export function PhotoPicker({ photos, setPhotos, disabled, onBusy }: { photos: string[]; setPhotos: (value: string[]) => void; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(''), [error, setError] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  const upload = async (input: HTMLInputElement) => {
    const files = Array.from(input.files || []); input.value = ''; if (!files.length) return;
    if (files.length + photos.length > 6) { setError('К одному заданию можно прикрепить до 6 фотографий.'); return; }
    const request = new AbortController(); controller.current = request;
    onBusy(true); setError(''); const next = [...photos];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Загружаем фото ${i + 1} из ${files.length}…`);
        const blob = await compressPhoto(files[i]); if (request.signal.aborted) return;
        const response = await apiFetch('/api/photos', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob, signal: request.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Не удалось загрузить фото.');
        next.push(data.id); setPhotos([...next]);
      }
    } catch (e) { if (!request.signal.aborted) setError(e instanceof Error ? e.message : 'Не удалось загрузить фото.'); }
    finally { if (!request.signal.aborted) { setProgress(''); onBusy(false); } }
  };
  return <section className="photo-picker" aria-label="Фотографии задания"><div className="field-heading"><strong>Фотографии задания</strong><span>{photos.length} / 6</span></div>
    <PhotoGallery ids={photos} disabled={disabled || !!progress} onRemove={id => setPhotos(photos.filter(p => p !== id))} />
    <div className="photo-buttons"><button type="button" className="secondary-button" disabled={disabled || !!progress || photos.length >= 6} onClick={() => camera.current?.click()}><Camera size={17} />Снять фото</button><button type="button" className="secondary-button" disabled={disabled || !!progress || photos.length >= 6} onClick={() => gallery.current?.click()}><ImagePlus size={17} />Из галереи</button></div>
    <input type="file" accept="image/*" capture="environment" ref={camera} hidden onChange={e => void upload(e.currentTarget)} /><input type="file" accept="image/*" multiple ref={gallery} hidden onChange={e => void upload(e.currentTarget)} />
    <p className="editor-hint">Сними задание с проектора. Фото можно увеличить; текст к нему необязателен. После прикрепления нажми «Сохранить задание».</p>
    {progress && <p className="upload-progress" role="status"><LoaderCircle size={15} className="spinning" />{progress}</p>}{error && <p className="homework-error" role="alert">{error}</p>}
  </section>;
}
