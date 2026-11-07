# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P01 validé localement** : builds, PostgreSQL, HTTP, sept tests navigateur Playwright et revue des captures. Aucun ancien prototype repris, aucun déploiement externe.

## Situation courante

- Dernière phase réalisée : P01, validée localement ; prochaine phase P02 à commencer sur demande.
- Git local : branche `main`, code final P01 **`e1616bd`**, références P00 **`c31c609`** ; aucun remote/push. Les 49 fichiers initiaux restent présents.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1.
- Démarrage : `.\scripts\courses.cmd run dev` ; commandes exactes dans le [README](../README.md). Services/applications arrêtés en fin de vérification, volumes conservés.
- Preuves : [evidence/P01.md](evidence/P01.md) et [recette navigateur](evidence/P01-browser/README.md) ; installation verrouillée, lint/typecheck/build, cinq tests API PostgreSQL, persistance et panne/reprise HTTP passent. Audit npm : zéro alerte.
- Navigateur : méthode Playwright explicitement autorisée, version 1.65.0/Chromium 158 ; **7/7 réussis en 18,929 s**, 16 captures examinées en FR/EN à 1440/390/320 px. Perte du focus corrigée et reprise réelle de Spring vérifiée.
- Blocage P01 : aucun. CI syntaxiquement vérifiée, run GitHub et production non observés ; intégrations et conditions commerciales restent aux lots prévus.
- Prochaine action : réaliser `prompts/P02_DESIGN_SYSTEM_INTERFACES.txt` avec les fondations existantes.

## Phases

| Phase | État | Preuve ou blocage |
| --- | --- | --- |
| P00 | Validé localement | Audit, versions documentaires et préparation P01 ; voir `evidence/P00.md` |
| P01 | Validé localement | Technique et navigateur vérifiés, captures examinées ; voir `evidence/P01.md` |
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

Fondations, scripts et CI créés ; recette Chromium exécutée, perte de focus corrigée et 16 captures examinées. Documentation et preuves actualisées. Aucun compte fournisseur, coût, prix ou contenu commercial inventé. Aucun achat ni publication.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
