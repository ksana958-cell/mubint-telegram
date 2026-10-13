import { useEffect, useState } from 'react';
import { BellRing, Check, Clock3, LoaderCircle, Moon, Smartphone, Sun, Sunrise, RefreshCw, ArrowUpRight, Monitor } from 'lucide-react';
import { apiFetch, botLink, telegram } from './telegram';
import { currentAppearance, setAppearance } from './season';
import type { Appearance, UserSettings } from '@/lib/student';

function HomeScreenButton() {
  const [status, setStatus] = useState('loading'), [message, setMessage] = useState('');
  useEffect(() => {
    const tg = telegram(); let alive = true;
    if (!tg?.initData || !tg.isVersionAtLeast?.('8.0') || !tg.addToHomeScreen || !tg.checkHomeScreenStatus) { setStatus('unsupported'); return; }
    const added = () => { if (alive) { setStatus('added'); setMessage('Кампус добавлен на главный экран.'); } };
    try { tg.checkHomeScreenStatus(value => { if (alive) setStatus(value); }); tg.onEvent?.('homeScreenAdded', added); }
    catch { setStatus('unsupported'); }
    const timer = setTimeout(() => { if (alive) setStatus(s => s === 'loading' ? 'unknown' : s); }, 2500);
    return () => { alive = false; clearTimeout(timer); tg.offEvent?.('homeScreenAdded', added); };
  }, []);
  const add = () => {
    try { telegram()?.addToHomeScreen?.(); setMessage('Подтверди добавление в окне Telegram. Если окно не появилось, проверь меню приложения ⋮.'); }
    catch { setMessage('Не удалось открыть добавление. Попробуй через меню приложения ⋮.'); }
  };
  return <section className="settings-card homescreen-card"><span className="feature-icon green"><Smartphone size={23} /></span><div><h2>Кампус под рукой</h2><p>Открывай расписание одним нажатием с главного экрана телефона.</p><button className="secondary-button" disabled={status === 'unsupported' || status === 'added' || status === 'loading'} onClick={add}>{status === 'added' ? <Check size={17} /> : <Smartphone size={17} />}{status === 'added' ? 'Ярлык уже добавлен' : status === 'loading' ? 'Проверяем поддержку…' : 'Добавить на главный экран'}</button>{status === 'unsupported' && <p className="editor-hint">В этой версии Telegram функция недоступна. Попробуй в обновлённом Telegram на телефоне: меню мини-приложения ⋮ → «Добавить на главный экран», если этот пункт есть.</p>}{message && <p role="status" className="editor-hint">{message}</p>}</div></section>;
}
export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({ appearance: currentAppearance(), changeAlerts: true, morningEnabled: false, morningTime: '07:30', schoolDaysOnly: true });
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [available, setAvailable] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void apiFetch('/api/settings', { signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Не удалось загрузить настройки.');
      if (!controller.signal.aborted) { setSettings(data.settings); setAvailable(data.remindersAvailable); setReady(true); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const change = (values: Partial<UserSettings>) => { setSettings(s => ({ ...s, ...values })); setSaved(false); };
  const save = async () => {
    setBusy(true); setSaved(false); setError('');
    try {
      const r = await apiFetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Не удалось сохранить настройки.');
      setSettings(data.settings); setAppearance(data.settings.appearance); setAvailable(data.remindersAvailable); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Нет связи. Попробуй ещё раз.'); }
    finally { setBusy(false); }
  };
  const modes: Array<[Appearance, string, typeof Sun]> = [['light', 'Светлая', Sun], ['dark', 'Тёмная', Moon], ['system', 'Как в Telegram', Monitor]];
  return <div className="settings-page">
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <section className="settings-card"><h2>Твой сезон, твой свет</h2><p>Осенью — тёплые оттенки, зимой — прохладные, весной и летом — свежие. Сезон меняется сам.</p><div className="appearance-options">{modes.map(([mode, title, Icon]) => <button type="button" key={mode} disabled={busy} className={settings.appearance === mode ? 'selected' : ''} aria-pressed={settings.appearance === mode} onClick={() => { change({ appearance: mode }); setAppearance(mode); }}><Icon size={21} /><strong>{title}</strong><span>{mode === 'light' ? 'Светлый фон' : mode === 'dark' ? 'Мягче вечером' : 'В браузере — как в системе'}</span></button>)}</div></section>
      <section className="settings-card"><h2><BellRing size={20} />Уведомления</h2><div className="settings-schedule"><Clock3 size={19} /><div><strong>Проверка каждый день в 20:00</strong><span>Московское время · ближайшие 14 дней расписания</span></div></div>
        {!available && ready && <p className="settings-info">Чтобы бот мог присылать сообщения, отправь ему /start или /notifications, затем обнови настройки. <a href={botLink} target="_blank" rel="noreferrer">Открыть бота <ArrowUpRight size={13} /></a><button type="button" className="text-button" onClick={() => setRevision(r => r + 1)}>Обновить</button></p>}
        <label className="settings-toggle"><span><strong>Изменения в расписании</strong><small>Переносы, замены и отмены твоих пар. В сообщении будет ссылка на нужный день.</small></span><input type="checkbox" checked={settings.changeAlerts} disabled={!ready || busy} onChange={e => change({ changeAlerts: e.target.checked })} /></label>
        <label className="settings-toggle"><span><strong><Sunrise size={17} />Утренняя сводка</strong><small>Первая и последняя пара, аудитория и задания на сегодня.</small></span><input type="checkbox" checked={settings.morningEnabled} disabled={!ready || busy} onChange={e => change({ morningEnabled: e.target.checked })} /></label>
        {settings.morningEnabled && <div className="digest-options"><label>Когда присылать · МСК<input type="time" min="05:00" max="11:59" step="60" value={settings.morningTime} required disabled={!ready || busy} onChange={e => change({ morningTime: e.target.value })} /></label><label className="done-option"><input type="checkbox" checked={settings.schoolDaysOnly} disabled={!ready || busy} onChange={e => change({ schoolDaysOnly: e.target.checked })} />Только в дни с занятиями</label></div>}
        <p className="editor-hint">Напоминания о ДЗ включаются в самом задании: за 3 дня, с 07:30 МСК. Команда /stop боту отключает все сообщения.</p>
      </section>
      {loading && <p className="settings-status" role="status"><LoaderCircle size={16} className="spinning" />Загружаем настройки…</p>}
      {error && <p className="homework-error" role="alert">{error}{!ready && <button type="button" className="text-button" onClick={() => setRevision(r => r + 1)}><RefreshCw size={14} />Повторить</button>}</p>}
      <div className="settings-save"><button className="primary-button" type="submit" disabled={!ready || loading || busy}>{busy ? <LoaderCircle size={17} className="spinning" /> : <Check size={17} />}{busy ? 'Сохраняем…' : 'Сохранить настройки'}</button><span role="status">{saved ? 'Настройки сохранены' : 'Тема видна сразу. Сохрани выбор для всех устройств.'}</span></div>
    </form><HomeScreenButton />
  </div>;
}
