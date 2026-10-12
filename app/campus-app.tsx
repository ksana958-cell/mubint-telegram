"use client";
import { apiFetch, storage, telegram, botLink } from "./telegram";
import { currentSeason, SEASON_EVENT, seasonNames } from "./season";
import { Leaf, Snowflake, Flower2, Sun } from "lucide-react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCheck, ClipboardList, BellRing, Dumbbell, Crown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CircleHelp, Clock3, Coffee, ExternalLink, GraduationCap, LayoutGrid, List, MapPin, Monitor, RefreshCw, Search, Sparkles, Users, WifiOff, X } from "lucide-react";
import { addDays, monday, moscowToday, normalizeGroup, sourceUrl, validDate, type Lesson, type LessonKind, type ScheduleDay } from "@/lib/schedule";

import type { MonitorStatus, ScheduleChange } from "@/lib/schedule-diff";
import { changedFields, matchesSport, withChanges, type SportChoice } from "@/lib/student";
import { useHomework } from "./use-homework";
import { HomeworkBoard, LessonDialog } from "./homework";
import { LiveLesson } from "./live-lesson";
import { SubjectsPage } from "./subjects";
import { SettingsPage } from "./settings";
import { ShareSchedule } from "./share-schedule";
import { Settings2, Share2, MoreHorizontal } from "lucide-react";
type Section = "today" | "calendar" | "homework" | "changes" | "subjects" | "settings";
const sports: Array<[SportChoice, string]> = [["all", "Все варианты"], ["pe", "Физкультура"], ["chess", "Шахматы"]];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const labels: Record<LessonKind, string> = { lecture: "Лекции", practice: "Практика", exam: "Контроль", other: "Другие" };
const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const plural = (n: number, forms = ["пара", "пары", "пар"]) => `${n} ${n % 100 >= 11 && n % 100 <= 14 ? forms[2] : n % 10 === 1 ? forms[0] : n % 10 >= 2 && n % 10 <= 4 ? forms[1] : forms[2]}`;
const timeMsk = () => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const readableUpdated = (v: string | null) => v ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—";
const initialDate = () => { const date = moscowToday(); return new Date(`${date}T12:00:00Z`).getUTCDay() === 0 ? addDays(date, 1) : date; };

function Mark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>;
}

function SeasonBadge() {
  const [season, setSeason] = useState(currentSeason);
  useEffect(() => {
    const update = () => setSeason(currentSeason());
    window.addEventListener(SEASON_EVENT, update);
    update();
    return () => window.removeEventListener(SEASON_EVENT, update);
  }, []);
  const Icon = { winter: Snowflake, spring: Flower2, summer: Sun, autumn: Leaf }[season];
  return <span className="season-badge" title="Оформление меняется автоматически по сезону" aria-label={`Сезонное оформление: ${seasonNames[season]}`}><Icon size={14} aria-hidden="true" /><span>{seasonNames[season]}</span></span>;
}

function CalendarArt({ compact = false }: { compact?: boolean }) {
  return <div className={`calendar-art ${compact ? "compact" : ""}`} aria-hidden="true">
    <div className="orbit orbit-one" /><div className="orbit orbit-two" />
    <div className="calendar-paper back" />
    <div className="calendar-paper front"><div className="paper-rings"><i /><i /></div><div className="paper-label">ВСЁ УСПЕЕТСЯ</div><div className="paper-grid">{Array.from({ length: 15 }, (_, i) => <i key={i} className={i === 7 ? "marked" : i === 10 ? "minted" : ""}>{i === 7 ? <Check size={17} strokeWidth={3} /> : ""}</i>)}</div></div>
    <div className="art-sticker sticker-one"><BookOpen size={15} /><span>Лекция</span><span className="sticker-time">08:30</span></div>
    <div className="art-sticker sticker-two"><Sparkles size={14} /><span>Практика</span><Check size={13} /></div>
    <span className="art-star star-one">✳</span><span className="art-star star-two">✳</span>
  </div>;
}

