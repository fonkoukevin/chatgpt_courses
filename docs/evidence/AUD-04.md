# AUD-04 — fiche de formation, offre exacte et accès

Lot du 22 novembre 2026 sur `audit/aud-04-course`, après AUD-03. **Validé localement.** Aucun push, déploiement, import partagé, approbation éditoriale réelle ou paiement externe.

## Résultat

La fiche donne priorité au résultat attendu et à un aperçu réellement FREE de son programme publié. Son lien conserve les versions du parcours et de l’activité, ainsi que le retour au catalogue localisé. Public et prérequis, étapes du programme, modalités de vérification, outils, langues et questions viennent des métadonnées publiées. Les versions et la date de revue restent consultables dans un détail secondaire. Auteur, format et durée absents restent indiqués comme tels ; aucun contenu protégé ou corrigé ne sert d’aperçu.

La revue visuelle intermédiaire a constaté six doublons de titre/résumé/statut entre modules et activités et un bouton d’essai repoussé sous le premier écran. Le bouton unique rejoint le héros, l’aperçu conserve un lien secondaire et une fusion de présentation strictement limitée à un module publié avec une unique activité publiée identique retire ces doublons. L’activité fournit son vrai statut d’accès, son lien et sa durée ; l’arbre complet reste dans les détails de version. Les autres compositions ne sont pas aplaties. L’introduction est un seul élément de grille afin que plusieurs offres ne créent pas de grands vides entre ses sections.

Le raccord commercial suit `parcours + version + langue → liste sélectionnée → détail de la même révision → consentement → commande et snapshot existants`. Le filtre public apparié `resourceId`/`versionId` exige une inclusion exacte et la langue réellement vendue. Une copie anglaise seule ne suffit pas. La politique d’actualisation ne remplace pas la version demandée. Les règles de sélection AUD-01 restent applicables aux offres et à leurs inclusions ; une nouvelle révision n’hérite pas de l’approbation précédente.

La fiche présente au plus trois offres, avec un choix explicite et un lien vers leur liste complète filtrée et paginée. Montant, devise, inclusions, accès, actualisations, support, fiscalité et conditions sont lus dans les DTO Spring. Le détail doit conserver l’identité, la révision et l’état de la liste et contenir la version publiée dans la langue demandée. Une panne, une page incohérente ou une course entre révisions produit une erreur récupérable, jamais une fausse absence d’offre. Le détail de l’offre reste le lieu du consentement ; la fiche ne crée aucune commande.

Le contrôle d’accès porte désormais sur le COURSE exact via la lecture membre Spring. Le premier chapitre FREE et une inscription ne prouvent plus le droit sur un parcours PROTECTED. Une reprise utilise uniquement l’activité de la même inscription/cours/version/langue ; à défaut, elle ouvre le programme inscrit. Une lecture en erreur ne permet pas de démarrage. Les protections de contexte de compte, CSRF et mutation incertaine sont conservées.

## États et liens

| Contexte | Comportement |
| --- | --- |
| Visiteur, aperçu publié FREE | Essai sans compte vers l’activité et les versions réellement incluses. |
| Visiteur, parcours protégé | Connexion pour retrouver ses accès ; document protégé absent de la projection publique. |
| Aucune offre sélectionnée correspondante | Absence explicite pour cette version et cette langue ; aucun prix ou achat inventé. |
| Une offre correspondante | Prix/conditions serveur et lien vers son détail exact. |
| Plusieurs offres | Choix explicite, trois aperçus au plus, liste complète et pagination qui conservent les deux identifiants. |
| Offre INACTIVE ou incomplète | Indisponibilité distincte de celle du paiement ; détail consultable, parcours de commande existant refusant les états non prêts. |
| Offre révisée | Retirée de cette sélection jusqu’à nouvelle approbation ; les anciens snapshots gardent prix et conditions acceptées. |
| Compte sans droit sur le parcours | Refus d’accès et lien vers les accès du compte, même si son extrait FREE est lisible. |
| Droit actif et inscription correspondante | Reprise prioritaire dans cette version ; la vente peut être suspendue indépendamment. |
| Droit expiré ou indisponible | Spring refuse la lecture protégée ; la fiche indique l’indisponibilité sans inventer une cause depuis un403. |
| Commande PREPARED, paiement non commencé | Récapitulatif propriétaire du snapshot ; aucun droit attribué. Le paramètre de retour `checkout=success` n’accorde rien. |
| Session expirée, compte changé, panne ou mutation incertaine | États et reprise volontaire existants ; aucune relance automatique de commande ou d’inscription. |

