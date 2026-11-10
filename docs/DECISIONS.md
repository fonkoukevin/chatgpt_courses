# Décisions et paramètres

## Décisions reprises du projet

- Première application : ChatGPT Courses ; Claude Courses reste un autre produit.
- Apprentissage orienté tâche et livrable, avec activité ouverte, projet, contrôle et méthode personnelle.
- Trois espaces ; E01–E16 ; 54 fonctions classées, dont certaines sont différées ou conditionnelles.
- Stack Next.js/TypeScript/Tailwind/shadcn/Radix, Spring Boot/Security, PostgreSQL/JPA/Flyway, Stripe Checkout, objet S3, fournisseur vidéo, Docker/GitHub Actions.
- Architecture bilingue prévue dès le départ ; calendrier de publication et langue commerciale par défaut non figés.
- Paiement, accès, progression et attestations indépendants.
- Le budget initial de 100 à 500 € concerne les dépenses de démarrage envisagées, pas une promesse de coût total du développement ou une autorisation de dépenses automatiques.

## Choix d’implémentation proposés dans ce kit

Ces décisions rendent les prompts cohérents. Elles sont réversibles si une contrainte réelle du dépôt justifie une adaptation documentée.

- Monorepo `apps/web`, `apps/api`, `infra`, `docs`.
- Next App Router ; Java 21 et Maven Wrapper ; monolithe Spring modulaire.
- Une origine et `/api/v1` ; sessions Spring JDBC/PostgreSQL avec CSRF selon `API_CONTRACTS.md` ; aucune seconde identité NextAuth.
- npm par défaut si le dépôt est neuf et aucune préférence existante ; préserver un gestionnaire déjà cohérent. Un seul lockfile de référence.
- Développement local, recette et production isolés ; services locaux pour mails et fichiers ; prix et comptes fictifs hors production.
- Caddy et Docker Compose pour une première installation Linux dimensionnée ; pas de Kubernetes ni Redis sans besoin mesuré.
- Charte claire neutre avec bleu nuit discret, détaillée dans `DESIGN_SYSTEM.md`. Il s’agit d’une proposition issue des références, pas d’une validation visuelle déjà donnée par l’utilisateur.
- Français initial pour développer ; dictionnaires et modèles FR/EN dès les fondations. Activation d’une langue publique selon état réel du contenu.

## Décisions de travail P00 — 7 novembre 2026

L’inspection réelle constate un kit de 49 fichiers, sans application, manifeste, lockfile, script de démarrage ni dossier `.git`. Aucun prototype n’est présent ou adopté. `AGENTS.md` à la racine est la seule instruction locale trouvée ; aucune instruction supplémentaire n’a été trouvée dans les sous-dossiers ou les ancêtres inspectés.

