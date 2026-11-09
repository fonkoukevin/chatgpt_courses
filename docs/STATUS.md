# État réel du projet

Dernière mise à jour : **9 novembre 2026**. **P15 validé localement**, après P04–P14 validés dans l’ordre et intégration Stripe TEST externe observée pour P12. Aucun ancien prototype repris, aucun mode LIVE ni déploiement.

## Situation courante

- **P15 validé localement** : exploitation FR/EN, commandes/instantanés, reprises autorisées, assistance interne et publication explicite, dossiers éditoriaux, audit expurgé et mesures/CSV multidevise. Aucune note interne ou brouillon envoyé comme réponse. [Résultat, corrections et limites](evidence/P15.md).
- **234 tests Java**, client **112**, Chromium P15 **6/6** et régression paiement **8/8** ; builds, OpenAPI/types et lint réussis. Les20 captures P15 sont examinées ; sur27 captures de régression, huit sont examinées et19 ne le sont pas. [API](evidence/P15-api-global-checks.json), [web](evidence/P15-web-final-checks.json), [navigateur](evidence/P15-browser-checks.json), [régression](evidence/P15-payments-regression-checks.json). Ciblés non additionnés au global.
- Schéma **V001–V017** : migration sans seed, lignes des67 tables antérieures préservées, aucun volume supprimé. Corrections ciblées des dates outbox/inbox et fixtures vérifiées sans modifier les migrations antérieures, contraintes ou délais. [Migration](evidence/P15-upgrade.json), [préservation](evidence/P15-upgrade-preservation.json), [artefact commun aux recettes](evidence/P15-artifact-check.json).
- Applications et listener TEST temporairement arrêtés par contrôle de propriété jusqu’à la fin du batch autorisé ; PostgreSQL/Mailpit partagés et volumes conservés. Configuration privée et fichier Next utilisateur préservés. Audit final :1248 fichiers et54 fichiers de build navigateur sans valeur privée connue. [Audit](evidence/P15-private-audit.json).
- Windows natif et versions verrouillées conservés, aucune dépendance ajoutée. Git main local, code P15 `32f0334` ; aucun push, remboursement Stripe externe, mode LIVE, déploiement ou CI GitHub exécuté. Les justificatifs commerciaux absents ne sont pas fabriqués.
- P12 reste validé localement avec vrai Checkout TEST. **Deux refus historiques après READY et deux refus distincts observés en tests P15 restent de cause inconnue** ; les passages ultérieurs réussis ne démontrent aucun correctif de ces causes. Garde P17/P19 avant livraison du parcours commercial : [P12](evidence/P12-access-follow-up.md), [P15](evidence/P15-access-follow-up.md). La limite antérieure P09 reste dans sa preuve.
- Conservation/traitements irréversibles, documents commerciaux, conditions/prix/fiscalité/durée et horaires/délais d’aide restent à valider avant activation concernée ou vente. Demandes WAITING_POLICY persistées, aucun effacement automatique.
- **Mandat P15→P19 dans l’ordre ; prochaine phase P16 à faire** : bilingue et SEO, avec les gardes commerciales ci-dessus conservées jusqu’à leur vérification P17/P19.

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
| P15 | Validé localement | Java234, client112, Chromium6/6/clavier et régression paiement8/8, upgrade préservé ; incidents d’accès ouverts P17/P19 ; [preuve](evidence/P15.md) |
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

P15 raccorde les outils d’exploitation aux services réels et à leurs permissions, conserve les instantanés et distingue brouillon, réponse, note interne, mesure connue et inconnue. Global234 et recettes sur le même JAR réussis ; historiques d’échecs conservés et incidents d’accès toujours ouverts avant livraison commerciale. Prochaine instruction : `prompts/P16_BILINGUE_SEO.txt`.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
