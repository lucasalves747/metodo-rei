import { config, json } from "../_lib/square.mjs";
export default function handler(req, res) {
  const c = config();
  json(res, 200, c.enabled ? c : { enabled: false });
}