- **Structure confirmée** : `apps/web`, `apps/api`, `infra`, `docs`, avec `scripts` et les références existantes. Les applications et services seront créés par P01, sans réinitialisation de ce dossier.
- **Mode local** : Node et Java natifs Windows, PowerShell 5.1, services Linux via Docker Desktop. `npm.cmd` contourne le seul problème de sélection du lanceur `npm.ps1`, sans modifier les politiques PowerShell. Maven Wrapper Windows à créer en P01 ; Maven global absent n’est pas un blocage. Les outils WSL ne sont pas mélangés à cette chaîne.
- **Dépendances** : npm workspaces avec un seul `package-lock.json` racine ; Java 21 et Maven Wrapper. Cibles exactes et preuves officielles dans `VERSIONS.md` : Node 24.22.2/npm 11.19.1, Next 16.4.5/React 19.3.1, Boot 4.1.2 et PostgreSQL 18.6. P00 ne prétend pas les avoir installées. Conserver Node 24 évite un changement de majeure sans besoin ; sélectionner les correctifs en P01 sans écraser l’installation utilisateur.
- **Lint** : TypeScript 6.0.3 avec ESLint 10.14.0, configuration plate explicite JS/TypeScript/Next/React Hooks dès P01. Les peers transitifs de `eslint-config-next` excluent ESLint 10 et le parseur exclut TS7 ; ESLint 9 est en fin de maintenance. Ne pas adopter la configuration groupée incompatible, ni forcer la résolution. Pins, sources et portée des contrôles dans `VERSIONS.md` ; aucune modification de technologie principale.
- **Invariants confirmés sans variante** : une origine, proxy `/api/v1` conservant le préfixe, Spring seul responsable de l’identité et du métier, sessions JDBC et CSRF, réponses privées hors cache partagé. Aucun NextAuth, JWT dans localStorage, H2 substitué aux tests PostgreSQL, Redis ou API IA payante ajouté.
- **Routes** : le registre de `SCREENS.md` fait autorité pour FR/EN. Identifiants métier indépendants des slugs ; langue par défaut et langues publiées configurables. Le français de développement ne tranche pas le calendrier commercial anglais.
- **Configuration** : `.env.example` racine sans secret et plan de raccordement dans `CONFIGURATION.md`. Services externes et vente désactivés dans cet exemple ; aucune configuration n’est encore consommée. Pour l’API native Windows, SMTP Mailpit devra être publié sur la boucle locale, contrairement à un API entièrement conteneurisé.
- **Historique** : aucun Git initialisé, commit créé, remote configuré ou contenu poussé pendant P00. L’inventaire SHA-256 initial est conservé dans `evidence/P00-initial-files.json` ; P01 pourra établir un historique local cohérent après inspection, sans publication automatique.

Aucune incompatibilité prouvée ne justifie de remplacer la stack. Les compatibilités sont documentaires ; installation, dépendances résolues, rendu et intégration locale seront vérifiés dans leurs lots. Aucun besoin d’accès externe ne bloque P00 ou les fondations locales.

## Décisions de réalisation P01 — 7 novembre 2026

- Fondations créées dans la structure prévue, sans reconstruction d’un prototype. Git local initialisé sur `main`, références P00 conservées dans le commit initial `c31c609` ; aucun remote ou push.
- Node 24.22.2/npm 11.19.1 et Temurin 21.0.13+9 sélectionnés dans `.tools`, sans changer les installations globales. Maven Wrapper 3.3.4/Maven 3.10.0 avec checksum de distribution.
- Lockfile npm racine unique et BOM Boot 4.1.2 vérifiés en exécution. Correctif transitif ciblé minimatch 11.0.1 après alerte de sécurité réelle ; couverture du lint et règles TS/Hooks/Next contrôlées, aucun downgrade vers une branche abandonnée ni désactivation. Détails et source dans `VERSIONS.md`.
- Compose : PostgreSQL 18.6, Mailpit 1.33.0, SeaweedFS 4.52 dans un profil optionnel, tags et digests contrôlés. Réseau bridge dédié et ports loopback après échec observé du réseau `internal`. Aucun choix de fournisseur S3 de production.
- Schéma initial limité aux tables officielles Spring Session JDBC, via Flyway ; schéma métier en P03. CSRF actif, pas de compte généré, pas d’identité frontend parallèle.
- Pages FR/EN de fondation non indexables, réservées à local/test. Proxy GET/HEAD réel, client de sonde manuscrit, aucun catalogue ou succès de paiement fictif. Tests HTTP et PostgreSQL locaux distincts de la recette navigateur et de GitHub Actions.
- Recette navigateur initialement bloquée par l’interruption de Computer Use. **Décision utilisateur du 8 novembre** : Playwright local explicitement autorisé avec Chromium isolé. Cette instruction lève l’attente précédente ; sept tests et revue des 16 captures réussis, P01 devient `validé localement`. Aucun onglet personnel utilisé ni changement de stack. README, STATUS, VERSIONS et preuve P01 actualisés.

## Décisions de travail P03 — 8 novembre 2026

