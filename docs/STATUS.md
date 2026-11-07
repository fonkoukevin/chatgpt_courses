# État réel du projet

Dernière mise à jour : **8 novembre 2026**. P01 implémenté ; builds et intégration HTTP/PostgreSQL vérifiés localement. **Recette navigateur bloquée par l’outil**, donc P01 non entièrement validé. Aucun ancien prototype repris, aucun déploiement externe.

## Situation courante

- Phase active : P01 ; P00 validé localement et progression vers P01 demandée par l’utilisateur.
- Git local : branche `main`, code P01 **`cada986`**, références P00 **`c31c609`** ; aucun remote/push. Les 49 fichiers initiaux restent présents.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1.
- Démarrage : `.\scripts\courses.cmd run dev` ; commandes exactes dans le [README](../README.md). Services/applications arrêtés en fin de vérification, volumes conservés.
- Preuves : [evidence/P01.md](evidence/P01.md) ; `npm ci`, lint/typecheck/build, cinq tests API PostgreSQL, persistance après redémarrage, panne/reprise HTTP et profil CI isolé passent. Audit npm : zéro alerte.
- Blocage : Computer Use interrompu, contrôle d’URL non pris en charge pour le navigateur Windows connecté. Aucune page produit ni interaction UI observée. CI syntaxiquement vérifiée, sans run GitHub.
- Prochaine action : reprendre uniquement la vérification navigateur de P01, consigner la preuve puis lancer `prompts/P02_DESIGN_SYSTEM_INTERFACES.txt`.

## Phases

| Phase | État | Preuve ou blocage |
| --- | --- | --- |
| P00 | Validé localement | Audit, versions documentaires et préparation P01 ; voir `evidence/P00.md` |
| P01 | Implémenté non vérifié | Technique locale vérifiée ; recette navigateur bloquée, voir `evidence/P01.md` |
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

Applications, migration d’infrastructure, Compose, lockfile/Wrapper, scripts et workflow CI créés. README, VERSIONS, CONFIGURATION, API_CONTRACTS, ARCHITECTURE, DEPLOYMENT et DECISIONS actualisés. Aucun compte fournisseur, coût, prix ou contenu commercial inventé. Aucun achat ni publication.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
