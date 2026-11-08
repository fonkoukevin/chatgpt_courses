# Revue navigateur P02

Session de référence : **8 novembre 2026**, `2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6`.

Playwright 1.65.0 / Chromium 158, environnement local Windows. **14 tests réussis en 22,906 s**, aucun skip/retry. **54 captures ouvertes et examinées** après correction. [Détails et limites](../P02.md).

Chaque page possède les captures FR/EN aux largeurs **1440, 1024, 768, 390 et 320 px** dans le dossier de session : noms `{fr|en}-{largeur}-{public|learning|admin|components}.png`.

| Écran | Ordinateur FR | Mobile FR | Mobile EN |
| --- | --- | --- | --- |
| Accueil | [1440 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/fr-1440-public.png) | [320 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/fr-320-public.png) | [390 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/en-390-public.png) |
| Leçon | [1440 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/fr-1440-learning.png) | [320 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/fr-320-learning.png) | [390 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/en-390-learning.png) |
| Administration | [1440 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/fr-1440-admin.png) | [320 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/fr-320-admin.png) | [390 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/en-390-admin.png) |
| Galerie | [1440 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/fr-1440-components.png) | [320 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/fr-320-components.png) | [390 px](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/en-390-components.png) |

Captures d’interaction FR/EN : `form-error`, `dialog`, `sheet`, `mobile-navigation`, `mobile-reference`, `gallery-interactions` et `workshop-written` (14 PNG supplémentaires).

- [Résultats structurés](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/results.json) : assertions réellement exécutées.
- [Exclusion staging/production](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/production-guards.json) : 20 réponses 404 sur le build local, sans déploiement externe.
- [Session](2026-11-08T00-17-00-657Z-8525b38c-ed0a-49b5-87b2-8021d79a89d6/session.json) : résultat et arrêt des processus supervisés.

Les exemples fictifs et leurs états locaux ne sont pas des données de production. La première session exploratoire reste conservée dans `.runtime/P02-first-visual-review` ; ce dossier référence uniquement le code final.