- Schéma V002 : douze tables identité/contenu. Parcours, modules et activités utilisent une identité UUID commune typée, distincte des versions, traductions et slugs. Les autres modules gardent leurs migrations dans leurs lots.
- Versions pédagogiques et compositions gelées irréversiblement ; corrections éditoriales append-only sous une même version. FK RESTRICT et références composites empêchent les croisements de traductions et les cascades historiques. Modèle détaillé dans `DATA_MODEL.md`.
- V001 Spring Session inchangée et comparée à l’artefact 4.1.1 ; Flyway seul, Hibernate validate et UTC explicites. Fixture séparée, chargement local manuel et tests Testcontainers, aucun compte ou prix livré.
- OpenAPI limité aux opérations présentes ; client généré Hey API 0.99.0 compatible TypeScript 6, validation Redocly core 2.76.0. Contrat et fichiers générés contrôlés en CI ; décodeurs réseau conservés dans l’adaptateur manuscrit.
- Révision explicite obligatoire pour les futures écritures : 428 si absente, 412 si dépassée ; `*` ne satisfait pas cette politique de révision. Comparaison puis écriture sous transaction et `@Version`, après autorisation. Politique d’accès interne avec refus par défaut, sans prétention d’authentification déjà intégrée.

## Décisions de réalisation P11 — 8 novembre 2026

- Produit, offre commerciale révisée, commande préparée, paiement et droit restent distincts. V012 est additive ; aucun prix, compte marchand ou droit fictif n’est installé par Flyway. COMMERCE_MANAGER est une référence de permission sans compte attribué ; EDITOR ne reçoit pas les opérations commerciales.
- `COMMERCE_ENABLED=false` et devises activées vides par défaut. Le socle supporte explicitement EUR/USD/GBP, chacune à deux décimales ; seule EUR est activée dans les fixtures isolées. Cela ne choisit ni devise ni prix de l’offre réelle et n’impose pas deux décimales à toutes les devises ISO. Ajouter une devise nécessite une décision d’implémentation documentée.
- Le prix de l’offre est le total applicable explicite ; une fiscalité EXCLUSIVE reste bloquée sans calcul réel. INCLUSIVE/EXEMPT exige un libellé configuré, sans inventer de régime fiscal. La readiness structurelle est distincte de la disponibilité du Checkout ; le gateway désactivé bloque ce dernier jusqu’à P12.
- Préparation de commande : TTL de 30 minutes, configurable de 1 minute à 24 heures. Une nouvelle acceptation explicite d’une autre révision/langue/conditions peut remplacer seulement une préparation PREPARED dont paiement et activation sont NOT_STARTED ; l’ancienne passe CANCELLED sans effacement. Aucun paiement commencé ou ambigu n’est remplacé automatiquement.
- Révisions d’offres et snapshots de commandes sont immuables. Acceptation explicite de la version des conditions enregistrée avec la préparation ; lecture seule et visite ne constituent pas un consentement. Même intention active réutilisée sous verrou même avec deux clés, sans double préparation involontaire.
- Les origines `access_grants` ont des FK vérifiables et restent indépendantes par acquisition. P11 ne possède aucun service/API d’attribution ni de marquage PAID. MANUAL_TEST appartient uniquement aux fixtures SQL local/test et est ignoré hors de ces environnements ; ORDER_LINE attend la confirmation financière P12. Les ressources premium restent refusées avant ce raccordement.

Ces choix techniques sont réversibles et validés localement : ciblé combiné 26/26, global Java 155/155, puis ciblé HTTP final 10/10 après raccordement natif et dernier recontrôle de permission. Chromium 8/8 sans filtre/retry, vingt captures examinées et chaîne HTTP réelle réussissent ; les processus de recette sont arrêtés. Ces résultats ne ferment aucun des paramètres commerciaux réels ci-dessous et ne valident aucun paiement Stripe, réservé à P12. [Preuves P11](evidence/P11.md).

## Décisions techniques P12 — validation locale et Stripe TEST