Les versions achetées restent celles des récapitulatifs, origines d’accès et inscriptions existants. Ce lot ne réécrit ni le service de commande, ni les conditions acceptées, ni l’idempotence, ni l’attribution des droits, ni les états de paiement/activation.

## Captures et vérifications

La [synthèse avec empreintes et reçus](AUD-04-checks.json) distingue les exécutions, les deux assertions de recette corrigées et les observations finales.

| Contrôle | Résultat observé |
| --- | --- |
| API PostgreSQL ciblée | **29/29** : sélection publique11, offres8, HTTP commerce10. Nouveaux cas : paire de filtres, inclusions/versions/langues exactes, provenance, pagination, suspension, nouvelle révision et anciennes conditions/snapshots conservés. |
| Client | **131/131**, dont six nouveaux cas de concordance, filtres et destinations sûres ; compilation TypeScript comprise. Exécution déléguée documentée dans la synthèse. |
| Serveur et rendu | **13/13 AUD04** : véritables lecteurs et composants, erreurs distinctes du vide, prix/conditions serveur, choix/pagination/langues, fusion strictement limitée et arbre/versions conservés. Inclus dans les scripts ci-dessous. |
| Scripts CI locaux | **172/172**, sans cas ignoré ; [résumé expurgé](AUD-04-script-checks.json). Aucun lancement de CI distante. |
| Recette finale AUD04 | **4/4** : comparaison FR/EN, clavier, offre/consentement/commande, choix et modifications, reprise et expiration naturelle d’un droit. Deux commandes PREPARED locales, aucun Checkout ni droit attribué à partir de leur paiement non commencé. [Session finale](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/session.json), [états et liens observés](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/aud04-course-checks.json). |
| Régression catalogue finale P06 | **6/6** après les finitions : programme épinglé, métadonnées/langues/retrait, public protégé sans corps et panne/reprise. [Session](P06-browser/2026-11-22T06-49-05-000Z-a7458978-351f-49e7-bd57-553bc000902f/session.json). |
| Régression finale AUD01 | **4/4** après les finitions : sélection, recettes hors vitrine et accès directs préservés. [Session](AUD01-browser/2026-11-22T06-49-04-954Z-1879c236-ce59-4f03-a157-6c7ddf0b8202/session.json). |
| Build, contrat et typage | JAR empaqueté, OpenAPI généré/vérifié, build web final et son contrôle TypeScript, lint final, typage applicatif explicite et typage navigateur passent. JAR `2cbb814c…`, build `GCKh9-DsPpkudW7iHVCtD`. Aucune dépendance ajoutée. |
| Contrastes | **21 paires opaques réussies**, mêmes tokens ; [mesures](AUD-04-contrast.json). Ce calcul ne certifie pas l’accessibilité globale. |
| Préservation | **83 tables partagées hors sessions identiques**, avant/après en transaction PostgreSQL READ ONLY ; historiques P18/P19/AUD02/AUD03 et fichier Next utilisateur inchangés. Zéro migration nouvelle ou partagée. |

Les quatre scénarios finaux utilisent les mêmes sources P18 et les vraies API dans des services possédés éphémères. Prix et conditions sont explicitement fictifs. Les sessions de tous les essais, y compris ceux arrêtés sur assertion, confirment le nettoyage ; Stripe et les workers de paiement/remboursement/notification sont désactivés au début et à la fin. Aucun retry automatique, flaky ou cas ignoré dans les exécutions finales retenues. Les premières régressions également réussies restent conservées dans la synthèse ; elles ne sont pas comptées comme de nouveaux cas distincts.

| Vue | Avant | Après final |
| --- | --- | --- |
| Fiche FR ordinateur | [1440px](AUD04-browser/2026-11-22T06-35-44-959Z-3359c2d1-1970-4ac4-bb37-6f328291d612/before-course-fr-1440.png) | [1440px](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-course-fr-1440.png) |
| Fiche FR mobile complète | [390px](AUD04-browser/2026-11-22T06-35-44-959Z-3359c2d1-1970-4ac4-bb37-6f328291d612/before-course-fr-390-full.png) | [390px](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-course-fr-390-full.png) |
| Fiche EN ordinateur | [1440px](AUD04-browser/2026-11-22T06-35-44-959Z-3359c2d1-1970-4ac4-bb37-6f328291d612/before-course-en-1440.png) | [1440px](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-course-en-1440.png) |

