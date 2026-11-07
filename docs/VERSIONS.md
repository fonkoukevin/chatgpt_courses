# Versions proposées — P00

Vérifications réalisées le **7 novembre 2026**, dans les documentations officielles et par requêtes HTTP réelles aux registres officiels. Les pins ci-dessous sont des cibles pour P01 : **aucune dépendance applicative n’est installée ni verrouillée dans ce dossier**. La compatibilité déclarée ne remplace pas l’installation, les builds et les tests.

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

## Environnement observé et limites du verrouillage

Windows 11 Famille 64 bits, PowerShell 5.1.26100.9711 ; Docker Desktop 4.91.0, Engine 29.8.0 Linux x86_64, Compose 5.5.1. Le moteur répond ; aucun conteneur n’était lancé. Git 2.53.0.windows.1 et ripgrep 15.2.0 sont disponibles. Voir les commandes et distinctions d’erreur dans [evidence/P00.md](evidence/P00.md).

P01 doit encore :

1. Installer ou sélectionner les correctifs Node/npm et Java proposés sans écraser une installation utilisateur ; consigner les versions effectivement utilisées. Aucune mise à jour globale n’a été exécutée en P00.
2. Épingler les dépendances directes exactes et résoudre un unique lockfile npm ; prouver une réinstallation par `npm.cmd ci`. Les commandes de livraison n’utiliseront pas de `latest` flottant.
3. Figer Maven et son SHA-256 dans le Wrapper, le parent Boot dans le POM et les versions d’outils de build non gérées. Vérifier le téléchargement du Wrapper.
4. Vérifier les tags, digests et conventions des images PostgreSQL 18, Mailpit, S3 local et, au lot concerné, Caddy et les images applicatives. Aucun digest Docker n’a été contrôlé dans P00 ; aucun choix de fournisseur S3 de production n’est acquis.
5. Vérifier l’ensemble résolu : configuration explicite de lint ci-dessus, typecheck TS6, build Next, compilation/tests Spring et intégration PostgreSQL. Les contraintes `engines`/`peerDependencies` de la combinaison proposée sont compatibles à ce stade, sans preuve d’exécution commune.
6. Versionner les composants issus de shadcn : épingler son CLI ne fige pas à lui seul le registre distant. La revue visuelle et l’intégration des tokens relèvent de P02.

Si P01 constate une incompatibilité, relever l’erreur réelle et mettre à jour ce fichier et DECISIONS.md avant tout changement de technologie principale. Les métadonnées de registre et les pages de documentation peuvent évoluer ; les fichiers verrouillés et preuves P01 feront autorité sur l’installation effective.
