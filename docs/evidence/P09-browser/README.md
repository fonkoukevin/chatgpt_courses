# Recette navigateur P09

Chromium isolé, API Spring et PostgreSQL en tmpfs supervisés. Aucun onglet personnel ou volume Compose utilisé pour les fixtures. Les sessions/résultats indiquent les arrêts réellement confirmés. Un passage ciblé ou intermédiaire ne représente pas la recette finale.

| Session | Résultat observé | Portée |
| --- | --- | --- |
| [05:17](2026-11-08T05-17-01-982Z-b46d66fe-6016-46df-9c88-94c9b4ffb86e/session.json) | 5/8 ; nettoyage confirmé | Trois erreurs de helper : activation du bouton et libellé de reprise après panne. |
| [05:20](2026-11-08T05-20-19-866Z-1a7856db-af5b-4697-83b5-d8081e44b98e/session.json) | 7/8 ; nettoyage confirmé | Confirmation READY refusée par le client après un PATCH 200 ; observation non reproduite ensuite, cause non établie. |
| [05:23](2026-11-08T05-23-49-585Z-8fdc7287-4a79-4d9c-9578-c2d512f6cf3f/session.json) | 8/8 en 60,962 s ; nettoyage confirmé | Assertions de schéma, ETag, stade et égalité du snapshot ajoutées. |
| [05:30](2026-11-08T05-30-23-530Z-d4783d20-c606-49e3-8af2-b63b76a79293/session.json) | 8/8 répétitions FR en 102,662 s | Diagnostic ciblé, un seul scénario répété huit fois ; aucune erreur reproduite. |
| [05:33](2026-11-08T05-33-58-594Z-791e2647-d204-4e0b-bb4e-47adb577f664/session.json) | 8/8 répétitions FR en 102,972 s | Ordre d’attente initial rétabli ; aucune erreur reproduite. |
| [05:38 final](2026-11-08T05-38-07-532Z-c90e68a0-b1c0-49c1-90e7-0f72fdc0aaaa/session.json) | **8/8 en 59,944 s** ; nettoyage confirmé | Build final sans instrumentation temporaire, suite complète sans filtre ni retry. |

Les **39 PNG du passage 05:23 ont été réellement examinés** : 24 FR et 15 EN. Aucun défaut visuel bloquant observé sur atelier, bibliothèque, historique, grille, résultat déclaratif, corrigé, import/consentement, CMS et changement de compte. Les grands fichiers ont été ouverts en détail original pour lire les contrôles et comparaisons. La capture de reprise API avait saisi l’ancienne erreur de lecture du statut avant actualisation ; l’attente de rétablissement a été renforcée pour la recette finale.

Cinq PNG finaux ont également été réellement examinés : `fr-390-project-editor`, `fr-320-project-library`, `fr-390-project-api-recovered`, `en-390-self-assessment-blocking-readable` et `en-320-project-account-changed`. La reprise ne contient plus l’ancienne alerte, les textes/actions restent accessibles, le 20/20 avec erreur demeure À réviser et le changement de compte conserve la saisie sans faux accusé. Il ne s’agit pas d’une revendication de revue intégrale des 39 nouveaux PNG finaux.

Exemples : [atelier 1440](2026-11-08T05-23-49-585Z-8fdc7287-4a79-4d9c-9578-c2d512f6cf3f/fr-1440-project-editor.png), [atelier 320](2026-11-08T05-23-49-585Z-8fdc7287-4a79-4d9c-9578-c2d512f6cf3f/fr-320-project-editor.png), [score déclaré et erreur bloquante](2026-11-08T05-23-49-585Z-8fdc7287-4a79-4d9c-9578-c2d512f6cf3f/fr-390-self-assessment-blocking-readable.png), [conflit](2026-11-08T05-23-49-585Z-8fdc7287-4a79-4d9c-9578-c2d512f6cf3f/fr-390-project-conflict.png), [CMS](2026-11-08T05-23-49-585Z-8fdc7287-4a79-4d9c-9578-c2d512f6cf3f/fr-390-cms-project-policy-saved.png).

Les nombres dans les noms désignent le viewport. Les captures de région sont plus étroites que le viewport : par exemple 324 px à 390, 254 px à 320. Les textes sont fictifs et les identités aléatoires ; une capture ne remplace pas les assertions fonctionnelles du rapport JSON.

Suivi global et validation finale : [P09.md](../P09.md). Aucun déploiement ou service externe validé par cette recette.
