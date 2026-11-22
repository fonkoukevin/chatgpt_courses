# État réel du projet

Dernière mise à jour : **22 novembre 2026** (Europe/Paris). **AUD-01 validé localement** : sélection explicite de vitrine, états vides et choix de langue vérifiés. [Résultats et limites](evidence/AUD-01.md). **Staging reste sur `7572fcf`, sans fenêtre HTTP Basic**, avec20 migrations ; aucun déploiement AUD-01 effectué. P21 et ses preuves historiques restent acquis. AUD-02 et P22 non commencés, commerce et LIVE fermés.

## Situation courante

- **AUD-01 seulement** : [inventaire observé](evidence/AUD-01-inventory.json), provenance des35 objets de staging reliée aux checkpoints P21 ; aucune métadonnée d’orientation publiée, aucun GUIDE/METHOD_TEMPLATE. V021 et API de sélection validées sur PostgreSQL isolé :61 cas consolidés et84 tables antérieures préservées. Chromium AUD01 4/4, catalogue P06 6/6, huit rendus UI et build passent. [Clôture](evidence/AUD-01-closure-checks.json) :83 tables locales et22 suivies sur staging inchangées ; brouillons P18 intacts, aucune purge ni publication éditoriale automatique.
- **Accès direct de recette observé** : [résultat](evidence/P21-staging-direct-access-observed.json), [CI main](evidence/P21-ci-43763492075.json), [déploiement](evidence/P21-deployment-43765849214.json). Pages FR/EN200 sans challenge Basic,17 JavaScript/1 CSS accessibles ; API privées/admin401 et CSRF403. Sauvegarde chiffrée actuelle/copie PC vérifiées avant remplacement ;19 tables et24 autres conteneurs préservés, gate temporaire retiré et moniteur sans alerte. [Détails et limites](evidence/P21-staging-direct-access.md).
- **P21 validé en recette** : source historique `7d9794c`, Flyway20/20 ; [déploiement de validation](evidence/P21-deployment-43749629915.json), [core](evidence/P21-core-schema20-observed.json), [CMS/apprentissage](evidence/P21-schema20-functional-observed.json), [paiements TEST/renvois](evidence/P21-native-payments-observed.json) et [incidents](evidence/P21-controlled-incidents-observed.json). [Restauration applicative](evidence/P21-restore-application-observed.json), [cinq tables financières](evidence/P21-restore-financial-observed.json), [répétition et surveillance](evidence/P21-repeat-and-monitor-observed.json) réellement réussies :14 tables/objets READY identiques, productions privées intactes, mêmes images, aucun double droit,24 autres conteneurs préservés. Source alors disponible, gate retiré ; anciens échecs, verrous et cibles conservés. [Limites et verdict P22](evidence/P21.md). Ne pas rejouer les acquis financiers ; commerce fermé.
- **P20** : deux images multi-étapes réellement construites, UID10001, bases par digest ; Compose/Caddy et secrets séparés. API ciblée14/14, scripts22/22, lint/actionlint passent. Intégration isolée15 contrôles : HTTPS, smoke staging12/production10,19 migrations, mêmes images promues sans rebuild, sauvegarde chiffrée et restauration PG/S3, moniteur CLI. [Résultats et limites](evidence/P20.md), [intégration](evidence/P20-integration-checks.json), [runbooks](runbooks/deploy.md). Aucun registre/SSH/GitHub/off-host/alerte externe observé.
- **P18** : douze leçons FR/EN,18 fichiers Markdown, import CMS durable, corrigés protégés et vrais exports locaux. [Sources](../content/course-client-proposal/README.md), [résultats et limites](evidence/P18.md).
- **P19** : global API256/256,35 suites ; client124, contrat/sources223/contrastes/lint/types et15 garde-fous CI passent. Configuration production12/12 sur base vide et vraie chaîne HTTP arrêt/reprise. Chromium consolidé4/4, paiement8/8, remboursement6/6 ; huit captures examinées. Stripe TEST réel1/1 : deux Checkout, deux remboursements, quatre rejeux sans double effet, origine individuelle conservée. [Matrice, résultats et limites](evidence/P19.md), [candidate](evidence/P19-release-candidate.json).
- Schéma de recette actif **V001–V020**, Flyway seul. V020 remplace uniquement le CHECK des chemins Checkout par C/G ; migrations antérieures intactes, tests PostgreSQL d’upgrade réussis en CI. En P20, les83 tables partagées hors sessions sont identiques avant/après, aucun volume existant supprimé. [Migration](evidence/P18-upgrade.json), [préservation](evidence/P20-shared-preservation.json).
- **Brouillons P18 chargés dans la base partagée après accord utilisateur** :14 identités,28 traductions DRAFT,18 fichiers READY ; rejeu inchangé. Acteur technique désactivé, zéro rôle actif, aucun mot de passe connu conservé. Aucune publication partagée ou revue humaine. [Preuve](evidence/P18-shared-import-checks.json).
- **Dernier démarrage local vérifié le10novembre à la demande utilisateur** : FR/EN200, proxy Spring/PostgreSQL et404structurée, accueil/inscription Chromium réussis ; [preuve historique](evidence/P21-local-startup.json). À la reprise suivante, HTTP3000 refuse la connexion et le moteur Docker Linux est indisponible ; aucun processus démarré ou arrêté pour le correctif du registre. `.env.local` et fichier Next utilisateur préservés. Ce succès historique ne prouve pas leur disponibilité courante ni une recette distante.
- **Deux refus historiques P12 et deux refus distincts P15 restent ouverts, causes inconnues.** Les succès ultérieurs ne prouvent pas un correctif. Toute récidive impose arrêt du parcours et diagnostic avant nettoyage ; garde avant livraison commerciale maintenue pourP19. [P12](evidence/P12-access-follow-up.md), [P15](evidence/P15-access-follow-up.md).
- Deux erreurs de synchronisation de recette P19 sont conservées ; le premier timeout UNKNOWN de remboursement reste non attribué. Dernier6/6 sans bail actif, attente10s inchangée : la branche prolongée n’est pas exécutée. Ces limites restent dans le verdict avant livraison commerciale.
- Fiche d’offre de préparation seulement, sans offre backend/prix réel. Revue humaine FR/EN, vidéos, format vendu, langues de lancement, fiscalité/accès/support/légal/conservation restent à décider avant activation concernée. Aucun remplacement silencieux d’une promesse vidéo. Les demandes WAITING_POLICY sont conservées.
- Windows natif et versions applicatives verrouillées maintenus, aucune dépendance applicative ajoutée P20/P21. CI main `7572fcf` verte ; échecs historiques conservés, [procédure](CI.md). [Manifeste actif](evidence/P21-release-manifest-43764310209.json), source `7572fcf`, schéma20..20 ; ancien manifeste `7d9794c` conservé. Classes de l’API locale, environnement privé et fichier Next utilisateur préservés.

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
| P21 | Validé en recette | Cible privée/TEST, restauration PG/S3/app/finances, redémarrage et même déploiement, moniteur arrêt/reprise,24 autres conteneurs préservés ; [preuves et limites](evidence/P21.md) |
| P22 | À faire | Déploiement de production |
| P23 | À faire | Exploitation après lancement |

États permis : à faire, en cours, bloqué, implémenté non vérifié, validé localement, validé en recette, publié et observé. Employer seulement le niveau démontré. Un fournisseur indisponible n’empêche pas les tests locaux mais reste un blocage pour le résultat externe correspondant.

## Dernier lot

**AUD-01 validé localement** : publication et découverte séparées, recettes hors des listes ordinaires sans retrait d’accès ; navigation proportionnée et état de préparation FR/EN. Un cas limite de catalogue EN avec contenus seulement FR a été corrigé et vérifié dans Chromium sur ordinateur/mobile. Contrat généré, lint, types et build passent ; fichier Next utilisateur préservé. [Preuves, échecs conservés et limites](evidence/AUD-01.md). Aucun push, déploiement, import partagé ou parcours financier rejoué. Prochaine action : AUD-02, cohérence du dossier pédagogique P18 et de ses pièces FR/EN, avant revue et publication éditoriales. P22, commerce et LIVE restent fermés.

Garder ce suivi court ; détails dans docs/evidence/Pxx.md. Repartir des fichiers et preuves réels lors d’une reprise.
