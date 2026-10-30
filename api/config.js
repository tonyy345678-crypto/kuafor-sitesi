import { CFG, SERVICES, BARBERS } from "../lib/core.js";
export default function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300");
  res.json({ services: SERVICES, barbers: BARBERS, closedDays: CFG.closedDays, maxDays: CFG.maxDays });
}
