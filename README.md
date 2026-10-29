# firmsfinder-dictionar-agenti (v1.0, 2026-10-29)

Worker Cloudflare, doar citire. Răspunde agenților cu dicționarul de date economice ale firmelor
(https://firmsfinder.eu/dictionar/latest.json): ce înseamnă fiecare câmp și cum se interoghează corect.

- Nu citește D1, nu scrie nicăieri, fără cost de bază de date.
- Descarcă dicționarul înghețat, îi verifică SHA-256 cu amprenta din `latest.json` și refuză să servească date dacă nu se potrivesc.
- Memorie temporară în Worker: 10 minute.

## Endpointuri (doar GET)

| Cale | Ce întoarce |
|---|---|
| `/` | descrierea serviciului (nu încarcă dicționarul) |
| `/dictionar` | versiune, sesiune, SHA-256, ștampilă OTS |
| `/entitati` | entitățile |
| `/proprietati?entitate=FIRMA` | proprietățile (filtru opțional) |
| `/relatii` | relațiile |
| `/politici` | politici, reguli de conflict, decizii deschise |
| `/cauta?q=text` | căutare, maximum 25 de rezultate |

## Publicare

GitHub → Cloudflare Workers Builds (Workers & Pages → Create → Import a repository). Nume Worker: `firmsfinder-dictionar-agenti`.

## Teste

`DICT_PATH=<cale spre dictionar-economic-firme_vX.Y.Z_AAAA-LL-ZZ.json> node --test tests/worker.test.mjs`

## Limite (v1.0)

Nu are chei de acces, limită de cereri sau acces la datele firmelor. Acestea sunt decizii separate.
