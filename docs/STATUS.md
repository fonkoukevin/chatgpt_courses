# État réel du projet

Dernière mise à jour : **9 novembre 2026**. **P16 validé localement**, après P04–P15 dans l’ordre. Le mandat P15→P19 continue avec P17. Aucun ancien prototype repris, mode LIVE ou déploiement.

## Situation courante

- **P16 validé localement** : noms de langue, saisies conservées, contexte pédagogique exact, slugs réservés/redirections, attestations historiques et SEO configuré. [Résultat et limites](evidence/P16.md), [inventaire FR/EN](I18N.md).
- Java ciblé **41**, puis **22** après correction du renderer ; client **119**, Chromium bilingue **7/7**, SEO **4/4 et41 contrôles HTTP**, builds/types/lint/contrat réussis. **20 captures finales examinées**, dont vraies vues320 et trois découpes de lecture. Les passages ciblés ne sont pas additionnés ; dernier global Java :234 en P15. [API](evidence/P16-api-checks.json), [web](evidence/P16-web-final-checks.json), [bilingue](evidence/P16-browser-checks.json), [SEO](evidence/P16-seo-checks.json).
- Schéma **V001–V018** : migration sans seed, lignes des78 tables antérieures préservées, aucun volume supprimé. Réservations et historique de slugs ajoutés sans réécrire les migrations. [Migration](evidence/P16-upgrade.json), [préservation](evidence/P16-upgrade-preservation.json).
- Applications et listener TEST temporairement arrêtés par contrôle de propriété jusqu’à la fin du batch ; PostgreSQL/Mailpit et volumes conservés. Configuration privée inchangée et fichier Next utilisateur sauvegardé pour restauration. [Contrôle](evidence/P16-private-preservation.json), [audit privé](evidence/P16-private-audit.json).
- Windows natif et versions verrouillées conservés, aucune dépendance ajoutée. Git main local, code P16 `153726e` ; aucun push, remboursement Stripe externe, mode LIVE, déploiement ou CI GitHub exécuté. Les justificatifs commerciaux absents ne sont pas fabriqués.
- P12 reste validé localement avec vrai Checkout TEST. **Deux refus historiques après READY et deux refus distincts observés en tests P15 restent de cause inconnue** ; les passages ultérieurs réussis ne démontrent aucun correctif de ces causes. Garde P17/P19 avant livraison du parcours commercial : [P12](evidence/P12-access-follow-up.md), [P15](evidence/P15-access-follow-up.md). La limite antérieure P09 reste dans sa preuve.
- Conservation/traitements irréversibles, documents commerciaux, conditions/prix/fiscalité/durée et horaires/délais d’aide restent à valider avant activation concernée ou vente. Demandes WAITING_POLICY persistées, aucun effacement automatique.
- **P17 en cours** : qualité transversale, mesures et gardes d’accès historiques conservées avant livraison. P18 préparera les vrais contenus, P19 consolidera recette et CI. [Suivi P17](evidence/P17.md).

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
| P17 | En cours | Audit, mesures PostgreSQL/navigateur et robustesse ; [suivi](evidence/P17.md) |
| P18 | À faire | Contenus et offre prête |
| P19 | À faire | Recette et CI complète |
| P20 | À faire | Infrastructure de production |
| P21 | À faire | Déploiement de recette |
| P22 | À faire | Déploiement de production |
| P23 | À faire | Exploitation après lancement |

États permis : à faire, en cours, bloqué, implémenté non vérifié, validé localement, validé en recette, publié et observé. Employer seulement le niveau démontré. Un fournisseur indisponible n’empêche pas les tests locaux mais reste un blocage pour le résultat externe correspondant.

## Dernier lot

P16 clôture le bilingue et le SEO sur des recettes locales réelles. Les langues commerciales restent indécises et l’indexation vide par défaut. Les refus historiques P12/P15 restent ouverts. Prochaine instruction : `prompts/P17_QUALITE_TRANSVERSALE.txt`.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
