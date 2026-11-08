# Recette locale P08

Playwright 1.65.0, Chromium isolé, vrais builds Next/Spring et PostgreSQL 18.6 en tmpfs. Données BR01 et comptes fictifs dans cette seule base ; aucune API IA, aucun achat ni média fabriqué.

| Passage UTC le 8 novembre 2026 | Résultat observé |
| --- | --- |
| [04:18:45](2026-11-08T04-18-45-910Z-efb19c62-da6a-45e8-8617-a272bddb2975/session.json) | 4 réussites / 6 échecs ; duplication réelle de notes par clé React commune et sélecteur d’état vide incorrect ; 11 captures intermédiaires examinées, espacement de boutons corrigé |
| [04:23:44](2026-11-08T04-23-44-748Z-a3acb5dd-0647-4c13-992e-93d422bce650/session.json) | 9 réussites / 1 échec ; attendu 409 corrigé pour tenir compte du refus CSRF 403 qui précède la précondition de compte |
| [04:25:59](2026-11-08T04-25-59-723Z-75f5dc1a-89a3-471a-a7ff-0107f92f6b64/session.json) | **10/10 en 75,27 s**, zéro ignoré ; 33 PNG examinés, avant simplification de quatre libellés |
| [04:34:17 — final](2026-11-08T04-34-17-927Z-105a8bfe-64b9-4111-a76f-80e320c49e64/session.json) | **10/10 en 72,87 s**, zéro ignoré ; [résultats](2026-11-08T04-34-17-927Z-105a8bfe-64b9-4111-a76f-80e320c49e64/results.json), **33 nouveaux PNG finaux examinés** |

Les quatre sessions confirment l’arrêt de leurs processus et de leur base temporaire. Aucun volume existant supprimé. Détails des commandes, règles, défauts corrigés et limites : [P08.md](../P08.md).

Parcours : activité gratuite FR/EN avant compte, correction serveur non conservée, inscription explicite, faits pédagogiques séparés, notes et tentatives durables, seconde session EN avec note FR inchangée, propriété/compte changé, réponses retardées, conflit choisi, panne/reprise réelle de Spring, session absente, publication modifiée, retrait d’activité/module/parcours, historique privé conservé et ancien accusé ignoré après une autre connexion réelle.
