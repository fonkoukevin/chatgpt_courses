# Versions — socle verrouillé et compléments par lot

Vérifications réalisées les **7 et 8 novembre 2026**, dans les documentations officielles et les registres officiels. P00 a proposé les versions ci-dessous ; P01 les a installées et verrouillées pour les fondations effectivement présentes. P02 ajoute les primitives et utilitaires du système visuel. Preuves : `evidence/P01.md` et `evidence/P02.md`.

## Images verrouillées et vérifiées en P20 — 9 novembre 2026

La stack applicative P19 reste inchangée. Les [Dockerfiles web](../apps/web/Dockerfile) et [API](../apps/api/Dockerfile) et le [Compose de déploiement](../infra/compose/compose.deployment.yml) épinglent les références suivantes ; les digests sont ceux des manifestes/index OCI, distincts des IDs locaux des images applicatives construites.

| Usage | Image exacte | Digest verrouillé |
| --- | --- | --- |
| Build et runtime web | `node:24.22.2-bookworm-slim` | `sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9` |
| Build API | `eclipse-temurin:21.0.13_9-jdk-noble` | `sha256:114cabb73033ca4ce7ceec3deb62396bc1b716282bae051ed3c1d82e38fcab2d` |
| Runtime API | `eclipse-temurin:21.0.13_9-jre-noble` | `sha256:0eda5830ed7b669abc246a8dc520ea8a23cab06f9a8d4b6964109e2f2394e46f` |
| PostgreSQL | `postgres:18.6` | `sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42` |
| Entrée HTTPS | `caddy:2.11.9-alpine` | `sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee` |