- Stripe serveur stable 34.1.0 / API 2026-10-28.endive ; aucun mode live ni API preview. Les tests locaux avec transport contrôlé sont distincts du Checkout hébergé TEST effectivement exécuté en P12. Clé TEST, compte et secret CLI configurés en privé ; aucune valeur secrète dans les preuves. Les incidents historiques d’accès restent ouverts : [suivi](evidence/P12-access-follow-up.md). Les vérifications P19, notamment les remboursements fournisseur, ont leurs propres résultats dans [P19](evidence/P19.md).
- L'accès commence à l'activation effective PostgreSQL. Les durées FIXED et périodes d'actualisation sont calculées depuis cette activation selon le snapshot ; UNLIMITED doit être explicite. Cette règle évite de perdre une durée pendant un incident d'activation ; les conditions commerciales réelles devront l'énoncer avant vente. Elle ne tranche ni durée, prix ou support encore ouverts.
- Une seule opération Checkout durable par commande, paramètres/clé fournisseur et échéance de session fixes. Après timeout ambigu, reprise bornée avec la même intention puis rapprochement GET ; aucun nouveau paiement créé par le worker.
- Une attente normale de paiement ne compte pas comme erreur. La confirmation financière est durable avant l'activation ; droits et notification d'activation sont ensuite atomiques. Échec SMTP et retrait d'accès restent indépendants.

## Choix techniques P16 — validés localement

- Les dictionnaires existants restent l’outil FR/EN ; aucune bibliothèque d’i18n supplémentaire. `Français` et `English` sont les noms de navigation, sans drapeau. La langue d’interface ne traduit pas les productions personnelles.
- `/` reste une307 vers `APP_DEFAULT_LOCALE`. Une URL explicite `/fr` ou `/en` n’est pas réécrite d’après IP ou `Accept-Language`. Cette valeur technique de développement ne fixe pas la langue commerciale du lancement.
- `APP_PUBLISHED_LOCALES`, vide par défaut, autorise l’indexation seulement en production. Les équivalents SEO sont les traductions publiées de la même identité/version et les langues effectivement activées ; self-inclusion et réciprocité, sans `x-default` ou ciblage régional inventé.
- Les URL canoniques de fiche utilisent le slug courant sans `returnTo` ni version courante redondante. Une version historique conserve son URL épinglée et reste non indexable. Catalogue/recherche/combinaisons de filtres sont non indexables avec canonical du catalogue ; E10 et activités autonomes ne multiplient pas les entrées du sitemap.
- Les anciens slugs sont réservés à leur identité dans V018, sans chaîne d’alias ou réaffectation. Renommage explicite avec permission, motif et révision ; Next308 vers le remplaçant en conservant la version et les paramètres autorisés.
- Le sitemap lit exclusivement les métadonnées réellement publiées et les offres actives traduites, sans session, corps privé ou ancien slug. Aucun `lastmod` de build/revue : date du PUBLISH exact lorsqu’elle est connue. Réponse503 si l’API échoue, jamais un XML partiel présenté comme complet.
- Le périmètre de recette est HTTP Basic côté Next, paramétré en privé ; pages, API et assets sont concernés. Seul le POST exact du webhook Stripe utilise sa signature obligatoire plutôt que Basic. P20 devra empêcher tout contournement par exposition directe du serveur interne. robots/noindex ne sont pas une authentification.

## Paramètres commerciaux encore ouverts

P14 retient un document **HTML autonome imprimable de participation déclarée**, sans dépendance ni fournisseur supplémentaire. Les critères sont un nom de profil déclaré et au moins une participation persistée sur l’inscription/version exacte : activité déclarée terminée, quiz durable ou autoévaluation de la révision courante. Aucun seuil global d’achèvement n’est décidé ; le seuil BR01 d’une autoévaluation reste propre au projet. L’identité n’est pas vérifiée et aucune revue humaine n’est déduite. Une attestation émise conserve ses preuves et octets.

