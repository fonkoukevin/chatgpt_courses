# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P04 validé localement**. Autorisation utilisateur : enchaîner **P04 à P12**, dans l’ordre, en passant au lot suivant seulement après validation du précédent. Aucun ancien prototype repris ni déploiement externe.

## Situation courante

- Dernière phase réalisée : P04, validée localement ; prochaine phase P05, autorisée sans nouvelle confirmation.
- Git local : branche `main`, code P04 **`ba63356`**, P03 **`6a53c19`**, P02 **`b5f797d`** ; aucun remote/push. Les 49 fichiers initiaux restent présents.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1.
- Schéma : V001/V002 conservées ; V003 ajoute récupération et révocation des sessions. [DATA_MODEL.md](DATA_MODEL.md) décrit contraintes et extensions futures.
- Démarrage : `.\scripts\courses.cmd run dev` applique Flyway ; `run seed:local` charge explicitement un dossier fictif en brouillon. [Commandes](../README.md). Applications de vérification arrêtées ; PostgreSQL/Mailpit disponibles pour la suite, volumes et données conservés.
- Preuves [P04](evidence/P04.md) : **37 tests Java**, **18 tests du client** ; OpenAPI validé, 17 fichiers générés identiques, lint/types et builds web/API réussis.
- Navigateur autorisé Playwright/Chromium : **13/13 en 59,3 s**, FR/EN 1440/768/390/320 px ; vrais comptes, SMTP Mailpit, panne/reprise Spring et sessions conservées. 34 vues de formulaires et 7 vues fonctionnelles examinées dans les deux passages verts. Preuves précédentes conservées.
- Blocage P04 : aucun. T04 reste partiel jusqu’aux vrais projets/commandes/médias. Notification asynchrone en mémoire jusqu’à l’outbox P10 ; procédure admin préparée hors dépôt, non exécutée. CI GitHub, recette externe et production non exécutées.
- Suite : `prompts/P05_CMS_PUBLICATION.txt`, puis P06 à P12 automatiquement si chaque lot passe. L’utilisateur prévoit de renseigner les clés Stripe de test dans `.env.local` ; présence à revérifier en P12 sans afficher les valeurs. Prix, conditions et médias commerciaux restent ouverts.

## Phases

| Phase | État | Preuve ou blocage |
| --- | --- | --- |
| P00 | Validé localement | Audit, versions documentaires et préparation P01 ; voir `evidence/P00.md` |
| P01 | Validé localement | Technique et navigateur vérifiés, captures examinées ; voir `evidence/P01.md` |
| P02 | Validé localement | Composants, trois structures, 54 captures et recette ; voir `evidence/P02.md` |
| P03 | Validé localement | Migration, modèles, OpenAPI/client généré, 24 tests Java et intégration réelle ; voir `evidence/P03.md` |
| P04 | Validé localement | Identité, SMTP, session/CSRF, 37 tests Java et 13 scénarios Chromium ; voir `evidence/P04.md` |
| P05 | À faire | CMS et publication |
| P06 | À faire | Site public |
| P07 | À faire | Méthodes et générateur |
| P08 | À faire | Apprentissage et quiz |
| P09 | À faire | Projets et autoévaluation |
| P10 | À faire | Médias, stockage et emails |
| P11 | À faire | Offres et commandes |
| P12 | À faire | Stripe et attribution |
| P13 | À faire | Remboursements et droits |
| P14 | À faire | Compte, aide et attestations |
| P15 | À faire | Administration d’exploitation |
| P16 | À faire | FR/EN et SEO |
| P17 | À faire | Qualité transversale |
| P18 | À faire | Contenus et offre prête |
| P19 | À faire | Recette et CI complète |
| P20 | À faire | Infrastructure de production |
| P21 | À faire | Déploiement de recette |
| P22 | À faire | Déploiement de production |
| P23 | À faire | Exploitation après lancement |

États permis : à faire, en cours, bloqué, implémenté non vérifié, validé localement, validé en recette, publié et observé. Employer seulement le niveau démontré. Un fournisseur indisponible n’empêche pas les tests locaux mais reste un blocage pour le résultat externe correspondant.

## Dernier lot

Identité réelle, récupération, préférences et E06 FR/EN intégrés. Courses de reset, sélecteurs navigateur et lien de langue corrigés puis vérifiés. Aucun compte administrateur connu, prix ou endpoint métier fictif créé ; aucune publication.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
