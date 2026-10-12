import { setTimeout as delay } from 'node:timers/promises';
export class Telegram {
  constructor(config, store, fetcher = fetch) { this.config = config; this.store = store; this.fetcher = fetcher; this.stopped = false; }
  async call(method, body) {
    const response = await this.fetcher(`https://api.telegram.org/bot${this.config.token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(method === 'getUpdates' ? 40000 : 15000)
    });
    const result = await response.json();
    if (!result.ok) { const e = new Error(`Telegram ${method}: ${result.error_code || response.status}`); e.code = result.error_code; e.retryAfter = result.parameters?.retry_after; throw e; }
    return result.result;
  }
  keyboard(section = '', date = '') {
    const query = new URLSearchParams();
    if (['homework', 'today', 'settings', 'subjects', 'changes'].includes(section)) query.set('section', section);
    if (/^20\d\d-\d\d-\d\d$/.test(date)) query.set('date', date);
    const text = section === 'homework' ? 'Мои задания' : section === 'settings' ? 'Настройки Кампуса' : 'Открыть расписание';
    return this.config.appUrl ? { inline_keyboard: [[{ text, web_app: { url: `${this.config.appUrl}/${query.size ? '?' + query : ''}` } }]] } : undefined;
  }
  async setup() {
    const bot = await this.call('getMe', {});
    if (bot.username.toLowerCase() !== this.config.username.toLowerCase()) throw new Error('Токен принадлежит другому боту. Проверь BOT_USERNAME и Bot Token.');
    const webhook = await this.call('getWebhookInfo', {});
    if (webhook.url) throw new Error('У бота уже настроен webhook. Для этого проекта нужен отдельный бот без webhook.');
    await this.call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть расписание' }, { command: 'homework', description: 'Мои задания' }, { command: 'settings', description: 'Тема и уведомления' }, { command: 'notifications', description: 'Включить уведомления' }, { command: 'stop', description: 'Отключить уведомления' }, { command: 'help', description: 'Как пользоваться' }] });
    if (this.config.appUrl) await this.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Расписание', web_app: { url: this.config.appUrl } } });
  }
  async handle(update) {
    const message = update.message;
    if (!message?.from || message.chat?.type !== 'private' || message.from.is_bot || message.from.id !== message.chat.id) return;
    const id = String(message.from.id), command = (message.text || '').split(/[ @]/)[0].toLowerCase();
    if (!['/start', '/schedule', '/homework', '/settings', '/notifications', '/stop', '/help'].includes(command)) return;
    const user = { id, name: String(message.from.first_name || '').slice(0, 100) };
    if (command === '/start' || command === '/notifications') this.store.startUser(user, message.chat.id);
    else this.store.touchUser(user);
    if (command === '/stop') this.store.db.prepare('UPDATE users SET notifications=0 WHERE id=?').run(id);
    const text = command === '/stop' ? 'Все уведомления отключены. Для включения отправь /notifications.'
      : command === '/notifications' ? 'Уведомления включены. Изменения расписания и утреннюю сводку настрой в приложении. В карточке ДЗ можно включить напоминание за 3 дня.'
      : command === '/settings' ? 'Выбери тему, время утренней сводки и уведомления об изменениях.'
      : command === '/help' ? 'Выбери группу, затем физкультуру или шахматы. Нажми на пару, чтобы записать ДЗ, прикрепить фото и составить список дел к следующему занятию. Напоминания о ДЗ приходят за 3 дня, начиная с 07:30 МСК. Расписание проверяем каждый день в 20:00 МСК и при просмотре. Тема, утренняя сводка и ярлык — в Настройках. /stop отключает все сообщения.'
      : command === '/homework' ? 'Твои задания и сроки — в приложении.'
      : 'Привет! Это «Кампус» — расписание МУБиНТ. Выбери группу и открой пары. Домашнее задание можно записать нажатием на нужное занятие.';
    await this.call('sendMessage', { chat_id: message.chat.id, text: text + (!this.config.appUrl ? '\n\nАдрес приложения ещё настраивается. Владелец должен подключить домен в BotHost и указать APP_URL.' : ''), reply_markup: command === '/stop' ? undefined : this.keyboard(command === '/homework' ? 'homework' : ['/settings', '/notifications'].includes(command) ? 'settings' : '') });
  }
  async run() {
    while (!this.stopped) {
      try {
        const updates = await this.call('getUpdates', { offset: this.store.state('telegram-offset', 0), timeout: 25, allowed_updates: ['message'] });
        for (const update of updates) {
          if (this.stopped) return;
          await this.handle(update);
          this.store.setState('telegram-offset', update.update_id + 1);
        }
      } catch (error) {
        // Never log fetch errors: a request URL can contain the bot token.
        console.error('Не удалось получить обновления Telegram.', error.code || 'network');
        if (!this.stopped) await delay(Math.min(60000, Math.max(5000, (error.retryAfter || 0) * 1000)));
      }
    }
  }
  stop() { this.stopped = true; }
}