Les demandes d’export, d’effacement et de fermeture restent traçables en WAITING_POLICY, puis annulables. L’export prêt et tout traitement irréversible sont désactivés jusqu’à validation de la conservation et de leur circuit d’exécution. Aucun justificatif commercial n’est fabriqué : la plateforme signale l’absence de document vérifié publié, sans prétendre vérifier les documents du fournisseur. Horaires/délais d’aide, conservation, identité légale et modalités commerciales restent des décisions du porteur avant activation concernée ou mise en vente.

| Paramètre | État initial | Effet avant décision |
| --- | --- | --- |
| Prix, devise, présentation fiscale | À définir par offre | Offre réelle non vendable |
| Durée d’accès | À définir | Aucune promesse « à vie » implicite |
| Période d’actualisation incluse | À définir | Engagement distinct de l’accès |
| Support et délai annoncé | À dimensionner | Aucun service humain illimité promis |
| Correction humaine | Désactivée au lancement par défaut | Revue seulement si capacité/offre validées |
| Langues incluses et langue par défaut | À décider pour l’offre réelle | Publier seulement les traductions prêtes |
| Formats, tailles, quotas et conservation | À définir selon usage | Dépôts optionnels désactivés tant que non configurés |
| Fournisseur mails, vidéo et stockage | À choisir avec coût et accès disponibles | Adaptateurs/local fonctionnels, intégration externe déclarée en attente |
| Hébergement, région, domaine de recette | À renseigner | Infrastructure préparée sans faux déploiement |
| Identité légale et conditions de vente | À fournir et valider | Contenus non inventés ; blocage de commercialisation si incomplets |

Les montants 1 200 €, 1 400 € et 1 180 € de `CONTENT_REFERENCE.md` ne sont jamais des prix de formation.

## Choix techniques P19

La CI utilise trois jobs : contrôles/build web et API indépendants, puis recette HTTP/navigateur/configuration production sur les mêmes artefacts identifiés par SHA-256 et commit. Aucun secret fournisseur ou fichier privé local n’est nécessaire aux jobs contrôlés. Les actions sont épinglées aux SHA officiellement vérifiés ; l’exécution GitHub reste distincte des contrôles locaux. Voir [CI](CI.md).

Les rapports d’échec conservent états, compteurs et identifiants fixes, sans erreurs libres, traces de formulaire ou cookies. Huit captures de l’application synthétique sont autorisées avec garde d’origine, taille et empreinte ; aucune capture fournisseur. Les artefacts CI ont trois jours de rétention. Zéro retry automatique pour les recettes sensibles ; aucune réussite ultérieure n’efface un échec historique ou ne prouve sa cause.

Les décisions commerciales du tableau restent ouvertes. Une candidate technique en recette privée garde la vente désactivée, les langues non indexables par défaut et les traitements irréversibles en attente de politique ; elle n’autorise aucun déploiement dans le mandat P15–P19.

## Registre à maintenir

Choix techniques P20 : images multi-étapes verrouillées, Linux/amd64 réellement essayé, Next standalone optionnel au build Docker et JRE21 sans outil de compilation. La chaîne publique devient Caddy→Next→Spring afin de conserver le garde Basic staging existant sur toutes les routes ; le préfixe API et l’exception exacte du webhook restent inchangés. Aucune confiance Cloudflare/CDN n’est ajoutée. Les domaines/langues sont des paramètres serveur à l’exécution, testés avec les mêmes images.

Flyway s’exécute une fois avec le rôle propriétaire avant le serveur en Hibernate validate/rôle applicatif sans DDL. Les sauvegardes logiques et objets sont chiffrés avec AES256-GCM ; la clé outbox est incluse chiffrée et la clé de sauvegarde reste séparée. L’export S3 de test n’est pas un choix de fournisseur de production. Les propositions de cadence, rétention, RPO/RTO des runbooks attendent validation ; aucun SLA ni budget n’est décidé. Le registre, les accès SSH, la copie hors hôte et le canal d’alerte restent à fournir pour P21. [Résultats et frontières](evidence/P20.md).

