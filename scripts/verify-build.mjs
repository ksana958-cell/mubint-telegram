import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const index = readFileSync('web/index.html', 'utf8');
const file = index.match(/src="\/assets\/([^"?#]+\.js)"/);
if (!file) throw new Error('web/index.html не подключает собранный JS из /assets/');
const bundle = resolve('web/assets', file[1]);
if (!existsSync(bundle)) throw new Error(`Не найден JS: ${bundle}`);
const js = readFileSync(bundle, 'utf8');
const required = ['campus-2026-10-13-reviewed-admin', 'Просмотрено', 'Админ-панель', '/api/admin/status'];
for (const phrase of required) if (!js.includes(phrase)) {
  throw new Error(`Сборка УСТАРЕЛА: ${file[1]} не содержит «${phrase}». Выполни npm ci && npm run build.`);
}
console.log(`OK: актуальный интерфейс: web/assets/${file[1]}; есть кнопка и админ-панель.`);
