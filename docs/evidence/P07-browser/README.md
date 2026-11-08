# Recette locale P07

Playwright 1.65.0 et Chromium isolé, builds Next/Spring et PostgreSQL 18.6 en tmpfs. Comptes et méthodes BR01 fictifs sont créés par les vraies API. Aucun appel IA ni fournisseur externe.

| Passage UTC le 8 novembre 2026 | Résultat observé |
| --- | --- |
| [03:34:36](2026-11-08T03-34-36-136Z-dad27f54-3708-4a4e-aa08-20cf130d8146/session.json) | 4 réussites, 3 échecs d’assertion/pilotage : fins de ligne Windows, message partagé avec un lien et nettoyage d’une route retardée |
| [03:37:16](2026-11-08T03-37-16-125Z-9f5f5bf8-4a40-4880-b220-057370cd9422/session.json) | 7/7 en 41,7 s ; revue de 14 PNG puis espacement de deux actions de source corrigé |
| [03:41:27 — final](2026-11-08T03-41-27-765Z-0364c0a3-c56d-4e5f-a6bc-a0456409ba78/session.json) | **7/7 en 46,1 s**, édition CMS réelle et captures des dialogues/conflit ouverts ajoutées ; [résultats](2026-11-08T03-41-27-765Z-0364c0a3-c56d-4e5f-a6bc-a0456409ba78/results.json) |

Chaque session confirme le nettoyage de ses processus et de son PostgreSQL temporaire, sans supprimer de volume existant. Les 24 PNG finaux sont de vraies captures ; leur revue et les limites sont consignées dans [P07.md](../P07.md). Le succès des tests ne constitue pas seul une revue visuelle ou une certification d’accessibilité.

Parcours : préparation et copie FR/EN, visiteur → connexion → import volontaire → sauvegarde → autre session ; paramètres séparés du texte ; champs incomplets et confirmations ; IDOR ; changement de compte ; publication/archivage source ; duplication/suppression ; réponses retardées, conflit réel, arrêt/reprise de Spring ; ancien accusé 201 ignoré après une autre connexion réelle.
