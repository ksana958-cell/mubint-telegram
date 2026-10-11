export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export const SEASON_EVENT = 'campus:seasonchange';
export const seasonNames: Record<Season, string> = {
  winter: 'Зима', spring: 'Весна', summer: 'Лето', autumn: 'Осень',
};
const monthInMoscow = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Moscow', month: 'numeric',
});

// The theme follows today's Moscow date, never the day being viewed in the timetable.
export function getSeason(date = new Date()): Season {
  const month = Number(monthInMoscow.format(date));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

export function currentSeason(): Season {
  const value = document.documentElement.dataset.season;
  return value && Object.hasOwn(seasonNames, value) ? value as Season : getSeason();
}

export function themeColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    header: style.getPropertyValue('--navy').trim(),
    background: style.getPropertyValue('--bg').trim(),
    bottom: style.getPropertyValue('--surface').trim(),
  };
}

export function startSeasonTheme() {
  const refresh = () => {
    if (document.visibilityState === 'hidden') return;
    const season = getSeason();
    if (document.documentElement.dataset.season === season) return;
    document.documentElement.dataset.season = season;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors().header);
    window.dispatchEvent(new Event(SEASON_EVENT));
  };
  refresh();
  // Also refresh an app kept open across a season boundary or restored from sleep.
  const timer = window.setInterval(refresh, 60_000);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('pageshow', refresh);
  };
}