Les mêmes dossiers contiennent les autres variantes. Après final : [trois offres FR](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-multiple-choice-fr-1440-full.png), [conditions EN](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-single-offer-en-390.png), [récapitulatif local FR](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-local-order-fr-390.png), [retour success sans paiement](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-unpaid-return-fr-390.png), [nouveau prix et snapshots conservés](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-reapproved-new-price-original-snapshots-fr-390.png), [accès expiré](AUD04-browser/2026-11-22T06-49-25-227Z-fd43bc19-b56d-45ba-86ae-eb9020f9b062/after-expired-test-origin-fr-1440.png).

**34 PNG avant/après finaux réellement examinés : huit avant et26 après**, plus neuf intermédiaires conservés et relus. Le bouton d’essai est visible dans les quatre premiers cadrages finaux FR/EN à1440/390px ; les six étapes ne répètent plus leur activité identique. Aucun chevauchement, texte coupé ou débordement horizontal constaté ; trois offres n’étirent plus les sections d’introduction. Deux captures mobiles de choix multiples montrent encore la lecture transitoire du compte, puis le refus stabilisé apparaît en desktop. L’étape de reprise active est vérifiée par interaction et lecture API, sans PNG dédiée ; aucune preuve visuelle de cet état n’est revendiquée.

La baseline utilise l’ancien build `7p1OvLVUm0iC24HO4CIsK` et le JAR AUD-01, avec huit captures FR/EN en1440/390px effectivement examinées. Son cadrage desktop comporte un état transitoire de vérification d’identité ; les vues complètes montrent ensuite le lien de connexion anonyme.

Commandes exécutées : `node scripts/api-contract.mjs generate`, `check` et `test` ; Maven Wrapper avec `-Dtest=PublicSelectionIntegrationTest,OfferServiceIntegrationTest,CommerceHttpIntegrationTest test`, puis `-DskipTests package` ; `node scripts/web.mjs build`, lint/types par le runner local existant ; `tsc --project tsconfig.browser.json --noEmit` ; `node scripts/verify-contrast.mjs AUD-04` ; `node scripts/verify-browser.mjs AUD04`, P06 et AUD01. Les lanceurs privés utilisent `isolatedEnvironment(environment({loadLocal:false}))` et gardent les journaux bruts hors des preuves publiques. L’option `-DskipTests` du packaging ne remplace pas les29 tests préalablement exécutés. La commande publique de recette `scripts/courses.cmd run verify:course-offers` est ajoutée au README et à package.json.

Premier arrêt de recette après conservé : [session](AUD04-browser/2026-11-22T06-41-05-772Z-708febe9-c0a4-4272-8215-34c96daca2c2/session.json), un échec d’assertion et trois tests non exécutés. Le helper attendu omettait le `returnTo` catalogue présent dans le lien réel. L’assertion compare maintenant chemin, identifiants/version et retour localisé. Aucun défaut d’application ou parcours financier n’a été contourné ; aucun ordre n’avait été créé dans cette exécution.

Deuxième arrêt conservé : [session](AUD04-browser/2026-11-22T06-44-24-872Z-ae6aaafc-8c08-41b4-bf19-3ee1d77a159f/session.json), une comparaison réussie, un échec d’assertion et deux tests non exécutés. L’assertion héritée de P11 attendait un bouton Checkout désactivé ; le composant P12 courant affiche un message de paiement indisponible et aucun bouton. La commande FR, son snapshot et son rejeu avaient réussi ; aucune Checkout n’avait été créée. Le test suit maintenant cet état réel. Les captures intermédiaires et les deux échecs sont conservés, sans retry automatique ni remplacement d’un refus métier.

## Limites maintenues

La recette utilise Chromium local et de vraies API PostgreSQL/S3 éphémères avec cours FR/EN de P18 et offres fictives. Les publications/sélections et les origines MANUAL_TEST restent des fixtures isolées, sans revue humaine. Les commandes éventuellement préparées sont locales ; Stripe, Checkout et les workers de paiement/remboursement sont désactivés. Aucun paiement externe, remboursement ou observation de production n’est déduit de cette présentation.

Auteur, format vendu, durée mesurée, revue humaine, langues et conditions commerciales réelles restent à valider avant l’activation concernée. Dernier staging documenté : source P21 `7572fcf`, schéma20 ; aucun déploiement ou contrôle distant de ce lot. Les brouillons et données partagés sont conservés ; aucune migration AUD04 n’est ajoutée.

**Les refus historiques P12 et P15 restent ouverts séparément**, ainsi que les limites P19. Cette correction de présentation et d’autorité d’accès ne les clôture pas. Commerce, LIVE et P22 restent fermés. Suite prévue : AUD-05, atelier guidé et vérification pédagogique.
