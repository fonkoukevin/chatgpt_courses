# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P03 validé localement** : modèle de données, migration V002, OpenAPI, client généré et vérifications PostgreSQL/HTTP/navigateur exécutées. Aucun ancien prototype repris ni déploiement externe.

## Situation courante

- Dernière phase réalisée : P03, validée localement ; prochaine phase P04 à commencer sur demande.
- Git local : branche `main`, code P03 **`6a53c19`**, code P02 **`b5f797d`**, références P00 **`c31c609`** ; aucun remote/push. Les 49 fichiers initiaux restent présents.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1.
- Schéma : **V001 inchangée**, V002 ajoute douze tables ; UUID/UTC/révisions, historique et contraintes vérifiés. Modèle et extensions futures dans [DATA_MODEL.md](DATA_MODEL.md) ; aucune route métier fictive.
- Démarrage : `.\scripts\courses.cmd run dev` applique Flyway ; `run seed:local` charge explicitement un dossier fictif en brouillon. Vitrine P02 : `run dev:web`. [Commandes](../README.md). Applications/services arrêtés, volumes et données conservés.
- Preuves [P03](evidence/P03.md) : **24 tests Java réussis dont 13 PostgreSQL**, base vide, upgrade V001 et volume local, contraintes, gel concurrent et concurrence JPA. **8 tests du client** ; OpenAPI validé, 17 fichiers générés vérifiés, divergence et CRLF contrôlés.
- Réinstallation verrouillée, lint/types et builds web/API réussis ; audit npm : zéro alerte. CI enrichie contrat/client et syntaxiquement vérifiée, run GitHub non exécuté.
- Navigateur autorisé Playwright/Chromium : **7/7 réussis en 20,127 s** avec SDK P03, FR/EN 1440/390/320 px ; panne/reprise réelle de Spring et **16 captures examinées**. Preuves [P01](evidence/P01.md)/[P02](evidence/P02.md) conservées.
- Blocage P03 : aucun. Authentification et cas d’utilisation métier à intégrer dans leurs lots. Prix, conditions et médias commerciaux restent ouverts ; aucune recette externe/production observée.
- Prochaine action : réaliser `prompts/P04_IDENTITE_SECURITE.txt` sur le schéma et les contrats présents.

## Phases

| Phase | État | Preuve ou blocage |
| --- | --- | --- |
| P00 | Validé localement | Audit, versions documentaires et préparation P01 ; voir `evidence/P00.md` |
| P01 | Validé localement | Technique et navigateur vérifiés, captures examinées ; voir `evidence/P01.md` |
| P02 | Validé localement | Composants, trois structures, 54 captures et recette ; voir `evidence/P02.md` |
| P03 | Validé localement | Migration, modèles, OpenAPI/client généré, 24 tests Java et intégration réelle ; voir `evidence/P03.md` |
| P04 | À faire | Identité et sécurité |
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

Socle identité/contenu, migrations, contrat et client généré réalisés. Format Problem corrigé après test, attentes SQL RESTRICT alignées sur PostgreSQL, replay de fixture et génération CRLF vérifiés. Aucun compte connu, prix ou endpoint métier fictif créé ; aucune publication.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