| Date | Sujet | Décision ou hypothèse | Motif et preuve | Impact | Auteur/validation |
| --- | --- | --- | --- | --- | --- |
| 2026-11-07 | Kit initial | Choix techniques proposés ci-dessus | Cahier et demande de développement Codex | P00–P23 | À confronter au dépôt en P00 |
| 2026-11-07 | Audit du dossier | Kit sans code ni Git ; structure monorepo confirmée, aucune reprise de prototype | Inventaire SHA-256 et `evidence/P00.md` | P01 crée les fondations | Agent, dans le périmètre demandé |
| 2026-11-07 | Outils et versions | Windows natif + Docker Linux, npm unique lockfile, cibles exactes proposées | Commandes locales et sources de `VERSIONS.md` | Installation et verrouillage P01 ; aucun changement de stack | Agent, choix réversibles |
| 2026-11-07 | Routes et configuration | Registre FR/EN central et exemple sans secret ; lancement commercial indécis | `SCREENS.md`, `CONFIGURATION.md`, `.env.example` | P01/P03 puis lots métier | Agent, conventions réversibles |
| 2026-11-07 | Fondations locales | Outils portables, lockfile/BOM, infrastructure et proxy réels | `evidence/P01.md` | Base des lots suivants ; observation navigateur encore requise | Agent, réalisation P01 |
| 2026-11-08 | Recette navigateur | Playwright 1.65.0 et Chromium local isolé autorisés, installés et exécutés | Réponse explicite utilisateur ; `evidence/P01-browser/README.md` | Remplace l’attente d’accès navigateur P01 ; validation locale complète | Utilisateur pour la méthode, agent pour l’exécution et la revue |
| 2026-11-09 | Import local P18 | Acteur technique minimal autorisé, sans mot de passe connu conservé, désactivé après import | Réponse explicite utilisateur ; `evidence/P18-shared-import-checks.json` |28 traductions DRAFT/18 fichiers READY, rejeu stable ; aucun rôle actif ou publication partagé ensuite | Utilisateur pour l’autorisation, agent pour l’exécution vérifiée |

Une décision future doit nommer l’ancienne règle remplacée et les documents affectés. Ne pas masquer une hypothèse non validée sous un statut « décidé ».

## P21 — cible existante et visibilité du dépôt

Le propriétaire fournit le VPS OVH existant et le dépôt `fonkoukevin/chatgpt_courses`. Après avoir envisagé de garder privé avec GitHub Pro, il **annule cette option pour raison de budget et autorise explicitement le passage en public si nécessaire**. La protection privée étant refusée403, le dépôt est passé en public le9novembre après audit des63commits et des objets disponibles : zéro correspondance de valeur privée connue ou de candidat fournisseur. Les cours/brouillons et l’historique font partie de ce dépôt ; cette portée figurait dans la question de décision initiale. Les limites heuristiques de l’audit restent explicites. Aucun achat effectué. Les protections P20 restent obligatoires et ne sont pas affaiblies.

