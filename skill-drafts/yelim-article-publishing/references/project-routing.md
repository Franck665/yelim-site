# Project routing

Choose the project before searching or editing. Read its `AGENTS.md` first.

| Area | Canonical root | Use for |
|---|---|---|
| Article batches and database utilities | `/Users/burkinbila/Desktop/YelimVideoGen` | Product plans, batch publishing scripts, Firestore audits/corrections, image compression/upload |
| Web/admin publisher | `/Users/burkinbila/Desktop/yelim-site` | `/admin/publier-article`, `/admin/articles`, catalogue and hosting UI |
| Firebase backend | `/Users/burkinbila/Desktop/yelim-backend` | Functions, rules, indexes, server contracts |
| iOS customer app | `/Users/burkinbila/Desktop/Yelim` | Swift article model and customer catalogue behavior |
| Android customer app | `/Users/burkinbila/AndroidStudioProjects/Yelim3` | Kotlin article model and customer catalogue behavior |
| iOS admin app | `/Users/burkinbila/Desktop/yelim Admin` | Native admin workflows |
| Android admin app | `/Users/burkinbila/AndroidStudioProjects/YelimAdmmin` | Native Android admin workflows |

Related livreur and parrainage projects exist in both Desktop and AndroidStudioProjects. Inspect their own `AGENTS.md`, git state, and recent activity before choosing between similarly named copies.

## Article task routing

- Default product-image imports and bulk publication to YelimVideoGen.
- Default browser admin UI changes to yelim-site.
- Consult iOS and Android article models before changing payload shape or field types.
- Consult yelim-backend before changing server-side search, pricing, delivery, or Firestore contracts.
- Do not deploy Hosting, Functions, rules, or indexes unless explicitly requested.

## Credentials and production

- Firebase project: `school-hub-bdf8f`.
- Storage bucket: `school-hub-bdf8f.appspot.com`.
- Service account currently used by database scripts: `/Users/burkinbila/Desktop/YelimVideoGen/serviceAccountKey.json`.
- Treat the service-account file as secret. Never display, copy into a skill, commit, or include it in output.
- Prefer gcloud authentication for read-only REST audits.
