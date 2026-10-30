import { randomUUID } from "node:crypto";
import { redis, SERVICES, BARBERS, TTL, dayOk, freeFor, slotKeys, notify } from "../lib/core.js";

// Tüm blokları tek hamlede (atomik) kilitler: ya hepsi alınır ya hiçbiri.
const LUA = `for _,k in ipairs(KEYS) do if redis.call('EXISTS',k)==1 then return 0 end end
for _,k in ipairs(KEYS) do redis.call('SET',k,ARGV[1],'EX',ARGV[2]) end return 1`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
  const hits = await redis.incr(`rl:${ip}`);
  if (hits === 1) await redis.expire(`rl:${ip}`, 3600);
  if (hits > 8) return res.status(429).json({ error: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin." });

  const { date, time, service, name, phone, barber = "any" } = req.body || {};
  const s = SERVICES[service];
  const n = String(name || "").trim().slice(0, 60);
  const p = String(phone || "").replace(/\D/g, "");
  if (!s || !dayOk(date) || (barber !== "any" && !BARBERS[barber]) || n.length < 2 || p.length < 10 || p.length > 13)
    return res.status(400).json({ error: "Bilgileri kontrol edin." });

  const busy = { error: "Bu saat az önce doldu, lütfen başka bir saat seçin." };
  // "Fark etmez" ise sırayla uygun berberi dene
  const id = "R" + randomUUID().replace(/-/g, "").slice(0, 7);
  let who = null;
  for (const c of barber === "any" ? Object.keys(BARBERS) : [barber]) {
    if (!(await freeFor(date, s, c)).includes(time)) continue;
    if (await redis.eval(LUA, slotKeys(date, c, time, s.slot), [id, String(TTL)])) { who = c; break; }
  }
  if (!who) return res.status(409).json(busy);

  const b = { id, date, time, service: s.ad, fiyat: s.fiyat, slot: s.slot, name: n, phone: p, barber: who, berber: BARBERS[who] };
  await redis.set(`booking:${id}`, b, { ex: TTL });
  await redis.sadd(`day:${date}`, id);
  await redis.expire(`day:${date}`, TTL);
  await notify(`📅 Yeni randevu\n${date} · ${time}\n${BARBERS[who]} · ${s.ad} (${s.fiyat} TL)\n${n}\n${p}`);
  res.json({ ok: true, id, service: s.ad, fiyat: s.fiyat, barber: BARBERS[who] });
}
