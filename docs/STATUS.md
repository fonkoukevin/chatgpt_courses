# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P12 en cours**, après validation locale de P11. Autorisation utilisateur : enchaîner **P04 à P12**, dans l’ordre, en passant au lot suivant seulement après validation du précédent. Aucun ancien prototype repris ni déploiement externe.

## Situation courante

- **P04–P11 validés localement**, dans l’ordre. Dernier lot clos : P11, global Java 155 puis ciblé HTTP 10, client 77, Chromium 8/8 et vingt captures examinées. [Preuves P11](evidence/P11.md) et tableau des phases ci-dessous.
- Git local : branche `main`, socle P12 **`12fc4a9`**, outillage privé et diagnostic croisé **`50eaba8`**, correctif Windows/synchronisation sûre **`20740db`** (lot encore ouvert), P11 **`ca0d28d`**, P10 **`6eb1093`**, P09 **`8101f2a`**, P08 **`fd0e038`**, P07 **`3494bd1`**, P06 **`458cf7c`**, P05 **`5dab875`**, P04 **`ba63356`**, P03 **`6a53c19`** ; aucun remote/push. Les 49 fichiers initiaux restent présents, contrôle P12 répété.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1. Stripe CLI portable **1.55.8**, archive/manifeste officiels vérifiés par SHA-256.
- Schéma local : **V001–V014** ; upgrade P12 depuis V012 exécuté sans Spring/seed. Empreintes des **45 tables existantes identiques**, cinq nouvelles tables de paiement vides ; aucune donnée fictive ni attribution ajoutée dans la base partagée. [Preuve de conservation](evidence/P12-upgrade-preservation.json).
- Démarrage : `.\scripts\courses.cmd run dev` applique Flyway ; seed fictif en brouillon uniquement sur commande explicite. Correctif `Path/PATH` Windows : huit appels Docker/Compose réussis puis démarrage réel, pages FR/EN et sonde Spring via proxy HTTP200, webhook non signé HTTP400. [Commandes](../README.md). Seuls les processus de vérification ont été arrêtés ; PostgreSQL/Mailpit/S3 partagés sains, volumes conservés.
- P12 : Checkout TEST, inbox et rapprochement durables, droits et notification atomiques, E08 FR/EN et accès privés implémentés. Global Java **182**, puis ciblés **23** et **16** réussis sans cumul ; client **84**, OpenAPI/reproductibilité, lint/types, builds et chaîne HTTP réussis.
- Diagnostic croisé P12 : ciblé **6/6 en 232,084 s**, 72 GET membre en concurrence avec les pages ; puis suite complète **8/8 en 128,288 s**, sortie 0, 24 GET croisés, nettoyage confirmé. Deux activités privées finales réexaminées ; 27 captures de la revue antérieure du même rendu conservées. **Deux refus intermédiaires après READY restent non reproduits, de cause inconnue** ; aucun contrôle désactivé. **P12 reste en cours.** [Preuve détaillée](evidence/P12.md).
- Stripe TEST : clé conservée, compte **vérifié réellement auprès de Stripe**. Spring charge le secret renseigné et **`STRIPE_ENABLED=true`**. La valeur saisie diffère du secret CLI/cache, trois lectures concordantes : arrêt correct sur `LISTENER_SECRET_MISMATCH`. **Synchronisation explicite encore attendue** via `run stripe:sync-secret` ou copie du fichier privé ; sauvegarde et préservation testées sur fixtures uniquement. Aucun secret affiché, aucun Ready ou Checkout fournisseur validé. Webhook : `http://localhost:3000/api/v1/webhooks/stripe`. [Guide](../README.md#configuration-privée-et-stripe-cli--windows-natif).
- Prochaine action : reprendre **`prompts/P12_STRIPE_ATTRIBUTION.txt`**, exécuter `stripe:sync-secret`, relancer `dev` puis `stripe:listen` et effectuer la recette TEST ; garder le diagnostic des refus distinct. Aucun P13 lancé. Prix, fiscalité, durée, conditions, langues, support et médias commerciaux restent ouverts ; commerce partagé désactivé. Aucun run GitHub, SMTP externe ou déploiement observé.
- Limite antérieure P09 : un acquittement après PATCH 200 n’a pas été reproduit sur seize répétitions puis la recette finale ; cause inconnue, conservée pour P17/P19. [Détails](evidence/P09.md).

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
| P12 | En cours | Docker/dev réparés ; binding Stripe activé vérifié, secret différent de la CLI à synchroniser. Diagnostic croisé 6/6 puis 8/8, refus inexpliqués ; recette Checkout attendue ; [preuves](evidence/P12.md) |
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

P12 relie commande, opération Checkout, événement signé, paiement rapproché, origines d’accès et notification. La page de retour ne confirme rien ; délai de paiement, activation retardée et incident email restent distincts. Le transport fournisseur des tests est contrôlé, jamais présenté comme un achat Stripe réel. Les limites ci-dessus empêchent la clôture du lot et le passage au suivant.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
