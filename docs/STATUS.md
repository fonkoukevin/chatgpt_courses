# État réel du projet

Dernière mise à jour : 7 novembre 2026. P00 réalisé : audit local et préparation documentaire. Aucune application construite, aucune intégration ni production validée. Aucun ancien prototype repris.

## Situation courante

- Phase achevée techniquement : P00, validé localement pour son périmètre d’audit ; acceptation utilisateur non présumée.
- Dépôt, branche et commit : aucun `.git`, donc aucun historique disponible ; 49 fichiers initiaux inventoriés et préservés hors mises à jour documentaires explicites.
- Environnement : Windows 11, PowerShell 5.1, Node 24.14.0/npm 11.9.0, Java 21.0.11, Docker Linux 29.8.0 et Compose 5.5.1 fonctionnels. Utiliser `npm.cmd` ; `npm.ps1` est bloqué par la politique PowerShell. Maven global et psql absents ; Wrapper prévu en P01.
- Versions proposées : [VERSIONS.md](VERSIONS.md), vérifiées dans les sources officielles ; installation et verrouillage en P01.
- Attention P01 : TS 6.0.3 et ESLint 10 avec configuration explicite JS/TS/Next/Hooks ; la configuration groupée `eslint-config-next` a des peers transitifs incompatibles, voir `VERSIONS.md`.
- Commandes de démarrage/tests : aucune application ni script présent ; à créer et exécuter en P01.
- Blocage P00 : aucun. Les accès fournisseurs, contenus et conditions commerciales restent nécessaires aux lots externes/à la vente, sans bloquer P01.
- Preuves : [evidence/P00.md](evidence/P00.md) et inventaire initial SHA-256 associé.
- Prochaine action : réaliser `prompts/P01_FONDATIONS_LOCALES.txt` avec la structure et la configuration préparées.

## Phases

| Phase | État | Preuve ou blocage |
| --- | --- | --- |
| P00 | Validé localement | Audit, versions documentaires et préparation P01 ; voir `evidence/P00.md` |
| P01 | À faire | Fondations locales |
| P02 | À faire | Charte et composants |
| P03 | À faire | Schéma et contrats |
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

README initial, `.env.example`, `.gitignore`, `VERSIONS.md`, `CONFIGURATION.md` et preuve P00 créés. `DECISIONS.md`, `SCREENS.md`, `ARCHITECTURE.md` et `DEPLOYMENT.md` harmonisés : structure, routes FR/EN, configuration et distinction proposition P00/verrouillage P01. Aucun logiciel installé, conteneur créé, compte externe utilisé ou coût engagé.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
