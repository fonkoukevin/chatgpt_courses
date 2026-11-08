# Recette publique P06

Recette locale du build Next/Spring avec Playwright 1.65.0, Chromium isolé et PostgreSQL 18.6 en tmpfs. Publications fictives créées via le CMS, sans modification du volume Compose. Aucun fournisseur externe ou paiement réel sollicité.

Passage final : **6/6 scénarios, 58,3 s**, zéro ignoré. [Résultats](2026-11-08T03-05-15-235Z-ae46c4c9-1dc6-45ff-a95f-148d2eaa00c7/results.json), [session et nettoyage](2026-11-08T03-05-15-235Z-ae46c4c9-1dc6-45ff-a95f-148d2eaa00c7/session.json). Les 35 PNG du dossier sont des captures réelles ; leur revue est consignée dans [P06.md](../P06.md).

| Début UTC le 8 novembre 2026 | Résultat observé |
| --- | --- |
| [02:54:12](2026-11-08T02-54-12-951Z-f2d39f33-4711-4f5c-8ccf-0ad537aadeb3/session.json) | Échec : deux sélecteurs de test inadaptés, quatre scénarios non exécutés |
| [02:56:01](2026-11-08T02-56-01-054Z-40c9fcca-00b1-45fa-887a-4092918237c2/session.json) | Échec : comparaison d’URL brute, un scénario réussi et quatre non exécutés |
| [02:57:36](2026-11-08T02-57-36-703Z-2144a402-d95b-4ecd-88df-7d141a5bd1bb/session.json) | Échec : sélecteur de message masqué sur mobile ; cinq scénarios réussis |
| [03:00:15](2026-11-08T03-00-15-532Z-81e13d54-2f86-4fd8-9dea-1d745b05f4ec/session.json) | 6/6 en 51,4 s ; deux captures d’accueil 320 montrent le chargement, pas le contenu |
| [03:01:46](2026-11-08T03-01-46-776Z-52810415-441d-449d-bd6a-3a28cdaba3a9/session.json) | 6/6 en 52,5 s ; revue révélant encore un code de filtre visible pendant la panne |
| [03:05:15](2026-11-08T03-05-15-235Z-ae46c4c9-1dc6-45ff-a95f-148d2eaa00c7/session.json) | Final : 6/6 en 58,3 s, captures après contenu prêt, libellés FR/EN vérifiés même pendant la panne |

Tous les passages ont un nettoyage confirmé : seuls leurs processus et leur PostgreSQL temporaire ont été arrêtés. Les passages intermédiaires sont conservés et ne remplacent pas le résultat final. La chaîne utilise un arrêt réel de Spring et une reprise sur le même Next ; les réponses du catalogue ne sont pas simulées.
