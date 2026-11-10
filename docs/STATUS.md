# État réel du projet

Dernière mise à jour : **10 novembre 2026**. **P20 validé localement**, **P21 bloqué sur la confidentialité des images**. PR4 fusionnée normalement sur `8138ae0`, CI de main réussie. Ancien paquet d’essai supprimé et absence API confirmée ; nouveau paquet web encore public. Aucun déploiement Courses distant ou mode LIVE.

## Situation courante

- **P21 bloqué** : `main` **8138ae0**, CI42875658952 verte : API266/40suites, scripts Linux79, client124, navigateur4/4 sans relance, production12/12, nettoyages confirmés. Publication42877515322 : ancien paquet supprimé204 puis paquet/version404 ; nouveau web poussé, contrôle interrompu par `UND_ERR_SOCKET`. Les diagnostics constatent sa visibilité publique, confirmée par manifeste anonyme200. API non poussée, aucun manifeste validé. La cause de cette visibilité reste inconnue ; ne plus publier sous un nouveau nom sans la résoudre. Firefox refusé par la politique d’URL de l’outil, aucun contournement. SSH/DNS réels,12anciens conteneurs préservés ; aucun proxy activé ou déploiement Courses. [Faits et reprise](evidence/P21.md).
- **P20** : deux images multi-étapes réellement construites, UID10001, bases par digest ; Compose/Caddy et secrets séparés. API ciblée14/14, scripts22/22, lint/actionlint passent. Intégration isolée15 contrôles : HTTPS, smoke staging12/production10,19 migrations, mêmes images promues sans rebuild, sauvegarde chiffrée et restauration PG/S3, moniteur CLI. [Résultats et limites](evidence/P20.md), [intégration](evidence/P20-integration-checks.json), [runbooks](runbooks/deploy.md). Aucun registre/SSH/GitHub/off-host/alerte externe observé.
- **P18** : douze leçons FR/EN,18 fichiers Markdown, import CMS durable, corrigés protégés et vrais exports locaux. [Sources](../content/course-client-proposal/README.md), [résultats et limites](evidence/P18.md).
- **P19** : global API256/256,35 suites ; client124, contrat/sources223/contrastes/lint/types et15 garde-fous CI passent. Configuration production12/12 sur base vide et vraie chaîne HTTP arrêt/reprise. Chromium consolidé4/4, paiement8/8, remboursement6/6 ; huit captures examinées. Stripe TEST réel1/1 : deux Checkout, deux remboursements, quatre rejeux sans double effet, origine individuelle conservée. [Matrice, résultats et limites](evidence/P19.md), [candidate](evidence/P19-release-candidate.json).
- Schéma **V001–V019**, Flyway seul, aucune migration ajoutée P20. Base vide et upgrade vérifiés ; les83 tables partagées hors sessions sont identiques avant/après P20, aucun volume existant supprimé. [Migration](evidence/P18-upgrade.json), [préservation](evidence/P20-shared-preservation.json).
- **Brouillons P18 chargés dans la base partagée après accord utilisateur** :14 identités,28 traductions DRAFT,18 fichiers READY ; rejeu inchangé. Acteur technique désactivé, zéro rôle actif, aucun mot de passe connu conservé. Aucune publication partagée ou revue humaine. [Preuve](evidence/P18-shared-import-checks.json).
- Développement **http://localhost:3000/fr** et `/en` rétabli et listener Ready TEST observés à la fin de P20. Ces processus historiques ne prouvent pas leur disponibilité actuelle : aucun listener Stripe local n’est observé lors de la reprise du10novembre. Aucun arrêt ou redémarrage local effectué dans cette reprise. Le fichier Next préexistant garde son SHA initial. [Restauration historique](evidence/P20-development-restoration.json), [sondes historiques](evidence/P20-final-development-check.json), [audit privé](evidence/P20-private-audit.json).
- **Deux refus historiques P12 et deux refus distincts P15 restent ouverts, causes inconnues.** Les succès ultérieurs ne prouvent pas un correctif. Toute récidive impose arrêt du parcours et diagnostic avant nettoyage ; garde avant livraison commerciale maintenue pourP19. [P12](evidence/P12-access-follow-up.md), [P15](evidence/P15-access-follow-up.md).
- Deux erreurs de synchronisation de recette P19 sont conservées ; le premier timeout UNKNOWN de remboursement reste non attribué. Dernier6/6 sans bail actif, attente10s inchangée : la branche prolongée n’est pas exécutée. Ces limites restent dans le verdict avant livraison commerciale.
- Fiche d’offre de préparation seulement, sans offre backend/prix réel. Revue humaine FR/EN, vidéos, format vendu, langues de lancement, fiscalité/accès/support/légal/conservation restent à décider avant activation concernée. Aucun remplacement silencieux d’une promesse vidéo. Les demandes WAITING_POLICY sont conservées.
- Windows natif et versions applicatives verrouillées maintenus, aucune dépendance applicative ajoutée P20/P21. CI GitHub verte, historique des échecs conservé ; [procédure](CI.md). Images locales P20 issues de **a28d8d2**, IDs OCI identifiés ; aucun nouveau manifeste de release validé. Classes de l’API locale et fichier Next utilisateur préservés.

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
| P16 | Validé localement | Java41 puis22 ciblés, client119, bilingue7/7, SEO4/4,20 captures, V018 préservée ; [preuve](evidence/P16.md) |
| P17 | Validé localement | Java ciblé37 puis12 puis1, client119, Chromium9/9 puis2/2,44 captures, SQL/budgets/contrastes ; [preuve](evidence/P17.md) |
| P18 | Validé localement | Rédaction et intégration isolée4/4,18 fichiers/4 exports/18 captures ; brouillons partagés importés, acteur désactivé, vente bloquée ; [preuve](evidence/P18.md) |
| P19 | Validé localement | API256/client124, navigateur4+8+6, fournisseur TEST1/1, CI locale et production12/12 ; commerce bloqué, aucun GitHub/déploiement ; [preuve](evidence/P19.md) |
| P20 | Validé localement | Images réelles, API14/scripts22, TLS et promotion12+10, migration/restauration/moniteur15 contrôles ; cible/registre/off-host manquants ; [preuve](evidence/P20.md) |
| P21 | Bloqué | CI813verte et ancien paquet supprimé ; nouveau web public, aucun manifeste privé validé, livraison/recette non exécutées ; [suivi](evidence/P21.md) |
| P22 | À faire | Déploiement de production |
| P23 | À faire | Exploitation après lancement |

États permis : à faire, en cours, bloqué, implémenté non vérifié, validé localement, validé en recette, publié et observé. Employer seulement le niveau démontré. Un fournisseur indisponible n’empêche pas les tests locaux mais reste un blocage pour le résultat externe correspondant.

## Dernier lot

Reprise **`prompts/P21_DEPLOIEMENT_RECETTE.txt`** : finaliser P21 avant P22. CI main `8138ae0` verte ; examiner les réglages Packages et résoudre la publication publique inattendue avant toute nouvelle tentative. Le nettoyage ancien est terminé : ne pas relancer son option sur un paquet désormais absent. Le nouveau paquet `chatgpt_courses-private/web` reste public ; ne pas l’annoncer privé ou le déployer comme release validée. Candidats Caddy/Compose et helpers privés prêts, non activés. Restent publication réellement privée, Stripe TEST distant, parcours HTTPS, restauration complète et alertes. Aucun achat ou déploiement Courses distant, vente toujours bloquée par les incidents et décisions documentés.

Garder ce suivi court ; détails dans docs/evidence/Pxx.md. Repartir des fichiers et preuves réels lors d’une reprise.
