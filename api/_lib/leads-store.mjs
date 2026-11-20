// Cópia dos leads do site num armazenamento privado do Vercel Blob (um arquivo JSON por lead).
// Só o servidor lê e grava (BLOB_READ_WRITE_TOKEN); os arquivos não são públicos.
import crypto from "node:crypto";

const API = "https://vercel.com/api/blob";
const token = () => process.env.BLOB_READ_WRITE_TOKEN || "";
export const storeAtivo = () => Boolean(token());
const cab = () => ({ authorization: `Bearer ${token()}`, "x-api-version": "13", "x-vercel-blob-store-id": token().split("_")[3] || "" });

export function novoCaminho(data = new Date()) {
  const iso = data.toISOString();
  return `leads/${iso.slice(0, 7)}/${iso.replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}.json`;
}

export async function gravar(caminho, lead) {
  const r = await fetch(`${API}/?pathname=${encodeURIComponent(caminho)}`, {
    method: "PUT",
    headers: { ...cab(), "x-vercel-blob-access": "private", "x-add-random-suffix": "0", "x-allow-overwrite": "1", "x-content-type": "application/json" },
    body: JSON.stringify(lead),
  });
  if (!r.ok) throw new Error(`blob put ${r.status}`);
}

async function listar(prefixo) {
  const out = [];
  let cursor;
  do {
    const q = new URLSearchParams({ prefix: prefixo, limit: "1000", ...(cursor ? { cursor } : {}) });
    const r = await fetch(`${API}?${q}`, { headers: cab() });
    if (!r.ok) throw new Error(`blob list ${r.status}`);
    const d = await r.json();
    out.push(...(d.blobs || []));
    cursor = d.hasMore ? d.cursor : null;
  } while (cursor && out.length < 20000);
  return out;
}

// Lê os leads gravados desde `desde` (ISO). Arquivos já lidos ficam em memória (não mudam depois do aviso ao Salee).
const memoria = new Map();
export async function lerLeads(desde) {
  const meses = [];
  for (let d = new Date(desde.slice(0, 7) + "-01T00:00:00Z"); d <= new Date(); d.setUTCMonth(d.getUTCMonth() + 1)) meses.push(d.toISOString().slice(0, 7));
  const blobs = (await Promise.all(meses.map((m) => listar(`leads/${m}/`)))).flat();
  const novos = blobs.filter((b) => { const m = memoria.get(b.pathname); return !m || m.etag !== b.etag; });
  for (let i = 0; i < novos.length; i += 20) {
    await Promise.all(novos.slice(i, i + 20).map(async (b) => {
      try {
        const r = await fetch(b.url, { headers: { authorization: `Bearer ${token()}` } });
        if (r.ok) memoria.set(b.pathname, { etag: b.etag, lead: await r.json() });
      } catch {}
    }));
  }
  return blobs.map((b) => memoria.get(b.pathname)).filter(Boolean).map((m) => m.lead).filter((l) => String(l.data_envio || "") >= desde);
}

// ---------- reservas Zelle (pagamento manual, confirmado no painel) ----------
const zelleMem = new Map();
export const caminhoZelle = (id) => `zelle/${id}.json`;
export async function lerZelle(id) {
  const [b] = await listar(caminhoZelle(id));
  if (!b) return null;
  const r = await fetch(b.url, { headers: { authorization: `Bearer ${token()}` }, cache: "no-store" });
  return r.ok ? r.json() : null;
}
export async function listarZelle() {
  const blobs = await listar("zelle/");
  const novos = blobs.filter((b) => { const m = zelleMem.get(b.pathname); return !m || m.etag !== b.etag; });
  await Promise.all(novos.map(async (b) => {
    try {
      const r = await fetch(b.url, { headers: { authorization: `Bearer ${token()}` }, cache: "no-store" });
      if (r.ok) zelleMem.set(b.pathname, { etag: b.etag, z: await r.json() });
    } catch {}
  }));
  return blobs.map((b) => zelleMem.get(b.pathname)).filter(Boolean).map((m) => m.z);
}