Choix technique réversible : **images GHCR toujours privées**, même avec source publique. Label OCI source, contrôle positif de visibilité et lien au dépôt, dénis anonymes structurés et jetons éphémères par job (`packages:write` publication, `packages:read` déploiement). `EXPECTED_SOURCE_VISIBILITY=public` rend la décision de source explicite ; défaut privé pour les autres configurations. Cela remplace les paramètres génériques de registre P20 et le credential store durable du VPS par une authentification éphémère ; les credentials de l’autre application ne sont ni lus ni remplacés. La publication réelle reste à vérifier. Les [règles de facturation officielles](https://docs.github.com/en/billing/concepts/product-billing/github-packages#free-use-of-github-packages) annoncent actuellement le stockage et transfert Container Registry gratuits. Aucun achat ou tarif de serveur supplémentaire estimé.

Le frontal Caddy préexistant est partagé : ajouter seulement un réseau interne et deux sites de recette, conserver ses routes, ne pas le recréer ou changer son image flottante. Courses utilise son projet/base/rôles/buckets/secrets distincts. Les ajouts doivent être conservés dans le déploiement du projet qui possède ce frontal ; un branchement manuel seul n’est pas durable. [Procédure](runbooks/shared-ingress-staging.md), [preuves et limites](evidence/P21.md).

Le premier paquet web d’essai a effectivement été publié en public, contrairement au choix des images privées ; sa cause de visibilité reste inconnue. L’utilisateur confirme le9novembre : **conserver les images privées et supprimer uniquement ce paquet d’essai**, puis employer de nouveaux noms. Le préfixe retenu est `ghcr.io/fonkoukevin/chatgpt_courses-private`, avec `/web` et `/api` ; le dépôt source reste `fonkoukevin/chatgpt_courses`. GitHub ne permet pas de rendre de nouveau privé un paquet public. La suppression autorisée concerne uniquement ce paquet contenant la version1531288133, son tag de test et son digest vérifiés, sans toucher à un autre paquet ou une version inconnue. Après refus400 de la suppression de version, le contrôleur prépare la suppression du paquet lui-même, seulement si les inventaires actif/supprimé complets confirment cette unique version. Elle utilisera le jeton éphémère du job seulement si ses permissions réelles le permettent ; aucun PAT élargi. Cette décision remplace le préfixe précédent, sans modifier la stack, la cible ou les protections. [État observé et audit](evidence/P21.md), [règles GitHub](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

Constat du10novembre : le nettoyage ancien réussit204 puis paquet/version404. Le nouveau paquet web devient également public lors du push ; changer de nom n’a pas établi sa confidentialité. Cette observation ne modifie pas le choix utilisateur : images privées toujours requises, aucune autorisation de les rendre publiques et aucun diagnostic de cause présumé. Toute nouvelle publication attend la résolution de ce comportement ; aucune suppression d’un autre paquet n’est déduite de l’autorisation ciblée précédente.

## P21 — décision ultérieure du 10 novembre : images publiques autorisées

Après explication de la différence entre dépôt de code et images Docker, l’utilisateur répond explicitement **« Oui, autoriser les images publiques »**. Cette décision remplace l’exigence d’images privées des paragraphes précédents. Les images contiennent seulement le programme construit depuis le code public ; configuration, identifiants, données, fichiers et sauvegardes privés restent hors des images et du registre.

La livraison conserve le dépôt public `fonkoukevin/chatgpt_courses`, sa branche protégée, sa CI et l’environnement `staging` déjà configuré, sans achat Pro. Le contrat ajoute `EXPECTED_IMAGE_VISIBILITY=public` explicite et revient au préfixe public standard **`ghcr.io/fonkoukevin/chatgpt_courses`**, images `/web` et `/api`. Le mode privé reste le défaut strict du contrôleur ; le mode public doit vérifier propriétaire, source, métadonnée publique et lecture anonyme du digest exact après chaque push et avant déploiement. Un refus403 ou une identité inconnue reste un blocage. Aucun contrôle de session, CSRF, propriété, migration ou promotion n’est relâché.

Le dépôt privé `chatgpt_courses_registry` conserve ses six fichiers et reste inactif ; il n’a plus de rôle dans ce chemin. Aucun droit Packages n’est accordé au dépôt public sur des paquets privés et aucun paquet n’a besoin d’être supprimé pour poursuivre. Le paquet public historique `chatgpt_courses-private/web` reste à inventorier avant un éventuel nettoyage séparé ; son nom ne constitue pas une politique d’accès. Les protections de recette, secrets serveur, données fictives, commerce fermé et Stripe TEST restent inchangés. Cette décision n’autorise ni achat, ni LIVE, ni activation commerciale.