Sources primaires des images officielles : [Node](https://github.com/docker-library/official-images/blob/master/library/node), [Temurin](https://github.com/docker-library/official-images/blob/master/library/eclipse-temurin), [PostgreSQL](https://github.com/docker-library/official-images/blob/master/library/postgres), [Caddy](https://github.com/docker-library/official-images/blob/master/library/caddy). Le build API ajoute seulement dans son étape de construction le paquet Ubuntu Noble `unzip=6.0-28ubuntu4.1` pour utiliser la distribution ZIP Maven dont le checksum est verrouillé ; il n’est pas copié dans l’étape JRE. [Paquet officiel Ubuntu](https://packages.ubuntu.com/noble-updates/unzip).

L’intégration P20 s’exécute sur le moteur Linux **Docker Engine 29.8.0** et **Compose 5.5.1** déjà présents, sans mise à jour d’outil ou nouvelle dépendance applicative. Sources : [notes Engine 29, dont 29.8.0](https://docs.docker.com/engine/release-notes/29/#2980), [release Compose 5.5.1](https://github.com/docker/compose/releases/tag/v5.5.1). Ce sont les versions observées, pas une affirmation qu’il s’agit des derniers correctifs disponibles ; la maintenance de l’hôte cible reste à vérifier avant P21.

La [preuve P20](evidence/P20-integration-checks.json) identifie le commit et les IDs des deux images réellement démarrées, leur UID/GID 10001 et leur promotion locale recette/production sans reconstruction. Aucun `registryDigest` applicatif, push registre ou déploiement distant n’est revendiqué. L’inspection du système de fichiers final ne vaut pas scan de toutes les couches ou de vulnérabilités.

## Complément verrouillé en P10

AWS SDK Java **2.57.11** : BOM exact, modules `s3` et `url-connection-client`. Les transports Apache/Netty inutilisés sont exclus ; Java 21 et le BOM Spring Boot 4.1.2 restent inchangés. La [release officielle du 6 novembre](https://github.com/aws/aws-sdk-java-v2/releases/tag/2.57.11) a été vérifiée avant ajout. Dépendances résolues, global138tests Java, ciblé S3 huit tests et Chromium12/12 exécutés sous les outils verrouillés. SeaweedFS **4.52**, son digest et le lockfile npm sont conservés. Les preuves détaillées et limites figurent dans [P10](evidence/P10.md). P11 ne change aucune dépendance.

## Compléments verrouillés en P03

| Dépendance de développement | Version exacte | Compatibilité et usage |
| --- | --- | --- |
| `@hey-api/openapi-ts` | 0.99.0 | Node ≥22.18 ; peer TypeScript accepte explicitement 6.0 ; génère types, SDK et transport fetch depuis OpenAPI 3.1 |
| `@redocly/openapi-core` | 2.76.0 | Node ≥22.12 ; validation de structure OpenAPI 3.1, références et identifiants d’opérations |
| `js-yaml` sous le parseur Hey API | 4.3.2 | Override ciblé d’un pin transitif 4.2.0 vulnérable, sans modifier le YAML 5.5.0 utilisé par Redocly |

Node 24.22.2/npm 11.19.1 et TypeScript 6.0.3 restent inchangés. `openapi-typescript` 7.13.0 a été écarté après consultation de son peer TypeScript `^5.x` ; la stack n’est pas rétrogradée pour un générateur. Aucun nouveau runtime npm distant requis par l’application : le transport fetch est généré dans le dépôt.

Installation verrouillée P03 effectivement exécutée : **343 paquets ajoutés, 351 audités, zéro alerte**. L’installation initiale remontait quatre alertes élevées reliées au même parseur YAML 4.2.0. Le [correctif officiel du mainteneur](https://github.com/nodeca/js-yaml/security/advisories) inclut la [faille corrigée en 4.3.2](https://github.com/advisories/GHSA-2883-xcg3-v3hh). Un override limité à `@hey-api/json-schema-ref-parser` a été appliqué ; aucun `audit fix --force`, masquage ou downgrade automatique. Génération, validation, compilation et tests sont exécutés avec ce correctif.

Le script de génération vérifie les pins et normalise l’empreinte du contrat en UTF-8/LF. Quatre annotations `any` du transport fourni sont adaptées de manière déterministe vers des frontières `unknown`/`BodyInit` et des assertions génériques bornées. Le script refuse un gabarit inattendu ; les fichiers générés restent compilés et lintés, sans nouvelle règle désactivée. Le wrapper manuscrit valide les données réseau à l’exécution.

Sources consultées le 8 novembre : [Hey API exact et peers](https://registry.npmjs.org/@hey-api%2fopenapi-ts/0.99.0), [génération officielle](https://heyapi.dev/docs/openapi/typescript/get-started), [Redocly exact](https://registry.npmjs.org/@redocly%2fopenapi-core/2.76.0), [validation Redocly](https://redocly.com/docs/cli/rules/oas/struct), [js-yaml 4.3.2](https://registry.npmjs.org/js-yaml/4.3.2). Résultats : [preuve P03](evidence/P03.md).

## Compléments verrouillés en P02

| Dépendance | Version exacte | Compatibilité vérifiée |
| --- | --- | --- |
| radix-ui | 1.8.1 | Package unifié ; peers React/DOM incluent React 19 |
| lucide-react | 1.70.0 | Peer React `^19.0.0`, une seule famille d’icônes |
| clsx | 2.1.1 | Node ≥6 ; utilitaire de classes sans runtime React |
| tailwind-merge | 3.7.0 | Branche Tailwind 4 ; classes sémantiques vérifiées par build et rendu |

Installation exacte puis `npm ci` réellement exécutés : **277 paquets ajoutés, 285 audités, zéro alerte**. Un seul gestionnaire/lockfile conservé, aucun override de peers ajouté. shadcn CLI **4.23.0** reste une référence vérifiée, **non installé ni exécuté** : les sources UI sont adaptées manuellement avec `components.json`, sans écraser la palette du projet. La stack et les versions P01 restent inchangées.

Sources : [registre Radix exact](https://registry.npmjs.org/radix-ui/1.8.1), [Lucide exact](https://registry.npmjs.org/lucide-react/1.70.0), [clsx exact](https://registry.npmjs.org/clsx/2.1.1), [tailwind-merge exact](https://registry.npmjs.org/tailwind-merge/3.7.0), [mainteneur tailwind-merge](https://github.com/dcastil/tailwind-merge), [shadcn et Tailwind 4](https://ui.shadcn.com/docs/tailwind-v4), [convention components.json](https://ui.shadcn.com/docs/components-json). Les métadonnées ont été lues avant l’installation le 8 novembre.

## Verrouillage réellement effectué en P01

- Outils portables utilisés : Node **24.22.2**, npm **11.19.1**, Temurin **21.0.13+9** ; aucune installation globale remplacée. Bootstrap Windows x64 et SHA-256 dans `scripts/bootstrap.mjs`.
- Un seul `package-lock.json` racine et des dépendances directes exactes ; réinstallation réelle `npm ci` réussie. Compléments web installés : `server-only` **0.0.1**, `@types/node` **24.19.2**, `postcss` **8.5.23**.
- **minimatch 11.0.1** substitué seulement pour le range transitif `^10.2.2`, via `overrides` explicite. L’audit initial remontait dix alertes modérées provenant d’une même [faille documentée par le mainteneur](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). `npm install` seul conservait un verrou ancien ; `npm update minimatch`, puis `npm ci`, ont résolu le correctif. Audit final : zéro alerte. Lint, couverture des fichiers et déclenchement des règles ont été vérifiés, sans masquer un contrôle ; ce changement de moteur de glob reste à réévaluer lors des mises à jour des outils.
- API : parent Boot **4.1.2**, BOM transitif et Maven Wrapper **3.3.4** / Maven **3.10.0**, SHA-256 de distribution versionné. L’arbre réellement résolu confirme les versions Java du tableau ; les cinq tests PostgreSQL passent sous le JDK portable.
- Recette navigateur autorisée et exécutée le 8 novembre : **@playwright/test, playwright et playwright-core 1.65.0**, dépendances verrouillées ; Chromium/Chrome for Testing **158.0.8127.18**, révision Playwright **1254**, et son headless shell installés dans `.tools/playwright`. Réinstallation `npm ci` : 201 paquets ajoutés, 209 audités, zéro alerte. Les sept tests finaux passent. Sources : [registre exact](https://registry.npmjs.org/@playwright%2ftest/1.65.0), [installation officielle](https://playwright.dev/docs/intro), preuves dans `evidence/P01-browser/README.md`.
- Images locales vérifiées par registre puis démarrées :

| Image | Digest de manifeste |
| --- | --- |
| `postgres:18.6` | `sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42` |
| `axllent/mailpit:v1.33.0` | `sha256:9b3a463be15354c0f0eba91697d80e3e0d8a5623ef0e627cacc836bc17fd5231` |
| `chrislusf/seaweedfs:4.52` | `sha256:57877e32bb90073b37dc109b438ba66e84fd5ed9ced5f5c04f56444ef243ce59` |

Sources : [image officielle PostgreSQL et volume PG18](https://hub.docker.com/_/postgres), [Mailpit Docker](https://mailpit.axllent.org/docs/install/docker/), [SeaweedFS 4.52](https://github.com/seaweedfs/seaweedfs/releases/tag/4.52). Ce dernier est seulement un émulateur S3 local, pas un fournisseur de production choisi.

## Outils et frontend

| Composant | Cible exacte P01 | Constat / compatibilité |
| --- | --- | --- |
| Node.js | **24.22.2 LTS** | Conserver la branche 24 déjà installée ; local actuel 24.14.0. Node 26.13.0 est aussi LTS, sans nécessité de changer de majeure |
| npm | **11.19.1** | Fourni avec Node 24.22.2 ; local actuel 11.9.0. npm workspaces et un seul `package-lock.json` racine |
| Next.js, create-next-app | **16.4.5** | Next 16 en Active LTS ; minimum Node 20.9, satisfait par la cible |
| React, react-dom | **19.3.1** | Versions identiques ; peers Next compatibles avec React 19 ; react-dom exige React `^19.3.1` |
| TypeScript | **6.0.3** | Version stable compatible avec Next et la plage du parseur de lint `>=4.8.4 <6.1.0` ; TS7 n’est pas retenu |
| @types/react, @types/react-dom | **19.3.0** | Types alignés sur la branche React 19.3 |
| Tailwind CSS, @tailwindcss/postcss | **4.3.5** | Intégration Tailwind 4 / PostCSS officielle ; ne pas importer une configuration Tailwind 3 |
| shadcn CLI | **4.23.0** | Node ≥20.18.1 ; choisir explicitement la base Radix ; composants générés à versionner |
| radix-ui | **1.8.1** | Package unifié officiel ; peers React et React DOM incluent 19 |
| ESLint | **10.14.0** | Node ≥24 accepté ; branche maintenue. Configuration explicite à créer, sans `eslint-config-next` |
| @eslint/js | **10.0.1** | Règles JavaScript ; peer ESLint `^10.0.0` |
| typescript-eslint | **8.72.1** | ESLint 10 accepté ; TypeScript `<6.1.0` requis |
| @next/eslint-plugin-next | **16.4.5** | Règles Next avec configuration monorepo explicite ; version alignée sur Next |
| eslint-plugin-react-hooks | **7.1.1** | Règles des hooks ; peer ESLint 10 accepté |

Sources consultées :

- Node : [calendrier des versions](https://nodejs.org/en/about/previous-releases), [index des distributions avec versions npm](https://nodejs.org/dist/index.json). L’index date Node 24.22.2 du 27 octobre ; le billet de publication porte le 28 octobre. Ce décalage ne change pas le numéro du binaire.
- Next : [installation](https://nextjs.org/docs/app/getting-started/installation), [politique de support](https://nextjs.org/support-policy), [TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript), [configuration ESLint et plugin direct](https://nextjs.org/docs/app/api-reference/config/eslint).
- React : [versions officielles](https://react.dev/versions). TypeScript : [installation](https://www.typescriptlang.org/download/).
- Tailwind : [Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [navigateurs compatibles](https://tailwindcss.com/docs/compatibility). Cible Tailwind 4 : Chrome 111+, Safari 16.4+, Firefox 128+ ; à vérifier réellement en P02/P17.
- shadcn : [installation Next](https://ui.shadcn.com/docs/installation/next), [Tailwind 4 et React 19](https://ui.shadcn.com/docs/tailwind-v4), [CLI](https://ui.shadcn.com/docs/cli). Radix : [introduction et installation](https://www.radix-ui.com/primitives/docs/overview/introduction).

Métadonnées exactes consultées sur le registre npm : [Next 16.4.5](https://registry.npmjs.org/next/16.4.5), [create-next-app 16.4.5](https://registry.npmjs.org/create-next-app/16.4.5), [React 19.3.1](https://registry.npmjs.org/react/19.3.1), [React DOM 19.3.1](https://registry.npmjs.org/react-dom/19.3.1), [TypeScript 6.0.3](https://registry.npmjs.org/typescript/6.0.3), [types React](https://registry.npmjs.org/@types/react/19.3.0), [types React DOM](https://registry.npmjs.org/@types/react-dom/19.3.0), [Tailwind 4.3.5](https://registry.npmjs.org/tailwindcss/4.3.5), [PostCSS Tailwind](https://registry.npmjs.org/@tailwindcss/postcss/4.3.5), [shadcn 4.23.0](https://registry.npmjs.org/shadcn/4.23.0), [Radix 1.8.1](https://registry.npmjs.org/radix-ui/1.8.1), [ESLint 10.14.0](https://registry.npmjs.org/eslint/10.14.0), [@eslint/js](https://registry.npmjs.org/@eslint/js/10.0.1), [typescript-eslint](https://registry.npmjs.org/typescript-eslint/8.72.1), [plugin Next](https://registry.npmjs.org/@next/eslint-plugin-next/16.4.5), [React Hooks](https://registry.npmjs.org/eslint-plugin-react-hooks/7.1.1).

### Contrainte de lint identifiée et choix P01

Les seuls peers directs de Next ne suffisent pas à valider les outils de contrôle. Le registre de [eslint-config-next 16.4.5](https://registry.npmjs.org/eslint-config-next/16.4.5) autorise ESLint ≥9, mais ses dépendances résolubles `eslint-plugin-react` 7.37.5, `eslint-plugin-import` 2.32.0 et `eslint-plugin-jsx-a11y` 6.10.2 n’acceptent pas ESLint 10 dans leurs peers. Le parseur typescript-eslint exclut TS7, même si Next sait utiliser son CLI. Voir [versions prises en charge par typescript-eslint](https://typescript-eslint.io/users/dependency-versions/) et les métadonnées [React](https://registry.npmjs.org/eslint-plugin-react/7.37.5), [import](https://registry.npmjs.org/eslint-plugin-import/2.32.0), [jsx-a11y](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2), [parseur](https://registry.npmjs.org/@typescript-eslint/parser/8.72.1).

ESLint 9 est en fin de maintenance depuis le 6 août 2026 selon sa [politique de support](https://eslint.org/version-support/) ; il n’est pas retenu. P01 créera donc dès le départ une configuration plate explicite ESLint 10 + JS + TypeScript 6 + Next + React Hooks avec les pins du tableau, plutôt que d’importer `eslint-config-next`. Aucun `--force`, `--legacy-peer-deps`, override de peers ou masquage d’erreur prévu. Il n’existe aucun contrôle antérieur à désactiver dans ce kit.

Cette configuration ne sera pas annoncée comme équivalente à toutes les règles React/import/accessibilité de la configuration groupée. P01 exécutera réellement le lint ; P02/P17 conserveront les vérifications clavier, contraste, sémantique et navigateur prévues. La portée des règles retenues sera documentée avec leur implémentation.

## Java et données

| Composant | Cible exacte P01 | Gestion / compatibilité |
| --- | --- | --- |
| JDK Eclipse Temurin | **21.0.13+9 LTS** | Java 21 conservé ; installé actuellement 21.0.11+10 |
| Spring Boot | **4.1.2** | Stable ; Java 17–27, Maven ≥3.6.3 ; branche 4.1 maintenue en OSS jusqu’au 31 juillet 2027 selon le calendrier consulté |
| Apache Maven | **3.10.0** | Distribution à figer dans le Wrapper ; Maven global absent et non requis après création du Wrapper |
| Maven Wrapper | **3.3.4** | Wrapper Windows `mvnw.cmd` et Unix `mvnw`, URL et checksum de distribution à versionner |
| PostgreSQL | **18.6** | Version stable ; branche 18 maintenue jusqu’au 14 novembre 2030 |
| Spring Framework | **7.0.10** | Géré par le BOM Boot 4.1.2 |
| Spring Security | **7.1.2** | BOM Boot |
| Spring Session JDBC | **4.1.1** | BOM Boot ; starter Boot 4 à utiliser, schéma PostgreSQL migré par Flyway |
| Spring Data BOM / JPA | **2026.0.2 / 4.1.2** | BOM Boot puis BOM Data |
| Hibernate ORM / Jakarta Persistence | **7.4.13.Final / 3.2.0** | BOM Boot ; JPA fourni par le starter, sans surcharge manuelle |
| Flyway core et module PostgreSQL | **12.4.0** | BOM Boot ; ajouter aussi `flyway-database-postgresql` |
| Pilote JDBC PostgreSQL | **42.7.14** | BOM Boot |
| Testcontainers | **2.0.5** | BOM Boot ; tests sur PostgreSQL, pas H2 |

Le parent/BOM Spring Boot exact est le verrou de la famille Java. Ne pas recopier les versions transitives comme surcharges indépendantes dans le POM. Utiliser les starters et APIs Boot 4 / Security 7 réellement documentés, puis inspecter le POM effectif et l’arbre de dépendances en P01.

Sources consultées :

- [Adoptium — JDK 21 Windows x64](https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse).
- Spring Boot : [exigences](https://docs.spring.io/spring-boot/system-requirements.html), [dépendances gérées](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html), [calendrier](https://api.spring.io/projects/spring-boot/generations), [POM exact 4.1.2](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-dependencies/4.1.2/spring-boot-dependencies-4.1.2.pom), [BOM Data 2026.0.2](https://repo.maven.apache.org/maven2/org/springframework/data/spring-data-bom/2026.0.2/spring-data-bom-2026.0.2.pom). La préversion 4.2.0-RC2 n’est pas retenue.
- Maven : [téléchargements](https://maven.apache.org/download.cgi), [Wrapper](https://maven.apache.org/tools/wrapper/), [métadonnées Maven](https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml), [métadonnées Wrapper](https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper-distribution/maven-metadata.xml).
- PostgreSQL : [maintenance](https://www.postgresql.org/support/versioning/), [notes 18.6](https://www.postgresql.org/docs/release/18.6/). Flyway : [support PostgreSQL et module](https://documentation.red-gate.com/flyway/reference/database-driver-reference/postgresql-database).
- [Spring Session JDBC](https://docs.spring.io/spring-session/reference/guides/boot-jdbc.html), [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html), [Testcontainers PostgreSQL](https://java.testcontainers.org/modules/databases/postgres/).

## Environnement P00 et limites restantes

### Ajout P12 : Stripe

SDK Java **34.1.0**, version d’API stable **2026-10-28.endive**, épinglés dans le POM et `StripeSettings.API_VERSION`. Sources officielles vérifiées le 8 novembre 2026 : [release exacte](https://github.com/stripe/stripe-java/releases/tag/v34.1.0), [constante au tag](https://raw.githubusercontent.com/stripe/stripe-java/v34.1.0/src/main/java/com/stripe/ApiVersion.java), [Checkout hébergé](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page), [webhooks](https://docs.stripe.com/webhooks), [idempotence](https://docs.stripe.com/api/idempotent_requests). Aucune API preview ni collecte de carte locale.

Les essais P12 restent en mode TEST, le mode LIVE est refusé. Les minima retenus sont EUR50, USD50, GBP30 unités mineures ; le plafond commun de **99 999 999** unités mineures est une borne conservatrice de l’application, pas une limite universelle de Stripe. Les [limites officielles](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts) varient notamment selon devise, règlement et moyen de paiement. La résolution et les résultats effectivement exécutés sont consignés dans [P12](evidence/P12.md).

### Outillage Stripe local ajouté en reprise P12

**Stripe CLI 1.55.8**, Windows x86_64 portable, release stable du 3 novembre 2026. [Release officielle](https://github.com/stripe/stripe-cli/releases/tag/v1.55.8). Archive SHA-256 `d0650b491dcccab3b38ee807b6ee239713a8fff071818d672ec967abea60efed`, manifeste Windows SHA-256 `b735d9d5cca8b02b325c2c8f42db8c8d430a4678e92c87b5bdef30cd6749a28d`. Téléchargement, contrôle des deux sommes et `stripe version` effectivement exécutés. Pin reproductible dans [le manifeste](../infra/tools/stripe-cli.windows.json), installation sous `.tools/stripe/1.55.8` sans changement global.

`listen` ne propose pas de pin arbitraire d’API : version du compte ou `--latest`. Le lanceur local exige une annonce Ready exactement `2026-10-28.endive` et le secret attendu ; Spring valide ensuite chaque événement. La lecture du compte, la synchronisation explicite du secret et la recette d'un vrai Checkout hébergé TEST sont exécutées : 1/1, redémarrage vers PAID/READY et deux rejeux CLI séquentiels acquittés sans double effet. La livraison CLI est vérifiée à `2026-10-28.endive` ; l'événement source lu par GET garde séparément sa version historique `2022-11-15`. Aucun changement de version globale du compte ni API preview n'est effectué. [Source de la version CLI](https://github.com/stripe/stripe-cli/blob/v1.55.8/pkg/cmd/listen.go), [options](https://docs.stripe.com/cli/listen), [objet Event](https://docs.stripe.com/api/events/object), [version des webhooks](https://docs.stripe.com/webhooks/versioning).

P12 est validé localement avec intégration Stripe TEST observée ; aucun déploiement ni mode LIVE n'est validé. Le montant fictif temporaire de 1 EUR de la preuve ne fixe aucun prix commercial. Les deux refus d'accès historiques, non reproduits et de cause inconnue, restent au [suivi P17/P19 avant livraison](evidence/P12-access-follow-up.md). [Résultats et limites P12](evidence/P12.md).

Windows 11 Famille 64 bits, PowerShell 5.1.26100.9711 ; Docker Desktop 4.91.0, Engine 29.8.0 Linux x86_64, Compose 5.5.1. Le moteur répond ; aucun conteneur n’était lancé en P00. Git 2.53.0.windows.1 et ripgrep 15.2.0 sont disponibles. Voir les commandes et distinctions d’erreur dans [evidence/P00.md](evidence/P00.md).

La liste suivante conserve les travaux identifiés en P00. Les points 1–5 ont ensuite été couverts pour le socle P01 par les fichiers verrouillés et `evidence/P01.md` ; les composants UI sont introduits en P02 et les images de déploiement sont maintenant documentées dans le complément P20 ci-dessus :

1. Installer ou sélectionner les correctifs Node/npm et Java proposés sans écraser une installation utilisateur ; consigner les versions effectivement utilisées. Aucune mise à jour globale n’a été exécutée en P00.
2. Épingler les dépendances directes exactes et résoudre un unique lockfile npm ; prouver une réinstallation par `npm.cmd ci`. Les commandes de livraison n’utiliseront pas de `latest` flottant.
3. Figer Maven et son SHA-256 dans le Wrapper, le parent Boot dans le POM et les versions d’outils de build non gérées. Vérifier le téléchargement du Wrapper.
4. Vérifier les tags, digests et conventions des images PostgreSQL 18, Mailpit, S3 local et, au lot concerné, Caddy et les images applicatives. Aucun digest Docker n’a été contrôlé dans P00 ; aucun choix de fournisseur S3 de production n’est acquis.
5. Vérifier l’ensemble résolu : configuration explicite de lint ci-dessus, typecheck TS6, build Next, compilation/tests Spring et intégration PostgreSQL. Les contraintes `engines`/`peerDependencies` de la combinaison proposée sont compatibles à ce stade, sans preuve d’exécution commune.
6. Versionner les composants issus de shadcn : épingler son CLI ne fige pas à lui seul le registre distant. La revue visuelle et l’intégration des tokens relèvent de P02.

Si P01 constate une incompatibilité, relever l’erreur réelle et mettre à jour ce fichier et DECISIONS.md avant tout changement de technologie principale. Les métadonnées de registre et les pages de documentation peuvent évoluer ; les fichiers verrouillés et preuves P01 feront autorité sur l’installation effective.
