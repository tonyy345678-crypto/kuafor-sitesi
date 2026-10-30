import { redis, slotKeys, notify } from "../lib/core.js";

export default async function handler(req, res) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || req.headers["x-admin-key"] !== pw) return res.status(401).json({ error: "Şifre yanlış." });
  const { date, id } = req.query;

  if (req.method === "DELETE") {
    const b = await redis.get(`booking:${id}`);
    if (!b) return res.status(404).json({ error: "Randevu bulunamadı." });
    await redis.del(...slotKeys(b.date, b.barber, b.time, b.slot), `booking:${id}`);
    await redis.srem(`day:${b.date}`, id);
    await notify(`❌ Randevu iptal edildi\n${b.date} · ${b.time} · ${b.berber}\n${b.name}`);
    return res.json({ ok: true });
  }

  const ids = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? await redis.smembers(`day:${date}`) : [];
  const rows = ids.length ? await redis.mget(...ids.map((i) => `booking:${i}`)) : [];
  res.json({ list: rows.filter(Boolean).sort((a, b) => a.time.localeCompare(b.time)) });
}
