# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P02 validé localement** : système visuel, galerie FR/EN et trois espaces de démonstration ; builds et recette navigateur exécutés. Aucun ancien prototype repris, aucun déploiement externe.

## Situation courante

- Dernière phase réalisée : P02, validée localement ; prochaine phase P03 à commencer sur demande.
- Git local : branche `main`, code P02 **`b5f797d`**, code final P01 **`e1616bd`**, références P00 **`c31c609`** ; aucun remote/push. Les 49 fichiers initiaux restent présents.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1.
- Démarrage vitrine : `.\scripts\courses.cmd run dev:web`, puis `/fr/dev/public` ou `/en/dev/public` ; stack complète : `run dev`. Commandes et quatre routes dans le [README](../README.md). Applications et services arrêtés, volumes conservés.
- Preuves P02 : [evidence/P02.md](evidence/P02.md), [54 captures examinées](evidence/P02-browser/README.md), [19 contrastes mesurés](evidence/P02-contrast.json). Réinstallation verrouillée, lint/typecheck/build passent ; audit npm : zéro alerte.
- Navigateur autorisé Playwright 1.65.0/Chromium 158 : **14/14 P02 réussis en 22,906 s**, FR/EN à 1440/1024/768/390/320 px ; clavier, formulaires, panneaux et travail local vérifiés. **20 refus HTTP 404** de la vitrine en modes staging/production du build local.
- Fondations [P01](evidence/P01.md) conservées ; régression après P02 **7/7 réussis en 19,5 s**, avec PostgreSQL et panne/reprise réelle de Spring. Pas de modification Java/SQL.
- Blocage P02 : aucun. Données métier non raccordées à ce stade, fixtures locales explicites. CI GitHub, recette externe, Safari/Firefox et production non observés ; aucune conformité WCAG globale revendiquée.
- Prochaine action : réaliser `prompts/P03_MODELE_DONNEES_API.txt` sur les fondations et composants existants.

## Phases

| Phase | État | Preuve ou blocage |
| --- | --- | --- |
| P00 | Validé localement | Audit, versions documentaires et préparation P01 ; voir `evidence/P00.md` |
| P01 | Validé localement | Technique et navigateur vérifiés, captures examinées ; voir `evidence/P01.md` |
| P02 | Validé localement | Composants, trois structures, 54 captures et recette ; voir `evidence/P02.md` |
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

Système visuel partagé et vitrine locale FR/EN réalisés. Badges mobiles, compte aux largeurs intermédiaires, panneau de référence et détails de lisibilité corrigés après revue. Recettes P02/P01 réussies, documentation et preuves actualisées. Aucun prix, média disponible, témoignage, permission ou achat inventé ; aucune publication.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
