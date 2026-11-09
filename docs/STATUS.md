# État réel du projet

Dernière mise à jour : **9 novembre2026**. **P18 validé localement en environnement isolé**, après P04–P17 dans l’ordre. Le mandat P15→P19 continue avec P19. Aucun mode LIVE, push ou déploiement.

## Situation courante

- **P18** : douze leçons FR/EN,18 fichiers Markdown, import CMS durable, corrigés protégés et vrais exports locaux. [Sources](../content/course-client-proposal/README.md), [résultats et limites](evidence/P18.md).
- Sources30/contrôles223, Java ciblé48/48 puis import11/11 après dernier guard, client124, contrat/lint/types/builds réussis. Chromium4/4,18 téléchargements+4 exports réels et18 PNG examinés ; leçons/méthodes en vues partielles explicitement. [API](evidence/P18-api-checks.json), [web](evidence/P18-web-checks.json), [navigateur](evidence/P18-browser-checks.json). Aucun global Java P18 revendiqué ; dernier global234 enP15.
- Schéma **V001–V019**, Flyway seul. V018→V019 réel, colonnes préexistantes des80 tables et données conservées ; aucun volume supprimé. [Migration](evidence/P18-upgrade.json), [préservation](evidence/P18-upgrade-preservation.json).
- **Import des brouillons dans la base partagée en attente du choix utilisateur d’un acteur local** : aucun compte n’a les permissions éditoriales ; aucun rôle/compte créé sans réponse. La question asynchrone reste ouverte. Les recettes PostgreSQL/S3/navigateur isolées sont complètes ; aucune publication partagée ou revue humaine inventée.
- Configuration privée inchangée et fichier Next utilisateur sauvegardé. Applications/listener TEST initiaux toujours arrêtés par garde de propriété jusqu’à la fin du batch ; PG/Mailpit/S3 partagés sains et volumes conservés. [Contrôle](evidence/P18-private-preservation.json), [audit](evidence/P18-private-audit.json).
- **Deux refus historiques P12 et deux refus distincts P15 restent ouverts, causes inconnues.** Les succès ultérieurs ne prouvent pas un correctif. Toute récidive impose arrêt du parcours et diagnostic avant nettoyage ; garde avant livraison commerciale maintenue pourP19. [P12](evidence/P12-access-follow-up.md), [P15](evidence/P15-access-follow-up.md).
- Fiche d’offre de préparation seulement, sans offre backend/prix réel. Revue humaine FR/EN, vidéos, format vendu, langues de lancement, fiscalité/accès/support/légal/conservation restent à décider avant activation concernée. Aucun remplacement silencieux d’une promesse vidéo. Les demandes WAITING_POLICY sont conservées.
- Windows natif et versions verrouillées maintenus, aucune dépendance ajoutée P15–P18. Git main local, code P18 b9a61c3. Aucun run GitHub ou remboursement fournisseur externe exécuté enP18. **P19 en cours** : consolider les preuves, le global PostgreSQL, les parcours utiles et la CI sans masquer les limites.

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
| P18 | Validé localement | Rédaction et intégration isolée4/4,18 fichiers/4 exports/18 captures ; import partagé en attente d’acteur, vente bloquée ; [preuve](evidence/P18.md) |
| P19 | En cours | Recette consolidée, matrice et CI ; décisions et dépendances externes explicites |
| P20 | À faire | Infrastructure de production |
| P21 | À faire | Déploiement de recette |
| P22 | À faire | Déploiement de production |
| P23 | À faire | Exploitation après lancement |

États permis : à faire, en cours, bloqué, implémenté non vérifié, validé localement, validé en recette, publié et observé. Employer seulement le niveau démontré. Un fournisseur indisponible n’empêche pas les tests locaux mais reste un blocage pour le résultat externe correspondant.

## Dernier lot

P18 clôture la rédaction et l’intégration locale isolée. Le choix d’acteur pour le chargement partagé reste en attente ; aucune mutation dépendante n’est faite sans réponse. Prochain prompt exécuté : prompts/P19_RECETTE_CI.txt. P20/P21 restent hors du mandat courant.

Garder ce suivi court ; détails dans docs/evidence/Pxx.md. Repartir des fichiers et preuves réels lors d’une reprise.
