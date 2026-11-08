# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P06 validé localement**. Autorisation utilisateur : enchaîner **P04 à P12**, dans l’ordre, en passant au lot suivant seulement après validation du précédent. Aucun ancien prototype repris ni déploiement externe.

## Situation courante

- Dernière phase réalisée : P06, validée localement ; prochaine phase P07, autorisée sans nouvelle confirmation.
- Git local : branche `main`, code P06 **`458cf7c`**, P05 **`5dab875`**, P04 **`ba63356`**, P03 **`6a53c19`** ; aucun remote/push. Les 49 fichiers initiaux restent présents.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1.
- Schéma : V001–V004 conservées ; V005 ajoute les métadonnées et snapshots de publication. Upgrade local : 13 comptes, 3 ressources et 6 révisions conservés, textes identiques, aucun compte EDITOR attribué. [DATA_MODEL.md](DATA_MODEL.md).
- Démarrage : `.\scripts\courses.cmd run dev` applique Flyway ; `run seed:local` charge explicitement un dossier fictif en brouillon. [Commandes](../README.md). Applications de vérification arrêtées ; PostgreSQL/Mailpit disponibles pour la suite, volumes et données conservés.
- Preuves [P06](evidence/P06.md) : **65 tests Java**, **30 tests du client**, OpenAPI validé et 17 fichiers générés identiques ; lint/types et builds web/API réussis. CI conservée, aucun run GitHub.
- Chromium P06 : **6/6 en 58,3 s**, recherche/filtres/langue/historique, versions du programme, premium exclu, publication et conflits réels, panne/reprise Spring. **35 captures finales examinées** à 1440/390/320 px. Régression P01 7/7, P02 14/14 et 24 vrais refus 404 staging/production ; défauts observés corrigés. Tous les processus supervisés et PostgreSQL tmpfs arrêtés ; preuves précédentes conservées.
- Blocage P06 : aucun. Catalogue public issu des publications, sans cache partagé ni offre fictive. Progression, méthodes personnelles, projets, médias et achats restent leurs lots ; SEO complet en P16 et contenu final P18 restant.
- Suite : `prompts/P07_METHODES_GENERATEUR.txt`, puis P08 à P12 automatiquement si chaque lot passe. L’utilisateur prévoit de renseigner les clés Stripe de test dans `.env.local` ; présence à revérifier en P12 sans afficher les valeurs. Prix, conditions et médias commerciaux restent ouverts.

## Phases

| Phase | État | Preuve ou blocage |
| --- | --- | --- |
| P00 | Validé localement | Audit, versions documentaires et préparation P01 ; voir `evidence/P00.md` |
| P01 | Validé localement | Technique et navigateur vérifiés, captures examinées ; voir `evidence/P01.md` |
| P02 | Validé localement | Composants, trois structures, 54 captures et recette ; voir `evidence/P02.md` |
| P03 | Validé localement | Migration, modèles, OpenAPI/client généré, 24 tests Java et intégration réelle ; voir `evidence/P03.md` |
| P04 | Validé localement | Identité, SMTP, session/CSRF, 37 tests Java et 13 scénarios Chromium ; voir `evidence/P04.md` |
| P05 | Validé localement | CMS, publication, 52 tests Java, 25 tests client et 5 scénarios Chromium ; voir `evidence/P05.md` |
| P06 | Validé localement | Site public, catalogue, versions et fiches FR/EN ; 65 tests Java et 6 scénarios Chromium ; voir `evidence/P06.md` |
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

Accueil, catalogue, fiches, guides et activité ouverte lisent les publications réelles. Métadonnées éditoriales versionnées, programme épinglé et retours filtrés vérifiés ; chargement, panne, retrait et langues indisponibles distincts. Aucune publication de production, offre ni compte administrateur connu créé.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
