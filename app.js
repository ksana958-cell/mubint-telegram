import { readConfig } from './server/config.mjs';
import { Store } from './server/store.mjs';
import { ScheduleService } from './server/schedule.mjs';
import { Telegram } from './server/telegram.mjs';
import { Jobs } from './server/jobs.mjs';
import { createApp } from './server/http.mjs';
const config = readConfig();
const store = new Store(config.databasePath), schedule = new ScheduleService(store);
const telegram = config.token ? new Telegram(config, store) : null;
const jobs = new Jobs(store, schedule, null, config);
const server = createApp({ config, store, schedule });
server.listen(config.port, '0.0.0.0', () => console.log(`Кампус запущен. Порт ${config.port}. База данных подключена.`));
if (!config.appUrl) console.log('Подключи домен в BotHost, укажи APP_URL и перезапусти приложение.');
if (!config.token) console.log('Укажи Bot Token в BotHost для входа и напоминаний в Telegram.');
let setupRetry;
async function startTelegram() {
  if (!telegram || telegram.stopped) return;
  try {
    await telegram.setup(); jobs.telegram = telegram;
    console.log(`Бот @${config.username} подключён. Фоновые задачи: 07:30 Europe/Moscow.`);
    void telegram.run();
  } catch (error) {
    // Only deliberate configuration messages are safe to show. Fetch errors can contain secrets.
    console.error(error.message?.startsWith('Токен принадлежит') || error.message?.startsWith('У бота уже') ? error.message : 'Telegram пока недоступен. Проверь токен и соединение. Повтор через 30 секунд.');
    setupRetry = setTimeout(startTelegram, 30000);
  }
}
if (config.background) { jobs.start(); void startTelegram(); }
function stop() { jobs.stop(); telegram?.stop(); clearTimeout(setupRetry); server.close(); setTimeout(() => process.exit(0), 1000).unref(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
