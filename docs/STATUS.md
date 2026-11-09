# État réel du projet

Dernière mise à jour : **9 novembre2026**. **P17 validé localement**, après P04–P16 dans l’ordre. Le mandat P15→P19 continue avec P18. Aucun mode LIVE, push ou déploiement.

## Situation courante

- **P17** : cadence identité testée, en-têtes de protection, couverture SQL groupée sans cache privé, reflow texte200% et espacement atelier corrigés. [Résultats et limites](evidence/P17.md), [budgets](QUALITY.md).
- Java ciblé37/37 puis12/12 et cas répété1/1, client119, lint/types/builds/contrat réussis. Chromium complet9/9 puis ateliers ciblés2/2 après correctif visuel, nettoyages confirmés.32+12 captures examinées, plus4 du diagnostic de header. Aucun global Java P17 revendiqué ; dernier global234 enP15.
- Schéma **V001–V018**, sans nouvelle migration P17. V017→V018 et données antérieures préservées enP16 ; aucun seed structurel ou volume supprimé. [Migration](evidence/P16-upgrade.json), [préservation](evidence/P16-upgrade-preservation.json).
- Applications et listener TEST initiaux arrêtés par garde de propriété jusqu’à la fin du batch ; PG/Mailpit et volumes conservés. Configuration privée inchangée, stockage déjà configuré, commerce désactivé ; fichier Next utilisateur sauvegardé pour restauration. [Contrôle](evidence/P17-private-preservation.json), [audit](evidence/P17-private-audit.json).
- Windows natif et versions verrouillées conservés, aucune dépendance ajoutée P15–P17. Git main local ; aucun run GitHub, remboursement fournisseur externe ou production observé.
- **Deux refus historiques P12 et deux refus distincts P15 restent ouverts, causes inconnues.** Les nouvelles réussites ne prouvent pas un correctif. Toute récidive impose arrêt du parcours et diagnostic avant nettoyage ; garde avant livraison commerciale maintenue pourP19. [P12](evidence/P12-access-follow-up.md), [P15](evidence/P15-access-follow-up.md).
- Conservation/traitements irréversibles, documents commerciaux, prix/devise/fiscalité/accès/support/légal restent à décider avant activation concernée. Vidéos du cours et revue humaine non fournies ; aucune vente ou équivalence relue par un humain inventée. Demandes WAITING_POLICY conservées.
- **P18 en cours** : rédaction et intégration réelle en brouillon du premier parcours FR/EN, ressources éditables et préparation d’offre honnête. P19 consolidera la recette et la CI.

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
| P18 | En cours | Parcours complet FR/EN, ressources et import en brouillon ; vente bloquée avant décisions et revue |
| P19 | À faire | Recette et CI complète |
| P20 | À faire | Infrastructure de production |
| P21 | À faire | Déploiement de recette |
| P22 | À faire | Déploiement de production |
| P23 | À faire | Exploitation après lancement |

États permis : à faire, en cours, bloqué, implémenté non vérifié, validé localement, validé en recette, publié et observé. Employer seulement le niveau démontré. Un fournisseur indisponible n’empêche pas les tests locaux mais reste un blocage pour le résultat externe correspondant.

## Dernier lot

P17 est clos sur les défauts identifiés et risques documentés, sans essai supplémentaire redondant. Prochain prompt exécuté : prompts/P18_CONTENUS_OFFRES_PRETS.txt, puis P19 dans le mandat courant. Les refus historiques et décisions commerciales restent explicitement ouverts.

Garder ce suivi court ; détails dans docs/evidence/Pxx.md. Repartir des fichiers et preuves réels lors d’une reprise.
