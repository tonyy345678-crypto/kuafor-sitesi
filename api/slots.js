import { SERVICES, BARBERS, dayOk, freeStarts } from "../lib/core.js";
export default async function handler(req, res) {
  const { date, service, barber = "any" } = req.query;
  const s = SERVICES[service];
  if (!s || !dayOk(date) || (barber !== "any" && !BARBERS[barber])) return res.status(400).json({ error: "Geçersiz tarih veya hizmet." });
  res.setHeader("Cache-Control", "no-store");
  res.json({ slots: await freeStarts(date, s, barber) });
}
