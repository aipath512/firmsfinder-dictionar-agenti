import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import worker, { incarcaDictionar, reseteazaCache } from "../src/index.js";

const DICT = process.env.DICT_PATH;
if (!DICT) { console.log("DICT_PATH lipsește: testele sunt omise."); process.exit(0); }
const bytes = readFileSync(DICT);
const sha = createHash("sha256").update(bytes).digest("hex");
const URL_D = "https://firmsfinder.eu/dictionar/dictionar-economic-firme_v1.0.2_2026-10-29.json";
const latest = (s) => ({
  versiune: "1.0.2", sesiune: "0008H", inghetata_la: "2026-10-29T18:32:59+02:00",
  fisiere: [{ url: URL_D, sha256: s, ots: URL_D + ".ots" }],
  registru: "https://firmsfinder.eu/sesiuni/registru-sesiuni.json",
});
function mockFetch(s) {
  globalThis.fetch = async (u) => {
    if (u.endsWith("latest.json")) return new Response(JSON.stringify(latest(s)), { status: 200 });
    if (u === URL_D) return new Response(bytes, { status: 200 });
    return new Response("nu", { status: 404 });
  };
}
const get = (p, m = "GET") => worker.fetch(new Request("https://w.example" + p, { method: m }));

test("/ nu cere dicționarul", async () => {
  reseteazaCache(); globalThis.fetch = async () => { throw new Error("nu trebuie apelat"); };
  const r = await get("/"); assert.equal(r.status, 200);
  const j = await r.json(); assert.equal(j.doar_citire, true);
});
test("/dictionar: amprentă verificată", async () => {
  reseteazaCache(); mockFetch(sha);
  const j = await (await get("/dictionar")).json();
  assert.equal(j.sha256, sha); assert.equal(j.sha256_verificat, true); assert.equal(j.versiune, "1.0.2");
});
test("amprentă greșită => 502, nu servește date", async () => {
  reseteazaCache(); mockFetch("0".repeat(64));
  const r = await get("/entitati"); assert.equal(r.status, 502);
});
test("/proprietati?entitate=FIRMA filtrează", async () => {
  reseteazaCache(); mockFetch(sha);
  const j = await (await get("/proprietati?entitate=firma")).json();
  assert.ok(j.numar > 0 && j.proprietati.every((p) => p.entitate === "FIRMA"));
});
test("/cauta găsește coduri_stare, fără diacritice", async () => {
  reseteazaCache(); mockFetch(sha);
  const j = await (await get("/cauta?q=coduri_stare")).json();
  assert.ok(j.total_potriviri > 0 && j.afisate <= 25);
  const j2 = await (await get("/cauta?q=persoane%20fizice")).json();
  assert.ok(j2.total_potriviri > 0);
});
test("/cauta valida q", async () => {
  reseteazaCache(); mockFetch(sha);
  assert.equal((await get("/cauta?q=a")).status, 400);
  assert.equal((await get("/cauta?q=" + "x".repeat(101))).status, 400);
});
test("metode și căi", async () => {
  reseteazaCache(); mockFetch(sha);
  assert.equal((await get("/entitati", "POST")).status, 405);
  assert.equal((await get("/nimic")).status, 404);
  assert.equal((await get("/", "OPTIONS")).status, 204);
});
test("cache: a doua cerere nu reîncarcă", async () => {
  reseteazaCache(); let n = 0; const f = (s) => { mockFetch(s); const o = globalThis.fetch; globalThis.fetch = async (u) => { n++; return o(u); }; };
  f(sha); await incarcaDictionar(globalThis.fetch, 1000); const dupa = n; await incarcaDictionar(globalThis.fetch, 2000);
  assert.equal(n, dupa);
});
