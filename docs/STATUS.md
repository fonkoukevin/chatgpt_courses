# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P13 validé localement**, après P04–P12 validés localement dans l’ordre et intégration Stripe TEST externe observée pour P12. Aucun ancien prototype repris, aucun mode LIVE ni déploiement.

## Situation courante

- **P13 validé localement** : demandes/décisions/exécutions séparées, budgets réservés, rapprochement, retraits par origine et E13/E16 FR/EN. Pack A+B remboursé : A individuel conservé, B refusé ; travail personnel préservé. [Preuves, corrections et limites](evidence/P13.md).
- Vérifications finales : **203 tests Java**, client **91**, Chromium P13 **6/6**, ciblé privé FR/EN **1/1**, régression P12 **8/8** ; builds, contrat généré, lint et types réussis. **42 captures examinées**. Les compteurs ciblés ne s’ajoutent pas au global. [API](evidence/P13-api-final-checks.json), [navigateur](evidence/P13-browser-checks.json), [régression](evidence/P13-payment-regression-checks.json).
- Schéma **V001–V015** : upgrade sans seed,49 tables originales comparées et toutes leurs lignes préservées. Aucun volume supprimé ; fixtures dans PostgreSQL/S3/Mailpit temporaires nettoyés. [Migration](evidence/P13-upgrade.json), [préservation](evidence/P13-upgrade-preservation.json).
- Développement rétabli sur `http://localhost:3000/fr` et `/en`, proxy Spring200 ; listener **Ready TEST**, API2026-10-28.endive, huit événements. Secrets conservés, seul indicateur privé ajouté : `REFUND_WORKER_ENABLED=true` ; fichier Next utilisateur restauré. [HTTP](evidence/P13-final-development-check.json), [restauration](evidence/P13-development-restoration.json).
- Windows natif ; Node24.22.2/npm11.19.1, Java21.0.13+9/Wrapper3.10.0 et versions convenues conservés. Git local main, code P13 `611ca88` ; preuves dans un commit distinct, aucun remote/push. Aucun remboursement fournisseur externe, mode LIVE, déploiement ou CI GitHub exécuté ; commerce partagé désactivé.
- P12 reste validé localement avec vrai Checkout TEST. **Deux refus historiques après READY toujours de cause inconnue**, non reproduits, aucun correctif revendiqué : garde P17/P19 avant livraison. [Suivi](evidence/P12-access-follow-up.md). La limite antérieure P09 reste dans sa preuve.
- Conditions/prix/fiscalité/durée/support, médias et politique commerciale/légale de remboursement restent à renseigner par le porteur. **Prochain lot : P14**, non commencé ; aucun engagement client inventé.

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

P13 sépare demande, consentement opérateur, résultat financier et effets d’accès. Concurrence, timeout, doublons, remboursements externes à examiner, budgets après contradiction et nouveaux liens privés sont vérifiés localement. La recette de remboursement chez Stripe et la production restent distinctes. Prochaine instruction disponible : `prompts/P14_COMPTE_AIDE_ATTESTATIONS.txt`.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
