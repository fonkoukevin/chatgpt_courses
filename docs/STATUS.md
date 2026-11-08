# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P04–P12 validés localement**, dans l’ordre ; intégration Stripe TEST externe observée pour P12. Aucun ancien prototype repris, aucun mode LIVE ni déploiement. P13 n’est pas lancé.

## Situation courante

- **P12 clos comme implémentation validée localement**, avec vraie recette Checkout hébergé TEST : réception durable avant worker, reprise PAID/READY, accès privé/public expurgé et deux rejeux fournisseur sans duplication. [Preuves et limites](evidence/P12.md).
- Git local : branche `main`, socle P12 **`12fc4a9`**, outillage/diagnostic **`50eaba8`**, Windows/synchronisation **`20740db`**, recette externe et accès frais **`4c4724b`** ; aucun remote/push. Fichiers et changements existants conservés, dont le fichier Next généré par le développement de l’utilisateur.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1. Stripe CLI portable **1.55.8**, archive/manifeste officiels vérifiés par SHA-256.
- Schéma : **V001–V014**, aucune migration supplémentaire dans la clôture. L’upgrade P12 préserve45tables existantes ; avant/après recette finale, **49tables partagées identiques hors sessions**. Fixtures uniquement dans tmpfs étiqueté ; volumes conservés. [Upgrade](evidence/P12-upgrade-preservation.json), [contrôle final](evidence/P12-external-shared-preservation.json).
- Vérifications P12 : global Java **182**, puis ciblés **23**, **16** et dernier **5/5** (sans cumul), dont16GET parallèles après droit fraîchement créé ; client84/builds/lint/contrat précédents réussis. Dernier TypeScript navigateur réussi. Suite contrôlée finale **8/8 en152,320s**, puis vraie recette fournisseur **1/1 en100,933s**, sorties0, aucun retry/flaky. **27+3 captures examinées**, nettoyages confirmés. [Index local](evidence/P12-browser-checks.json), [index fournisseur](evidence/P12-stripe-external-checks.json).
- **Incident historique ouvert** : deux refus après READY non reproduits, cause inconnue, aucun correctif revendiqué. La clôture locale ne ferme pas l’incident ; assertions conservées et critère d’arrêt en P17/P19 avant livraison. [Suivi détaillé](evidence/P12-access-follow-up.md).
- Développement utilisateur resté démarré : FR/EN et sonde Spring via proxy200, webhook non signé400. Listener de développement temporairement arrêté pour isoler les événements, puis **rétabli en arrière-plan, Ready TEST** vers `http://localhost:3000/api/v1/webhooks/stripe`. Secret/fichier privés conservés. Le lanceur externe refuse désormais les autres écoutes du dépôt avant réseau. [Contrôle final](evidence/P12-final-development-check.json), [commandes](../README.md#configuration-privée-et-stripe-cli--windows-natif).
- Prochain lot : **`prompts/P13_REMBOURSEMENTS_DROITS.txt`**, non lancé. Prix, fiscalité, durée, conditions, langues, support et médias commerciaux restent à renseigner ; le montant de recette100centimes EUR n’est pas un tarif commercial. Commerce partagé désactivé. Aucun run GitHub, SMTP Internet, moyen différé externe ou déploiement observé.
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
| P12 | Validé localement | Checkout fournisseur TEST1/1, local8/8, accès5/5,30captures examinées ; incident historique suivi P17/P19, aucun LIVE ; [preuves](evidence/P12.md) |
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

P12 relie commande, opération Checkout, événement signé, paiement rapproché, origines d’accès et notification. Retour seul, paiement différé, activation retardée et incident email restent distincts. La recette contrôlée et le vrai parcours Stripe TEST ont des preuves séparées ; aucune validation de production n’en découle. La prochaine phase est P13 ; l’incident historique conserve son suivi avant livraison.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
