# P12 — suivi de l’incident d’accès après activation

**8 novembre 2026 — incident historique ouvert, non reproduit, cause inconnue ; aucun correctif de cette cause démontré.** La clôture de l’implémentation P12 comme **validée localement** ne ferme pas cet incident et ne garantit pas la stabilité en production.

## Deux occurrences conservées

| Essai du 8 novembre (UTC) | Observation réelle |
| --- | --- |
| [12:18:24](P12-browser/2026-11-08T12-18-24-757Z-b73f5c0c-7506-48c3-a16d-5cefd35cbcdf/results.json) | Après `PAID/READY`, une origine et une intention de notification sont présentes, mais le GET membre renvoie **403**. Premier scénario échoué, sept non exécutés. |
| [12:21:51](P12-browser/2026-11-08T12-21-51-158Z-9a72661b-0825-4a2f-a4e0-2ecd746de9e6/results.json) | FR réussit. EN reçoit un GET membre **200**, puis la leçon affiche « Access required » (`PROTECTED`) et une erreur HTTP, sans corps privé. Six scénarios suivants non exécutés. |

Les [preuves P12](P12.md) et l’[index des essais](P12-browser-checks.json) conservent ces échecs et leurs nettoyages. Les traces disponibles n’établissent pas une cause de session, transaction, publication ou horloge. Aucun succès ultérieur ne remplace ces observations.

## Vérifications supplémentaires exécutées

- [Test d’accès](../../apps/api/src/test/java/com/chatgptcourses/EntitlementAccessIntegrationTest.java), méthode `freshlyCommittedPostgresTimestampIsReadableInParallelMemberAndLearningTransactions` : instant PostgreSQL transmis à Java puis réinséré sans antidatage, commit, deux sessions et **16 GET membre/activité FR/EN parallèles**, sans retry. Origine `MANUAL_TEST` isolée, sans prétendre prouver un paiement. Ciblé `-Dtest=EntitlementAccessIntegrationTest test` : **5/5**, zéro échec/erreur/ignoré, 37,87 s de tests ; Maven 58,434 s, sortie 0.
- [Suite P12 renforcée finale](P12-browser/2026-11-08T17-56-42-000Z-f832ce57-7f5c-4603-ac32-d90b05e4c121/results.json) : **8/8 en 152,320 s**, sortie 0, aucun flaky/ignoré ; 24 GET membre chevauchant les pages leçon, [27 captures examinées](P12-final-visual-check.json), [nettoyage confirmé](P12-browser/2026-11-08T17-56-42-000Z-f832ce57-7f5c-4603-ac32-d90b05e4c121/session.json).
- [Vrai Checkout Stripe TEST](P12_EXTERNAL-browser/2026-11-08T18-11-16-018Z-91de498c-559e-40f7-ba5a-598926bb85ae/results.json) : **1/1 en 100,933 s**, sortie 0. La [preuve fournisseur](P12_EXTERNAL-browser/2026-11-08T18-11-16-018Z-91de498c-559e-40f7-ba5a-598926bb85ae/stripe-test-proof.json) relie réception durable avant worker, redémarrage, `PAID/READY`, membre 200 et activité privée visible, public expurgé, puis deux rejeux fournisseur acquittés en HTTP 2xx : **une opération, un événement, une origine, une intention de notification**. [Nettoyage confirmé](P12_EXTERNAL-browser/2026-11-08T18-11-16-018Z-91de498c-559e-40f7-ba5a-598926bb85ae/session.json).

Aucun refus n’est reproduit dans ces passages. Ce résultat renforce la validation locale ; il ne démontre pas que la cause historique a été corrigée.

## Suivi obligatoire P17/P19 avant livraison

Conserver les assertions propriétaire/version/langue, les lectures privées et les observations réseau, **sans retry remplaçant un refus par un succès**. Si un 403 ou un état `PROTECTED` inattendu réapparaît après `READY` avec un droit attendu actif, arrêter la validation du parcours et suspendre sa livraison. Avant nettoyage, recueillir les statuts/codes et les faits expurgés de session, origine, dates et chaîne publiée ; aucun secret, lien porteur ni production privée dans les traces. Exploiter cette occurrence avant de requalifier le résultat. L’incident reste ouvert pour P17/P19.
