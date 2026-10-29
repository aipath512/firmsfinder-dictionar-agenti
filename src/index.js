/**
 * firmsfinder-dictionar-agenti v1.0.1 (2026-10-29)
 * GitHub: aipath512/firmsfinder-dictionar-agenti / src/index.js
 * Rol: Worker doar-citire care răspunde agenților cu conținutul dicționarului
 *      de date economice ale firmelor (https://firmsfinder.eu/dictionar/latest.json).
 * Nu citește D1, nu scrie nicăieri, nu are costuri de bază de date.
 * Verifică SHA-256 al dicționarului înainte de a-l folosi.
 */

const SITE = "https://firmsfinder.eu";
const LATEST = SITE + "/dictionar/latest.json";
const TTL_MS = 10 * 60 * 1000;
const MAX_REZULTATE = 25;
const MAX_Q = 100;

let cache = null; // { la, latest, dict, sha256, verificat }

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      ...CORS,
      ...extra,
    },
  });
}

function eroare(status, mesaj, extra = {}) {
  return json({ eroare: mesaj, ...extra }, status, { "cache-control": "no-store" });
}

async function sha256Hex(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function incarcaDictionar(fetchFn = fetch, acum = Date.now()) {
  if (cache && acum - cache.la < TTL_MS) return cache;

  const rl = await fetchFn(LATEST);
  if (!rl.ok) throw new Error("latest.json: HTTP " + rl.status);
  const latest = await rl.json();

  const fisier = (latest.fisiere || []).find((f) => /\.json$/.test(f.url) && /dictionar-economic-firme/.test(f.url));
  if (!fisier) throw new Error("latest.json nu indică un fișier de dicționar .json");

  const rd = await fetchFn(fisier.url);
  if (!rd.ok) throw new Error("dicționar: HTTP " + rd.status);
  const bytes = await rd.arrayBuffer();
  const calculat = await sha256Hex(bytes);
  const verificat = calculat === fisier.sha256;
  if (!verificat) {
    throw new Error("SHA-256 nu corespunde: așteptat " + fisier.sha256 + ", calculat " + calculat);
  }
  const dict = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  cache = { la: acum, latest, dict, sha256: calculat, verificat, fisierUrl: fisier.url, otsUrl: fisier.ots };
  return cache;
}

export function reseteazaCache() {
  cache = null;
}

function meta(c) {
  return {
    dictionar: c.dict.dictionar,
    versiune: c.dict.versiune,
    sesiune: c.latest.sesiune,
    inghetata_la: c.latest.inghetata_la,
    fisier: c.fisierUrl,
    sha256: c.sha256,
    sha256_verificat: c.verificat,
    ots: c.otsUrl,
    registru: c.latest.registru,
    nota: "Răspunsurile vin din dicționarul înghețat de mai sus. Claim ≠ Proof: starea ștampilei OpenTimestamps se vede în registru (ots_stare).",
  };
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function cauta(dict, q) {
  const t = norm(q);
  const potriviri = [];
  const adauga = (tip, obj) => {
    if (norm(JSON.stringify(obj)).includes(t)) potriviri.push({ categorie: tip, ...obj });
  };
  (dict.entitati || []).forEach((o) => adauga("entitate", o));
  (dict.proprietati || []).forEach((o) => adauga("proprietate", o));
  (dict.relatii || []).forEach((o) => adauga("relatie", o));
  (dict.politici || []).forEach((o) => adauga("politica", o));
  (dict.reguli_conflict || []).forEach((o) => adauga("regula_conflict", o));
  return potriviri;
}

const DOC = {
  serviciu: "firmsfinder-dictionar-agenti",
  versiune_serviciu: "1.0.1",
  scop: "Răspunde agenților cu dicționarul de date economice ale firmelor din România: ce înseamnă fiecare câmp și cum se interoghează corect.",
  doar_citire: true,
  acces_la_date_firme: false,
  endpointuri: {
    "/": "această descriere",
    "/dictionar": "versiune, sesiune, amprentă SHA-256, ștampilă OTS",
    "/entitati": "lista entităților",
    "/proprietati?entitate=FIRMA": "proprietățile unei entități (parametrul entitate este opțional)",
    "/relatii": "relațiile dintre entități",
    "/politici": "politici (ex. persoane fizice) și reguli de conflict între surse",
    "/cauta?q=text": "căutare în entități, proprietăți, relații, politici (maximum " + MAX_REZULTATE + " rezultate)",
  },
  sursa: LATEST,
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return eroare(405, "Sunt permise doar GET și OPTIONS.");

    const url = new URL(request.url);
    const cale = url.pathname.replace(/\/+$/, "") || "/";

    if (cale === "/") return json(DOC);

    let c;
    try {
      c = await incarcaDictionar();
    } catch (e) {
      return eroare(502, "Dicționarul nu a putut fi încărcat sau verificat.", { detaliu: String(e.message || e) });
    }
    const d = c.dict;

    if (cale === "/dictionar") return json(meta(c));
    if (cale === "/entitati") return json({ ...meta(c), numar: d.entitati.length, entitati: d.entitati });
    if (cale === "/relatii") return json({ ...meta(c), numar: d.relatii.length, relatii: d.relatii });
    if (cale === "/politici") {
      return json({ ...meta(c), politici: d.politici, reguli_conflict: d.reguli_conflict, decizii_deschise: d.decizii_deschise });
    }
    if (cale === "/proprietati") {
      const ent = url.searchParams.get("entitate");
      let p = d.proprietati;
      if (ent) p = p.filter((x) => norm(x.entitate) === norm(ent));
      return json({ ...meta(c), entitate: ent || null, numar: p.length, proprietati: p });
    }
    if (cale === "/cauta") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return eroare(400, "Parametrul q trebuie să aibă cel puțin 2 caractere.");
      if (q.length > MAX_Q) return eroare(400, "Parametrul q are maximum " + MAX_Q + " caractere.");
      const toate = cauta(d, q);
      return json({
        ...meta(c),
        q,
        total_potriviri: toate.length,
        afisate: Math.min(toate.length, MAX_REZULTATE),
        rezultate: toate.slice(0, MAX_REZULTATE),
      });
    }
    return eroare(404, "Cale necunoscută. Vedeți / pentru lista endpointurilor.");
  },
};