export default function CampusApp({ initialGroups }: { initialGroups: string[] }) {
  const [group, setGroup] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [groupStep, setGroupStep] = useState<"group" | "sport">("group");
  const [sportDraft, setSportDraft] = useState<SportChoice | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [openedLesson, setOpenedLesson] = useState<Lesson | null>(null);
  const [groups, setGroups] = useState(initialGroups);
  const [groupQuery, setGroupQuery] = useState("");
  const [limit, setLimit] = useState(24);
  const [date, setDate] = useState(initialDate);
  const [days, setDays] = useState<Record<string, ScheduleDay>>({});
  const [loadingDates, setLoadingDates] = useState<string[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [view, setView] = useState<"day" | "week">("day");
  const [filter, setFilter] = useState<"all" | LessonKind>("all");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [now, setNow] = useState("");
  const [recentGroups, setRecentGroups] = useState<string[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [monitor, setMonitor] = useState<MonitorStatus | null>(null);
  const [monitorError, setMonitorError] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => initialDate().slice(0, 7));
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState<Section>("today");
  const [sportChoices, setSportChoices] = useState<Record<string, SportChoice>>({});
  const homework = useHomework(group);
  const sportChoice = sportChoices[normalizeGroup(group || "")] || "all";
  const requestCounter = useRef(0);
  const weekStart = monday(date);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekTitle = weekStart.slice(0, 7) === week[6].slice(0, 7) ? `${fmt(weekStart, { day: "numeric" })}–${fmt(week[6], { day: "numeric", month: "long" })}` : `${fmt(weekStart, { day: "numeric", month: "short" })} – ${fmt(week[6], { day: "numeric", month: "short" })}`;
  const today = moscowToday();

  useEffect(() => {
    setNow(timeMsk());
    try {
      const stored = storage.getItem("mubint.group");

      const storedSports = JSON.parse(storage.getItem("mubint.sports") || "{}");
      if (storedSports && typeof storedSports === "object" && !Array.isArray(storedSports)) setSportChoices(Object.fromEntries(Object.entries(storedSports).filter(([key, value]) => key.length <= 80 && ["all", "pe", "chess"].includes(String(value)))) as Record<string, SportChoice>);
      const recent = JSON.parse(storage.getItem("mubint.recent") || "[]");
      if (Array.isArray(recent)) setRecentGroups(recent.filter(g => typeof g === "string").slice(0, 4));
      if (stored && stored.length <= 80) {
        setGroup(stored); setSelectedGroup(stored);
        const choice = storedSports?.[normalizeGroup(stored)];
        if (["all", "pe", "chess"].includes(choice)) { setSportDraft(choice); setChoosing(false); }
        else { setGroupStep("sport"); setChoosing(true); }
      }
      const params = new URLSearchParams(window.location.search), target = params.get("section"), targetDate = params.get("date");
      if (target && ["homework", "today", "changes", "subjects", "settings"].includes(target)) setSection(target as Section);
      if (targetDate && validDate(targetDate)) setDate(targetDate);
    } catch { /* The app remains usable when browser storage is disabled. */ }
    const tick = setInterval(() => setNow(timeMsk()), 30000);
    const controller = new AbortController();
    apiFetch(`/api/groups?date=${initialDate()}`, { signal: controller.signal }).then(async r => r.ok ? await r.json() as { groups: string[] } : null).then(data => { if (Array.isArray(data?.groups)) setGroups(data.groups); }).catch(() => {});
    return () => { clearInterval(tick); controller.abort(); };
  }, []);

  useEffect(() => {
    if (!group || choosing) return;
    const controller = new AbortController();
    setMonitorError(false);
    apiFetch(`/api/monitor/status?group=${encodeURIComponent(group)}`, { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("Monitor unavailable");
      return await r.json() as MonitorStatus;
    }).then(data => { if (!controller.signal.aborted) setMonitor(data); }).catch(() => { if (!controller.signal.aborted) setMonitorError(true); });
    return () => controller.abort();
  }, [group, choosing, refreshToken]);
  useEffect(() => { setCalendarMonth(date.slice(0, 7)); }, [date]);
  useEffect(() => {
    if (!group || choosing) return;
    const id = ++requestCounter.current;
    const controller = new AbortController();
    const ordered = [date, ...week.filter(d => d !== date)];
    setLoadingDates([...ordered]);
    const worker = async () => {
      while (ordered.length && !controller.signal.aborted) {
        const next = ordered.shift()!;
        try {
          const query = new URLSearchParams({ date: next, group, ...(refreshToken ? { refresh: "1" } : {}) });
          const response = await apiFetch(`/api/schedule?${query}`, { signal: controller.signal });
          if (!response.ok) throw new Error("Fetch failed");
          const data = await response.json() as ScheduleDay;
          if (id !== requestCounter.current) return;
          setDays(prev => ({ ...prev, [next]: data }));
          try { storage.setItem(`mubint.day.${group}.${next}`, JSON.stringify(data)); } catch {}
        } catch {
          if (controller.signal.aborted || id !== requestCounter.current) return;
          let cached: ScheduleDay | null = null;
          try { cached = JSON.parse(storage.getItem(`mubint.day.${group}.${next}`) || "null"); } catch {}
          const fallback: ScheduleDay = cached && cached.date === next ? { ...cached, status: "cached", message: "Нет связи. Показана сохранённая копия расписания." } : { date: next, lessons: [], fetchedAt: null, status: "unavailable", source: sourceUrl(next), message: "Не удалось загрузить расписание. Проверьте соединение или откройте сайт вуза." };
          setDays(prev => ({ ...prev, [next]: fallback }));
        } finally { if (id === requestCounter.current && !controller.signal.aborted) setLoadingDates(prev => prev.filter(d => d !== next)); }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => controller.abort();
    // Changing a selected day in the same week uses already loaded data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, choosing, weekStart, refreshToken]);

  useEffect(() => {
    if (!group || choosing) return;
    const refresh = () => { if (document.visibilityState === "visible") setRefreshToken(n => n + 1); };
    const interval = setInterval(refresh, 5 * 60 * 1000);
    const visibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", visibility); };
  }, [group, choosing]);

  const chooseGroup = useCallback((value: string, sport: SportChoice = "all") => {
    const chosen = value.trim().toUpperCase();
    if (!chosen) return;
    setSection("today"); setMonitor(null); setGroup(chosen); setSelectedGroup(chosen); setChoosing(false); setDays({}); setFilter("all"); setSubjectQuery(""); setNotice("");
    if (telegram()?.initData) void apiFetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group: chosen, sport }) }).then(r => { if (!r.ok) throw new Error(); }).catch(() => setNotice("Группа выбрана на этом устройстве. Не удалось синхронизировать её с Telegram — выбери её повторно при восстановлении связи."));
    const recent = [chosen, ...recentGroups.filter(g => g !== chosen)].slice(0, 4);
    setRecentGroups(recent);
    try { storage.setItem("mubint.group", chosen); storage.setItem("mubint.recent", JSON.stringify(recent)); } catch { setNotice("Браузер не разрешил сохранить группу. После закрытия её нужно будет выбрать снова."); }
  }, [recentGroups]);
  const openGroups = () => { setSelectedGroup(group || ""); setGroupQuery(""); setLimit(24); setGroupStep("group"); setSportDraft(null); setChoosing(true); };
  const scrollTo = (id?: string) => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  const navigate = (next: Section) => {
    if (!group) { document.getElementById("group-search")?.focus(); return; }
    setChoosing(false); setSection(next);
    if (next === "today") { setDate(today); setView("day"); if (window.matchMedia("(max-width: 900px)").matches) setCalendarOpen(false); }
    if (next === "calendar") { setCalendarOpen(true); setCalendarMonth(date.slice(0, 7)); }
    scrollTo(next === "calendar" ? "schedule-calendar" : undefined);
  };
  const openDay = (value: string) => {
    setDate(value); setView("day"); setSection("today"); setChoosing(false);
    if (window.matchMedia("(max-width: 900px)").matches) { setCalendarOpen(false); scrollTo("day-lessons"); }
    else scrollTo();
  };
  const changeSport = (value: SportChoice, forGroup = group || "") => {
    if (!forGroup) return;
    const next = { ...sportChoices, [normalizeGroup(forGroup)]: value };
    setSportChoices(next);
    try { storage.setItem("mubint.sports", JSON.stringify(next)); } catch { setNotice("Выбор действует сейчас, но браузер не разрешил запомнить его на этом устройстве."); }
  };
  const filteredGroups = useMemo(() => groups.filter(g => normalizeGroup(g).includes(normalizeGroup(groupQuery))).sort((a, b) => {
    const ay = Number(a.slice(0, 2)) || 0, by = Number(b.slice(0, 2)) || 0;
    return by - ay || a.localeCompare(b, "ru");
  }), [groups, groupQuery]);
  const selectedDay = days[date];
  const lessons = (selectedDay?.lessons || []).filter(l => matchesSport(l, sportChoice));
  const activeLessons = lessons.filter(l => !l.cancelled);
  const weekLessons = week.flatMap(d => days[d]?.lessons || []).filter(l => !l.cancelled && matchesSport(l, sportChoice));
  const allWeekLoaded = week.every(d => days[d] && days[d].status !== "unavailable");
  const nextLesson = activeLessons.find(l => date > today || (date === today && l.end > now));
  const ongoing = !!nextLesson && date === today && nextLesson.start <= now && nextLesson.end > now;
  const displayDays = view === "week" ? week : [date];
  const visibleLesson = (l: Lesson) => matchesSport(l, sportChoice) && (filter === "all" || (filter === "other" ? ["other", "exam"].includes(l.kind) : l.kind === filter)) && `${l.subject} ${l.teacher} ${l.room}`.toLowerCase().includes(subjectQuery.toLowerCase());
  const calendarFirst = `${calendarMonth}-01`;
  const gridStart = monday(calendarFirst);
  // Only keep the sixth row when the month reaches it.
  const monthEnd = new Date(Date.UTC(Number(calendarMonth.slice(0, 4)), Number(calendarMonth.slice(5)), 0)).getUTCDate();
  const calCount = Math.ceil((Number(calendarFirst.slice(8)) - 1 + ((new Date(`${calendarFirst}T12:00:00Z`).getUTCDay() + 6) % 7) + monthEnd) / 7) * 7;
  const calDays = Array.from({ length: calCount }, (_, i) => addDays(gridStart, i));
  const shiftMonth = (delta: number) => { const d = new Date(`${calendarMonth}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + delta); setCalendarMonth(d.toISOString().slice(0, 7)); };
  const statusFresh = selectedDay?.status === "live";
  const changeVisible = (change: ScheduleChange) => !!(change.after || change.before) && matchesSport((change.after || change.before)!, sportChoice);
  const changes = (monitor?.recentChanges || monitor?.latest?.changes || []).filter(changeVisible);
  const filteredMonitor = monitor ? { ...monitor, recentChanges: changes, latest: monitor.latest ? { ...monitor.latest, changes: monitor.latest.changes.filter(changeVisible), totalChanges: monitor.latest.changes.filter(changeVisible).length } : null } : null;
  const scheduleVisible = section === "today" || section === "calendar";
  const sectionTitle = section === "homework" ? "Мои задания" : section === "changes" ? "Изменения" : section === "subjects" ? "Мои предметы" : section === "settings" ? "Настройки" : "Моё расписание";
  const tasksCount = homework.records.filter(record => !record.done).length;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Кампус — главная"><Mark /><span>кампус<span className="brand-dot">.</span></span></a>
      <div className="academy"><span className="academy-symbol"><GraduationCap size={22} /></span><div><strong>МУБиНТ</strong><span>Твой учебный ритм</span></div></div>
      <p className="nav-label">ПРОСТРАНСТВО СТУДЕНТА</p>
      <nav aria-label="Основная навигация">
        <button className={`nav-item ${!choosing && scheduleVisible ? "active" : ""}`} onClick={() => navigate("today")}><CalendarDays size={19} />Моё расписание{!choosing && scheduleVisible && <i />}</button>
        <button className={`nav-item ${!choosing && section === "homework" ? "active" : ""}`} onClick={() => navigate("homework")}><ClipboardList size={19} />Мои задания{tasksCount > 0 && <span className="nav-count">{tasksCount}</span>}</button>
        <button className={`nav-item ${!choosing && section === "subjects" ? "active" : ""}`} onClick={() => navigate("subjects")}><BookOpen size={19} />Мои предметы</button>
        <button className={`nav-item ${!choosing && section === "changes" ? "active" : ""}`} onClick={() => navigate("changes")}><BellRing size={19} />Изменения{!choosing && section === "changes" && <i />}</button>
        <button className={`nav-item ${choosing ? "active" : ""}`} onClick={openGroups}><Users size={19} />Моя группа{choosing && <i />}</button>
        <button className={`nav-item ${!choosing && section === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}><Settings2 size={19} />Настройки</button>
      </nav>
      {group && <button className="sidebar-group" onClick={openGroups}><span className="group-avatar">{group.slice(0, 2)}</span><span><small>ТВОЯ ГРУППА</small><strong>{group}</strong></span><ChevronDown size={15} /></button>}
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="tiny-orbit">✳</span><p>Больше времени<br /><strong>на студенческую жизнь.</strong></p></div><a href="https://mubint.ru/" target="_blank" rel="noreferrer">Сайт академии <ArrowUpRight size={16} /></a><div className="sidebar-footer"><span>КАМПУС © {today.slice(0, 4)}</span><span>Ярославль</span></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="top-breadcrumb"><span className="mobile-logo"><Mark small /></span><span>Академия МУБиНТ</span><ChevronRight size={13} /><strong>{choosing ? groupStep === "group" ? "Выбор группы" : "Выбор занятий" : sectionTitle}</strong></div><div className="top-actions"><SeasonBadge />{group && <button className="icon-button" onClick={() => navigate("settings")} aria-label="Настройки приложения"><Settings2 size={19} /></button>}<span className="moscow-time"><Clock3 size={14} />{now || "МСК"}<span>МСК</span></span><a className="icon-button source-top" href={sourceUrl(date)} target="_blank" rel="noreferrer" title="Открыть официальное расписание" aria-label="Открыть официальное расписание"><ExternalLink size={18} /></a><button className="profile-button" onClick={openGroups} aria-label="Выбрать группу"><GraduationCap size={20} /></button></div></header>

      <main>
        {choosing ? <div className="onboarding appear">
          <div className="page-eyebrow"><span /> НА ОДНОЙ ВОЛНЕ С УЧЁБОЙ</div>
          <div className="onboarding-heading"><div><h1>Весь учебный день.<br /><span>В одном месте.</span></h1><p>Выбери свою группу — мы соберём все пары,<br className="desktop-break" /> аудитории и преподавателей в одном расписании.</p></div><span className="semester-pill"><span /> {Number(today.slice(5, 7)) >= 8 ? "Осенний" : "Весенний"} семестр</span></div>
          <div className="onboarding-grid">
            <section className="group-panel" aria-labelledby="group-title"><div className="setup-progress"><span className={groupStep === "group" ? "current" : "complete"}>1 · Группа</span><i /><span className={groupStep === "sport" ? "current" : ""}>2 · Занятия</span></div>{groupStep === "group" ? <><div className="panel-heading"><div className="step-badge">01</div><div><h2 id="group-title">Найди свою группу</h2><p>Код группы можно посмотреть в личном кабинете</p></div></div>
              <div className="search-field large"><Search size={19} /><input id="group-search" value={groupQuery} onChange={e => { setGroupQuery(e.target.value); setLimit(24); }} placeholder="Например, 26-ИБ131" autoComplete="off" aria-label="Поиск группы" />{groupQuery && <button aria-label="Очистить поиск" onClick={() => setGroupQuery("")}><X size={16} /></button>}<span className="search-key">⌕</span></div>
              {recentGroups.length > 0 && <div className="recent-groups"><span>Недавние</span>{recentGroups.map(g => <button key={g} onClick={() => setSelectedGroup(g)}>{g}</button>)}</div>}
              <div className="list-heading"><span>{groupQuery ? "РЕЗУЛЬТАТЫ ПОИСКА" : "ГРУППЫ АКАДЕМИИ"}</span><span>{filteredGroups.length}</span></div>
              <div className="group-list" role="radiogroup" aria-label="Доступные группы">
                {filteredGroups.slice(0, limit).map(g => <button key={g} role="radio" aria-checked={selectedGroup === g} className={`group-option ${selectedGroup === g ? "selected" : ""}`} onClick={() => setSelectedGroup(g)}><span className="group-option-icon"><Users size={19} /></span><span><strong>{g}</strong><small>Академия МУБиНТ</small></span><span className="radio-dot">{selectedGroup === g && <Check size={13} strokeWidth={3} />}</span></button>)}
                {filteredGroups.length > limit && <button className="load-more" onClick={() => setLimit(n => n + 40)}>Показать ещё <ArrowDown size={14} /></button>}
                {!filteredGroups.length && <div className="group-empty"><Search size={26} /><strong>Группа пока не найдена</strong><p>Проверь код. Если её нет в списке, можно открыть расписание по точному коду.</p><button className="text-button" onClick={() => setSelectedGroup(groupQuery.trim().toUpperCase())}>Использовать «{groupQuery.trim().toUpperCase().slice(0, 80)}» <ArrowRight size={14} /></button></div>}
              </div>
              <div className="group-panel-footer"><button className="primary-button" disabled={!selectedGroup || selectedGroup.length > 80} onClick={() => { setSportDraft(sportChoices[normalizeGroup(selectedGroup)] || null); setGroupStep("sport"); scrollTo(); }}><span>{selectedGroup ? `Далее · ${selectedGroup}` : "Выбери группу"}</span><ArrowRight size={18} /></button>{group && <button className="text-button back-schedule" onClick={() => setChoosing(false)}><ArrowLeft size={13} /> Вернуться к расписанию</button>}</div>
              </> : <div className="sport-step"><div className="panel-heading"><div className="step-badge">02</div><div><h2 id="group-title">На какие занятия ходишь?</h2><p>Группа {selectedGroup}. Настроим расписание под тебя.</p></div></div><div className="sport-step-options" role="radiogroup" aria-label="Выбор занятий">{([["pe", "Физкультура", "Общая физическая подготовка", Dumbbell], ["chess", "Шахматы", "Занятия по шахматам", Crown]] as const).map(([key, title, subtitle, Icon]) => <button key={key} role="radio" aria-checked={sportDraft === key} className={sportDraft === key ? "selected" : ""} onClick={() => setSportDraft(key)}><span className="sport-step-icon"><Icon size={25} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><span className="radio-dot">{sportDraft === key && <Check size={13} />}</span></button>)}<button role="radio" aria-checked={sportDraft === "all"} className={`sport-both ${sportDraft === "all" ? "selected" : ""}`} onClick={() => setSportDraft("all")}><span>Показывать оба варианта</span>{sportDraft === "all" && <Check size={15} />}</button></div><p className="sport-step-note">Общие лекции по физической культуре останутся при любом выборе. Изменить вариант можно в разделе «Группа».</p><div className="group-panel-footer"><button className="primary-button" disabled={!sportDraft} onClick={() => { if (sportDraft) { changeSport(sportDraft, selectedGroup); chooseGroup(selectedGroup, sportDraft); scrollTo(); } }}><span>Открыть расписание</span><ArrowRight size={18} /></button><button className="text-button back-schedule" onClick={() => setGroupStep("group")}><ArrowLeft size={14} /> Назад к выбору группы</button></div></div>}
            </section>
            <div className="welcome-side"><section className="welcome-card"><div className="welcome-tag"><Sparkles size={14} /> УЧЁБА В СВОЁМ РИТМЕ</div><h2>Меньше хаоса.<br />Больше планов.</h2><p>От первой лекции<br />до последней практики.</p><CalendarArt /><div className="welcome-foot"><span>Твоя группа. Твои пары.</span><span className="round-arrow"><ArrowUpRight size={22} /></span></div></section><div className="feature-row"><div><span className="feature-icon blue"><BookOpen size={19} /></span><strong>Всё о паре</strong><p>Тип, время и аудитория</p></div><div><span className="feature-icon green"><RefreshCw size={18} /></span><strong>Из источника</strong><p>Данные с сайта вуза</p></div></div></div>
          </div><p className="bottom-note"><CircleHelp size={14} /> Список собран из опубликованного расписания. Не нашли группу? Введите её точный код.</p>
        </div> : <div className="dashboard appear">
          <div className="dashboard-heading"><div><div className="page-eyebrow">УЧЁБА ПОД КОНТРОЛЕМ</div><h1>{sectionTitle}<span className="heading-dot">.</span></h1><p>{section === "homework" ? "Личные задания, сроки и готовые дела." : section === "changes" ? "Что поменялось в расписании твоей группы." : section === "subjects" ? "Вся учёба — по предметам." : section === "settings" ? "Оформление, сообщения и быстрый запуск." : "Всё, что нужно знать о твоём учебном дне."}</p></div><button className="group-switch" onClick={openGroups}><span className="feature-icon green"><Users size={18} /></span><span><small>Группа</small><strong>{group}</strong></span><ChevronDown size={17} /></button></div>

          {scheduleVisible && <div className="dashboard-shortcuts"><button className="text-button" onClick={() => navigate("subjects")}><BookOpen size={16} />Мои предметы</button><button className="text-button" onClick={() => setShareOpen(true)}><Share2 size={16} />Поделиться расписанием</button></div>}
          <section className="day-banner" hidden={!scheduleVisible}><div className="banner-copy"><div className="banner-eyebrow"><span /> {date === today ? "ТВОЙ ДЕНЬ СЕГОДНЯ" : cap(fmt(date, { weekday: "long", day: "numeric", month: "long" })).toUpperCase()}</div><h2>{!selectedDay ? "Настраиваемся на учёбу" : selectedDay.status === "unavailable" ? "Проверим расписание?" : !activeLessons.length ? "Время для своих планов" : ongoing ? "Сейчас идёт пара" : nextLesson ? "Твой день — по плану" : "Ещё один день в копилку"}<span>✳</span></h2><p>{!selectedDay ? "Загружаем расписание твоей группы с сайта академии." : selectedDay.status === "unavailable" ? "Источник временно недоступен. Попробуй обновить данные." : !activeLessons.length ? sportChoice === "all" ? "На эту дату в источнике нет занятий для твоей группы." : "На эту дату нет занятий с учётом твоего выбора." : nextLesson ? `${ongoing ? "Сейчас" : "Ближайшая пара"}: ${nextLesson.subject}` : `${plural(activeLessons.length)} в расписании на этот день.`}</p>{nextLesson && <div className="banner-details"><span><Clock3 size={13} />{nextLesson.start}–{nextLesson.end}</span><span>{nextLesson.online ? <Monitor size={13} /> : <MapPin size={13} />}{nextLesson.room || "Не указано"}</span><span className="banner-type">{nextLesson.type}</span></div>}<LiveLesson lessons={activeLessons} date={date} today={today} now={now} /></div><CalendarArt compact /></section>

          {notice && <div className="notice">{notice}<button onClick={() => setNotice("")} aria-label="Закрыть уведомление"><X size={15} /></button></div>}
          {section === "homework" && <HomeworkBoard key={group} store={homework} today={today} onOpenDay={openDay} />}
          {section === "subjects" && group && <SubjectsPage key={group} group={group} store={homework} days={days} today={today} sport={sportChoice} onOpenLesson={setOpenedLesson} onHomework={() => navigate("homework")} />}
          {section === "settings" && <><div className="settings-shortcuts"><button className="secondary-button" onClick={() => navigate("subjects")}><BookOpen size={18} />Предметы</button><button className="secondary-button" onClick={() => { openGroups(); scrollTo(); }}><Users size={18} />Моя группа</button></div><SettingsPage /></>}
          <div className="changes-page" hidden={section !== "changes"}>
            {monitor ? <MonitorPanel monitor={filteredMonitor} full /> : <div className="homework-access" role="status">{monitorError ? <>История временно недоступна.<button className="text-button" onClick={() => setRefreshToken(n => n + 1)}><RefreshCw size={14} /> Повторить</button></> : "Загружаем историю проверок…"}</div>}
          </div>
          <div className="schedule-layout" hidden={!scheduleVisible}><section className="schedule-main" aria-label="Расписание занятий">
            <div className="schedule-controls"><div className="week-navigation"><h2>{weekTitle}<small>{weekStart.slice(0, 4)}</small></h2><button className="today-button" onClick={() => setDate(today)}>Сегодня</button></div><button className="open-mini-calendar icon-button" onClick={() => { setCalendarOpen(!calendarOpen); if (!calendarOpen) scrollTo("schedule-calendar"); }} aria-label="Выбрать дату в календаре" aria-expanded={calendarOpen}><CalendarDays size={19} /></button><div className="view-toggle" aria-label="Вид расписания"><button className={view === "day" ? "selected" : ""} onClick={() => setView("day")} aria-pressed={view === "day"}><List size={14} />День</button><button className={view === "week" ? "selected" : ""} onClick={() => setView("week")} aria-pressed={view === "week"}><LayoutGrid size={14} />Неделя</button></div></div>
            <section className="week-rail" aria-label="Выбор дня и недели"><button className="week-rail-arrow" onClick={() => setDate(addDays(date, -7))} aria-label="Предыдущая неделя"><ChevronLeft size={17} /></button><div className="week-rail-days">{week.map((day, index) => { const lessons = days[day]?.lessons.filter(l => !l.cancelled && matchesSport(l, sportChoice)); return <button key={day} className={`week-rail-day ${day === date ? "selected" : ""} ${day === today ? "current" : ""}`} onClick={() => { setDate(day); setView("day"); }} aria-label={fmt(day, { weekday: "long", day: "numeric", month: "long" })} aria-pressed={day === date} aria-current={day === today ? "date" : undefined}><span>{WEEKDAYS[index]}</span><strong>{Number(day.slice(8))}</strong><i className={lessons?.length ? "has-lessons" : ""} /></button>; })}</div><button className="week-rail-arrow" onClick={() => setDate(addDays(date, 7))} aria-label="Следующая неделя"><ChevronRight size={17} /></button></section>
            <MonitorPanel monitor={filteredMonitor} />
            <div className="filter-line"><div className="type-filters" aria-label="Тип занятия">{([['all', 'Все занятия'], ['lecture', 'Лекции'], ['practice', 'Практика'], ['other', 'Другие']] as const).map(([key, name]) => <button key={key} className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{key !== "all" && <i className={key} />}{name}</button>)}</div><button className={`icon-button refresh-button ${loadingDates.length ? "loading" : ""}`} title="Обновить с сайта вуза" aria-label="Обновить расписание" disabled={loadingDates.length > 0} onClick={() => setRefreshToken(n => n + 1)}><RefreshCw size={16} /></button></div>
            <div className="search-field subject-search"><Search size={16} /><input value={subjectQuery} onChange={e => setSubjectQuery(e.target.value)} placeholder="Предмет, преподаватель или аудитория" aria-label="Поиск по расписанию" />{subjectQuery && <button onClick={() => setSubjectQuery("")} aria-label="Очистить поиск по расписанию"><X size={14} /></button>}</div>

            <div id="day-lessons" className="days-container" aria-live="polite" aria-busy={loadingDates.length > 0}>{displayDays.map(d => {
              const day = days[d];
              const list = day ? withChanges(day.lessons, d, changes).filter(card => visibleLesson(card.lesson)) : [];
              const isLoading = !day;
              return <section className="day-section" key={d}><div className="day-section-title"><h3>{cap(fmt(d, { weekday: "long" }))}<span>{fmt(d, { day: "numeric", month: "long" })}</span>{d === today && <em>сегодня</em>}</h3><span>{day && day.status !== "unavailable" ? plural(day.lessons.filter(l => !l.cancelled && matchesSport(l, sportChoice)).length) : ""}</span></div>
                {day && ["snapshot", "cached"].includes(day.status) && <div className="data-warning"><WifiOff size={16} /><div><strong>Сохранённая копия · {readableUpdated(day.fetchedAt)}</strong><p>{day.message}</p></div><a href={day.source} target="_blank" rel="noreferrer" aria-label="Сверить с официальным источником"><ArrowUpRight size={17} /></a></div>}
                {isLoading ? <div className="skeleton-list" aria-label="Загрузка расписания">{[1, 2, 3].map(n => <div className="lesson-skeleton" key={n}><div /><span /><span /></div>)}<p>Получаем расписание с сайта МУБиНТ…</p></div> : !day || day.status === "unavailable" ? <div className="empty-state"><span><WifiOff size={26} /></span><h3>Не удалось загрузить расписание</h3><p>Это не означает, что пар нет.<br />Проверь официальный источник или попробуй ещё раз.</p><div><button className="secondary-button" onClick={() => setRefreshToken(n => n + 1)}><RefreshCw size={14} />Повторить</button><a className="text-button" href={sourceUrl(d)} target="_blank" rel="noreferrer">Открыть источник <ArrowUpRight size={14} /></a></div></div> : !list.length ? <div className={`empty-state ${view === "week" ? "compact-empty" : ""}`}><span>{day.lessons.length ? <Search size={27} /> : <Coffee size={28} />}</span><h3>{day.lessons.length ? "Ничего не найдено" : "Занятий в расписании нет"}</h3><p>{day.lessons.length ? "Проверь выбранный вариант физкультуры, тип занятия или поиск." : "На эту дату для выбранной группы пары не опубликованы."}</p>{(filter !== "all" || subjectQuery) && <button className="text-button" onClick={() => { setFilter("all"); setSubjectQuery(""); }}>Сбросить фильтры <X size={14} /></button>}</div> : <div className="lesson-list">{list.map(({ lesson, change, removed }, i) => <div key={lesson.id}><LessonCard lesson={lesson} today={today} now={now} change={change} removed={removed} onOpen={() => setOpenedLesson(lesson)} />{!lesson.cancelled && i < list.length - 1 && !list[i + 1].lesson.cancelled && minutes(list[i + 1].lesson.start) > minutes(lesson.end) && <div className="break-line"><span /><Coffee size={12} /><span className="break-label">Перерыв {minutes(list[i + 1].lesson.start) - minutes(lesson.end)} мин</span><span /></div>}</div>)}</div>}
              </section>;
            })}</div>
            <div className="schedule-footer"><span className={statusFresh ? "fresh" : ""}><i />{loadingDates.length ? "Проверяем обновления…" : statusFresh ? `Проверено ${readableUpdated(selectedDay.fetchedAt)}` : selectedDay?.fetchedAt ? `Копия от ${readableUpdated(selectedDay.fetchedAt)}` : "Данные ещё не получены"}</span><span>Время московское</span></div>
          </section>

          <aside className={`right-column ${calendarOpen ? "calendar-visible" : ""}`}>
            <section id="schedule-calendar" className="month-calendar compact-calendar" aria-label="Календарь занятий">
              <div className="month-calendar-heading"><div><span className="month-eyebrow">КАЛЕНДАРЬ ЗАНЯТИЙ</span><h2>{cap(fmt(calendarFirst, { month: "long" }))}<span>{calendarFirst.slice(0, 4)}</span></h2></div><div className="month-calendar-actions"><button className="icon-button" aria-label="Предыдущий месяц" onClick={() => { shiftMonth(-1); setCalendarOpen(true); }}><ChevronLeft size={19} /></button><button className="icon-button" aria-label="Следующий месяц" onClick={() => { shiftMonth(1); setCalendarOpen(true); }}><ChevronRight size={19} /></button><button className="calendar-mobile-close icon-button" onClick={() => setCalendarOpen(false)} aria-label="Закрыть календарь"><X size={16} /></button></div></div>
              <div id="month-calendar-grid"><div className="month-grid">{WEEKDAYS.map((d, i) => <span key={d} className={`month-weekday ${i > 4 ? "weekend" : ""}`}>{d.toLowerCase()}</span>)}{calDays.map((d, i) => {
                const inMonth = d.slice(0, 7) === calendarMonth;
                if (!inMonth) return <span className="month-spacer" key={d} />;
                const count = days[d]?.lessons.filter(l => !l.cancelled && matchesSport(l, sportChoice)).length;
                return <button key={d} onClick={() => { setDate(d); if (window.matchMedia("(max-width: 900px)").matches) openDay(d); }} className={`month-day ${i % 7 > 4 ? "weekend" : ""} ${d === date ? "selected" : ""} ${d === today ? "current" : ""} ${d >= week[0] && d <= week[6] ? "in-week" : ""}`} aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}${count ? `, ${plural(count)}` : ""}`} aria-pressed={d === date} aria-current={d === today ? "date" : undefined}><strong>{Number(d.slice(8))}</strong>{typeof count === "number" && count > 0 && <span className="month-class-dots" aria-hidden="true">{Array.from({ length: Math.min(count, 4) }, (_, n) => <i key={n} />)}</span>}</button>;
              })}</div><div className="month-calendar-legend"><span><i className="selected-key" /> Выбрано</span><span><i className="today-key" /> Сегодня</span><span><i className="weekend-key" /> Сб и вс</span><small>Нажми на дату, чтобы увидеть пары</small></div></div>
            </section>

            <section className="week-summary"><div className="section-title"><h3>Эта неделя</h3><span>{allWeekLoaded ? "7 / 7" : `${week.filter(d => days[d] && days[d].status !== "unavailable").length} / 7`}</span></div><div className="week-count"><strong>{weekLessons.length || (allWeekLoaded ? "0" : "—")}</strong><span>{allWeekLoaded ? "занятий\nв расписании" : "занятий\nзагружено"}</span><span className="summary-icon"><BookOpen size={22} /></span></div><div className="summary-bar">{(["lecture", "practice", "other", "exam"] as LessonKind[]).map(kind => <i key={kind} className={kind} style={{ flex: weekLessons.filter(l => l.kind === kind).length || 0.001 }} />)}</div><div className="summary-types">{(["lecture", "practice", "other", "exam"] as LessonKind[]).filter(k => k !== "exam" || weekLessons.some(l => l.kind === k)).map(kind => <div key={kind}><span><i className={kind} />{labels[kind]}</span><strong>{weekLessons.filter(l => l.kind === kind).length}</strong></div>)}</div>{!allWeekLoaded && <p className="partial-note">Итоги появятся после загрузки всех дней.</p>}{allWeekLoaded && week.some(d => days[d]?.status !== "live") && <p className="partial-note">Часть дней показана из сохранённой копии.</p>}</section>
            <section className="source-card"><div className="source-card-icon"><GraduationCap size={21} /><span /></div><h3>Прямо из академии</h3><p>Расписание с lk.mubint.ru.<br />Обновляем при открытии.<br />Историю изменений сохраняем<br />каждый день в 20:00 МСК.</p><a href={sourceUrl(date)} target="_blank" rel="noreferrer">Официальный источник <ArrowUpRight size={15} /></a></section>
          </aside></div>
          <footer className="app-footer"><span>МУБиНТ · Международная академия бизнеса и новых технологий</span><span>Хорошей учёбы <Sparkles size={12} /></span></footer>
        </div>}
      </main>
    </div>
    {shareOpen && group && <ShareSchedule group={group} date={date} week={week} days={days} sport={sportChoice} homework={homework.records} view={view} onClose={() => setShareOpen(false)} />}
    {openedLesson && group && <LessonDialog lesson={openedLesson} group={group} store={homework} onClose={() => setOpenedLesson(null)} />}
    {group && <nav className="mobile-bottom-nav" aria-label="Мобильная навигация">
      <button className={!choosing && section === "today" ? "active" : ""} aria-current={!choosing && section === "today" ? "page" : undefined} onClick={() => navigate("today")}><Clock3 size={20} /><span>Сегодня</span></button>
      <button className={!choosing && section === "calendar" ? "active" : ""} aria-current={!choosing && section === "calendar" ? "page" : undefined} onClick={() => navigate("calendar")}><CalendarDays size={20} /><span>Календарь</span></button>
      <button className={!choosing && section === "homework" ? "active" : ""} aria-current={!choosing && section === "homework" ? "page" : undefined} onClick={() => navigate("homework")}><span className="mobile-nav-icon"><ClipboardList size={20} />{tasksCount > 0 && <i>{tasksCount > 99 ? "99+" : tasksCount}</i>}</span><span>Задания</span></button>
      <button className={!choosing && section === "changes" ? "active" : ""} aria-current={!choosing && section === "changes" ? "page" : undefined} onClick={() => navigate("changes")}><BellRing size={20} /><span>Изменения</span></button>
      <button className={!choosing && ["settings", "subjects"].includes(section) ? "active" : ""} aria-current={!choosing && ["settings", "subjects"].includes(section) ? "page" : undefined} onClick={() => navigate("settings")}><MoreHorizontal size={20} /><span>Ещё</span></button>
    </nav>}
  </div>;
}

function LessonCard({ lesson: l, today, now, change, removed, onOpen }: { lesson: Lesson; today: string; now: string; change?: ScheduleChange; removed: boolean; onOpen: () => void }) {
  const active = l.date === today && l.start <= now && now < l.end && !l.cancelled;
  const past = l.date < today || (l.date === today && l.end <= now);
  const fields = change ? changedFields(change) : [];
  return <article className={`lesson-card ${l.kind} ${active ? "is-active" : ""} ${l.cancelled ? "is-cancelled" : ""} ${past ? "is-past" : ""} ${change ? "has-update" : ""}`}>
    <button type="button" className="lesson-open" onClick={onOpen} aria-label={`${l.subject}, ${l.start} — открыть пару и домашнее задание`}><div className="lesson-main">
      <div className="lesson-time"><strong>{l.start}</strong><span>{l.end}</span><small>{l.pair ? `${l.pair} пара` : "Занятие"}</small></div>
      <div className="lesson-content"><div className="lesson-tags"><span className={`type-tag ${l.kind}`}>{l.kind === "lecture" ? <BookOpen size={12} /> : l.kind === "practice" ? <Sparkles size={12} /> : <GraduationCap size={12} />}{l.type}</span>{l.online && <span className="online-tag"><Monitor size={11} />Онлайн</span>}{l.cancelled && <span className="cancel-tag">{removed ? "Убрано из расписания" : "Отменено"}</span>}{(l.added || change?.kind === "added") && <span className="added-tag">Добавлено</span>}{change?.kind === "changed" && <span className="updated-tag">Изменено</span>}{active && <span className="now-tag"><i />Сейчас</span>}</div><h4>{l.subject}</h4><div className="lesson-meta"><span><Users size={13} />{l.teacher || "Преподаватель не указан"}</span><span className="lesson-room">{l.online ? <Monitor size={13} /> : <MapPin size={13} />}{l.online ? l.room : l.room ? `Ауд. ${l.room}` : "Аудитория не указана"}</span></div></div>
      <span className="lesson-icon" aria-hidden="true">{l.kind === "lecture" ? <BookOpen size={20} strokeWidth={1.5} /> : l.kind === "practice" ? <Sparkles size={20} strokeWidth={1.5} /> : <GraduationCap size={20} strokeWidth={1.5} />}</span>
    </div>
    {change && <div className={`lesson-update ${change.kind}`}><div className="update-heading"><RefreshCw size={13} /><strong>{change.kind === "added" ? "Новая пара в расписании" : removed ? "Пара больше не опубликована" : "Что изменилось"}</strong>{change.detectedAt && <time dateTime={change.detectedAt}>{readableUpdated(change.detectedAt)}</time>}</div>{fields.map(field => <div className="update-field" key={field.label}><span>{field.label}</span><del>{field.before}</del><ArrowRight size={12} /><strong>{field.after}</strong></div>)}{removed && <p>Последние опубликованные данные показаны выше. Сверься с официальным расписанием.</p>}</div>}
    </button>
  </article>;
}

function MonitorPanel({ monitor, full = false }: { monitor: MonitorStatus | null; full?: boolean }) {
  if (!monitor) return null;
  const latest = monitor.latest;
  const scheduled = monitor.schedule?.enabled;
  const history = monitor.recentChanges || latest?.changes || [];
  const count = full ? 100 : 10;
  const summary = !latest ? "Первой проверки пока нет" : latest.status === "running" ? "Проверка выполняется" : latest.status === "partial" ? `Проверено ${latest.checkedDays} из 14 дней` : latest.baselineDays === 14 ? "Исходное расписание сохранено" : latest.totalChanges ? `Найдено изменений: ${latest.totalChanges}` : "Изменений для твоей группы нет";
  return <details open={full || undefined} className={`monitor-panel ${full ? "full-history" : ""} ${latest?.totalChanges ? "has-changes" : ""}`}><summary><span className="monitor-symbol"><RefreshCw size={16} /></span><span><strong>{summary}</strong><small>{scheduled ? "Каждый день · 20:00 МСК" : "История проверок"}{latest && ` · ${readableUpdated(latest.checkedAt)}`}</small></span><ChevronDown size={16} /></summary><div className="monitor-details"><p>{scheduled ? "Проверка работает, даже когда приложение закрыто. " : ""}Сравниваем расписание всех групп на ближайшие 14 дней. Здесь показаны изменения выбранной группы.</p>{latest?.baselineDays === 14 && <p>Это первая проверка: сохранена версия для сравнения при следующих запусках.</p>}{!!latest?.failedDates.length && <p className="monitor-failure">Источник не ответил для дат: {latest.failedDates.map(d => fmt(d, { day: "numeric", month: "short" })).join(", ")}. Сохранённые данные этих дней не менялись.</p>}{history.slice(0, count).map((change, i) => <div className={`change-item ${change.kind}`} key={i}><span className="change-label">{change.kind === "added" ? "Добавлено" : change.kind === "removed" ? "Убрано из расписания" : "Изменено"}</span><span className="change-date">{fmt(change.date, { day: "numeric", month: "short" })}</span><strong>{(change.after || change.before)?.subject}</strong><p>{changeDescription(change)}</p>{change.detectedAt && <small>Обнаружено {readableUpdated(change.detectedAt)}</small>}</div>)}{!history.length && <div className="history-empty"><CheckCheck size={24} /><strong>Зафиксированных изменений пока нет</strong><p>Когда появится перенос, замена или отмена, покажем их здесь и в карточке пары.</p></div>}{history.length > count && <p>Показаны последние {count} изменений.</p>}</div></details>;
}
function changeDescription(c: ScheduleChange) {
  const describe = (l?: Lesson) => l ? `${l.start}–${l.end} · ${l.type} · ${l.room || "аудитория не указана"} · ${l.teacher}${l.cancelled ? " · отменено" : ""}` : "";
  return c.kind === "changed" ? `Было: ${describe(c.before)}. Стало: ${describe(c.after)}.` : describe(c.after || c.before);
}
