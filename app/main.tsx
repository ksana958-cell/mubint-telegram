import { createRoot } from 'react-dom/client';
import CampusApp from './campus-app';
import catalog from '@/seed/groups.json';
import { initializeTelegram } from './telegram';
import { startSeasonTheme } from './season';
import './globals.css';
import './seasons.css';
import './enhancements.css';
startSeasonTheme();
// Visible in browser DevTools: document.documentElement.dataset.campusBuild
document.documentElement.dataset.campusBuild = 'campus-2026-10-13-reviewed-admin';
const root = createRoot(document.getElementById('root')!);
root.render(<div className="telegram-loading" role="status">Открываем кампус…</div>);
void initializeTelegram().then(error => root.render(<>{error && <div className="telegram-status" role="status">{error}</div>}<CampusApp initialGroups={catalog.groups} /></>));
