import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

// ---- AYARLAR (buradan değiştir) ----
export const CFG = {
  open: "10:00",
  close: "22:00",
  step: 30,          // dakika; her randevu bu bloklarla hesaplanır
  closedDays: [0],   // 0 = Pazar
  maxDays: 14,       // kaç gün ilerisine randevu alınabilir
  tz: "Europe/Istanbul",
};
// slot = kaç blok sürer (1 blok = 30 dk). Süreleri kendi işine göre düzenle.
export const SERVICES = {
  sac:      { ad: "Saç Kesimi",   fiyat: 400,  slot: 1 },
  sakal:    { ad: "Sakal Kesimi", fiyat: 250,  slot: 1 },
  sacsakal: { ad: "Saç ve Sakal", fiyat: 600,  slot: 2 },
  fon:      { ad: "Fön",          fiyat: 100,  slot: 1 },
  boya:     { ad: "Boya",         fiyat: 500,  slot: 3 },
  keratin:  { ad: "Keratin",      fiyat: 500,  slot: 3 },
  cilt:     { ad: "Cilt Bakımı",  fiyat: 400,  slot: 2 },
  perma:    { ad: "Perma",        fiyat: 5000, slot: 4 },
};
export const BARBERS = { yusuf: "Yusuf", emirhan: "Emirhan" };
export const TTL = 60 * 24 * 3600; // kayıtlar 60 gün sonra otomatik silinir
// ------------------------------------

const M = (t) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
const F = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

export const slotKeys = (date, b, t, n) =>
  Array.from({ length: n }, (_, i) => `slot:${date}:${b}:${F(M(t) + i * CFG.step)}`);

export function nowIst() {
  const [d, t] = new Date().toLocaleString("sv-SE", { timeZone: CFG.tz }).split(" ");
  return { date: d, min: M(t.slice(0, 5)) };
}

export function dayOk(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return false;
  const dt = new Date(d + "T12:00:00Z");
  if (isNaN(dt)) return false;
  const n = nowIst();
  if (d < n.date) return false;
  const lim = new Date(n.date + "T12:00:00Z");
  lim.setUTCDate(lim.getUTCDate() + CFG.maxDays);
  if (dt > lim) return false;
  return !CFG.closedDays.includes(dt.getUTCDay());
}

export async function freeFor(date, s, b) {
  const n = nowIst(), all = [], starts = [];
  for (let m = M(CFG.open); m < M(CFG.close); m += CFG.step) all.push(m);
  const vals = await redis.mget(...all.map((m) => `slot:${date}:${b}:${F(m)}`));
  const taken = new Set(all.filter((_, i) => vals[i]).map(F));
  for (const m of all) {
    if (m + s.slot * CFG.step > M(CFG.close)) break;
    if (date === n.date && m < n.min + 30) continue; // en az 30 dk sonrası
    const need = Array.from({ length: s.slot }, (_, i) => F(m + i * CFG.step));
    if (need.every((t) => !taken.has(t))) starts.push(F(m));
  }
  return starts;
}

// who: "any" (fark etmez) ya da berber kodu
export async function freeStarts(date, s, who) {
  const ids = who === "any" ? Object.keys(BARBERS) : [who];
  const lists = await Promise.all(ids.map((b) => freeFor(date, s, b)));
  return [...new Set(lists.flat())].sort();
}

export async function notify(text) {
  const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_CHAT_ID;
  if (!t || !c) return;
  try {
    await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: c, text }),
    });
  } catch {}
}
