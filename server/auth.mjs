import { createHmac, timingSafeEqual } from 'node:crypto';
export function validateInitData(raw, token, now = Date.now()) {
  if (!token || typeof raw !== 'string' || !raw || raw.length > 16384) return null;
  try {
    const params = new URLSearchParams(raw);
    if (new Set(params.keys()).size !== [...params.keys()].length) return null;
    const hash = params.get('hash');
    if (!/^[0-9a-f]{64}$/i.test(hash || '')) return null;
    params.delete('hash');
    const data = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    const expected = createHmac('sha256', secret).update(data).digest();
    if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;
    const age = now / 1000 - Number(params.get('auth_date'));
    if (!params.has('auth_date') || !Number.isFinite(age) || age < -30 || age > 86400) return null;
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot) return null;
    return { id: String(user.id), name: String(user.first_name || '').slice(0, 100), allowsWrite: user.allows_write_to_pm === true };
  } catch { return null; }
}
