# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P11 validé localement**. Autorisation utilisateur : enchaîner **P04 à P12**, dans l’ordre, en passant au lot suivant seulement après validation du précédent. Aucun ancien prototype repris ni déploiement externe.

## Situation courante

- Dernière phase validée : **P11**. Global **155 tests Java**, puis ciblé final **10 HTTP** après recontrôle de permission, **77 tests client**, builds et chaîne HTTP réussis. Chromium complet **8/8 en 65,266 s**, vingt captures FR/EN examinées ; tous les processus et PostgreSQL isolé arrêtés. [Preuves et limites](evidence/P11.md). P10 : stockage/vidéo/outbox [validés localement](evidence/P10.md).
- Git local : branche `main`, code P11 **`ca0d28d`**, P10 **`6eb1093`**, P09 **`8101f2a`**, P08 **`fd0e038`**, P07 **`3494bd1`**, P06 **`458cf7c`**, P05 **`5dab875`**, P04 **`ba63356`**, P03 **`6a53c19`** ; aucun remote/push. Les 49 fichiers initiaux restent présents, contrôle P11 répété.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1.
- Schéma local : **V001–V012** ; upgrade P11 depuis V011 exécuté sans Spring/seed. Empreintes des **36 tables existantes identiques**, neuf nouvelles tables commerce vides ; aucun compte/offre/droit de démonstration ajouté dans la base partagée. [DATA_MODEL.md](DATA_MODEL.md).
- Démarrage : `.\scripts\courses.cmd run dev` applique Flyway ; `run seed:local` charge explicitement un dossier fictif en brouillon. `run storage:setup` prépare le S3 local ; deux replays observés sans modifier l’environnement existant. [Commandes](../README.md). Applications de vérification arrêtées ; PostgreSQL/Mailpit/S3 sains, volumes et données conservés.
- Preuves P09 : **112 tests Java**, **58 tests du client**, OpenAPI validé et 17 fichiers générés identiques ; lint/types, builds web/API et chaîne HTTP réelle réussis. CI conservée, aucun run GitHub.
- Chromium P09 final sans traces temporaires : **8/8 en 59,944 s** ; T02 FR/EN en seconde session, grilles BR01/BR02, historique, corrigé, propriété, conflits/panne, frontières de compte et CMS. **39 captures examinées**, puis cinq finales ; viewports 1440/1024/768/390/320. Régression P08 **10/10**. Processus supervisés et PostgreSQL tmpfs arrêtés ; preuves précédentes conservées.
- Observation : un refus de confirmation intermédiaire après PATCH 200, texte conservé, n’a pas été reproduit sur 16 répétitions FR puis la recette finale. Cause non établie, aucune correction de cause revendiquée ; cas conservé pour P17/P19. Aucun contrôle désactivé. [Détails](evidence/P09.md).
- Suite : **`prompts/P12_STRIPE_ATTRIBUTION.txt`** automatiquement. L’utilisateur prévoit de renseigner les clés Stripe de test dans `.env.local` ; présence à revérifier sans afficher les valeurs. Prix, fiscalité, durée, conditions, langues, support et médias commerciaux restent ouverts ; commerce partagé désactivé. Aucun paiement, run GitHub, SMTP externe ou fournisseur vidéo de production observé.

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

Offres versionnées et commandes privées calculées par Spring ; consentement explicite, montants/langues/conditions et ressources figés. Idempotence et remplacement contrôlé d’une préparation sans paiement, droits par origine en lecture, chevauchements sans remise inventée. Prix/conditions absents bloquent la préparation ; Checkout reste désactivé avant P12. Aucun tarif réel ou compte commercial connu créé.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
