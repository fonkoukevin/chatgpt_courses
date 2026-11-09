# État réel du projet

Dernière mise à jour : **9 novembre 2026**. **P14 validé localement**, après P04–P13 validés dans l’ordre et intégration Stripe TEST externe observée pour P12. Aucun ancien prototype repris, aucun mode LIVE ni déploiement.

## Situation courante

- **P14 validé localement** : compte E13 FR/EN, aide persistée/pièces choisies, demandes de données traçables et vraies attestations HTML privées de participation déclarée. Critères serveur, idempotence, absence de revue humaine et instantanés historiques vérifiés. [Résultat, corrections et limites](evidence/P14.md).
- **221 tests Java**, client **104**, Chromium P14 **12/12** puis ciblé contexte **2/2**, régression P13 **6/6** ; builds, OpenAPI/types, lint et types réussis. **48 captures examinées**. Ciblés non additionnés au global. [API](evidence/P14-api-final-checks.json), [web](evidence/P14-web-final-checks.json), [navigateur](evidence/P14-browser-checks.json), [régression](evidence/P14-refund-regression-checks.json).
- Schéma **V001–V016** : migration sans seed, lignes des59 tables originales préservées, aucun volume supprimé. Défaut intermittent de chronologie corrigé sans nouvelle migration ni réécriture d’historique, avec deux régressions PostgreSQL. [Migration](evidence/P14-upgrade.json), [préservation](evidence/P14-upgrade-preservation.json).
- Développement réellement rétabli sur `http://localhost:3000/fr` et `/en`, proxy Spring200 ; privé anonyme401, webhook non signé400. Listener **Ready TEST**, API2026-10-28.endive, processus vivants. Configuration privée et fichier Next utilisateur préservés. [HTTP](evidence/P14-final-development-check.json), [restauration](evidence/P14-development-restoration.json), [audit](evidence/P14-private-audit.json).
- Windows natif et versions verrouillées conservés, aucune dépendance ajoutée. Git main local, code P14 `2d14628`, preuves séparées ; aucun push, remboursement Stripe externe, mode LIVE, déploiement ou CI GitHub exécuté. Les justificatifs commerciaux absents ne sont pas fabriqués.
- P12 reste validé localement avec vrai Checkout TEST. **Deux refus historiques après READY toujours de cause inconnue**, non reproduits, aucun correctif revendiqué : garde P17/P19 avant livraison. [Suivi](evidence/P12-access-follow-up.md). La limite antérieure P09 reste dans sa preuve.
- Conservation/traitements irréversibles, documents commerciaux, conditions/prix/fiscalité/durée et horaires/délais d’aide restent à valider avant activation concernée ou vente. Demandes WAITING_POLICY persistées, aucun effacement automatique. **Prochain lot : P15**, non commencé.

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
| P07 | Validé localement | Générateur, bibliothèque, propriété et copies immuables ; 78 tests Java et 7 scénarios Chromium ; voir `evidence/P07.md` |
| P08 | Validé localement | Apprentissage, quiz, notes et historique ; 95 tests Java, 10 scénarios Chromium ; voir `evidence/P08.md` |
| P09 | Validé localement | Projets et autoévaluation ; 112 tests Java, 8 scénarios Chromium ; [preuve et limites](evidence/P09.md) |
| P10 | Validé localement | Stockage, vidéo locale de test et outbox ; 138 tests Java, 12 scénarios Chromium ; [preuves](evidence/P10.md) |
| P11 | Validé localement | Offres/snapshots/commandes ; global Java155 puis HTTP10 final, Chromium8/8 ; [preuves](evidence/P11.md) |
| P12 | Validé localement | Checkout fournisseur TEST1/1, local8/8, accès5/5,30captures examinées ; incident historique suivi P17/P19, aucun LIVE ; [preuves](evidence/P12.md) |
| P13 | Validé localement | Java203, client91, Chromium6/6+ciblé1/1, régression8/8,42captures, upgrade préservé ; [preuves](evidence/P13.md) |
| P14 | Validé localement | Java221, client104, Chromium12/12+ciblé2/2, régression6/6,48captures, migration/restauration préservées ; [preuve](evidence/P14.md) |
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

P14 raccorde le compte, l’aide et les attestations aux services existants. Propriété, preuves déclaratives, documents réels, conflits/réponses retardées, incidents SMTP et ordre causal des historiques sont vérifiés. Les politiques absentes bloquent leur activation, pas les fonctions déjà contrôlées. Prochaine instruction : `prompts/P15_ADMIN_EXPLOITATION.txt`.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
