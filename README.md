# ChatGPT Courses

Plateforme de formation pratique à l’IA : choisir une tâche, apprendre, produire un livrable, le vérifier et conserver une méthode personnelle. Le périmètre comprend un site public, un espace apprenant et une administration, avec une structure français/anglais.

## État réel

P01 fournit les fondations locales : pages FR/EN, sonde Spring avec PostgreSQL réel, proxy de même origine, services Compose et première chaîne de vérification. Les parcours, comptes, paiements et écrans métier restent à développer. Aucun ancien prototype n’est repris et aucun déploiement externe n’est annoncé.

La recette navigateur de P01 reste non vérifiée : Computer Use a été interrompu car le contrôle des URL n’est pas pris en charge pour le navigateur Windows connecté. Les vérifications HTTP réelles ne remplacent pas cette observation visuelle.

La reprise a corrigé le contrôle des ports et le nettoyage de tous les processus. L’accès navigateur reste indisponible, y compris après réinitialisation et essai de Chrome. Une [recette Playwright locale](tests/browser/README.md) est préparée ; son installation/exécution attend l’instruction explicite requise pour cette méthode alternative. Aucun résultat navigateur n’est encore revendiqué.

Lire [AGENTS.md](AGENTS.md), puis [docs/STATUS.md](docs/STATUS.md). Les vérifications et limites sont dans [docs/evidence/P01.md](docs/evidence/P01.md) ; l’audit initial reste dans [docs/evidence/P00.md](docs/evidence/P00.md).

## Structure retenue

| Chemin | Rôle | État P01 |
| --- | --- | --- |
| `apps/web` | Next App Router, TypeScript strict, Tailwind, dictionnaires FR/EN et client API | Minimal fonctionnel ; composants shadcn/Radix en P02 |
| `apps/api` | Java 21, Spring Boot, Security, sessions JDBC, JPA et Flyway | Sonde et migration d’infrastructure ; métier en P03 et suivants |
| `infra/compose` | PostgreSQL, Mailpit, profil S3 local | Images exactes avec digests ; production ultérieure |
| `scripts` | Outils, configuration, démarrage et vérification | Commandes ci-dessous |
| `docs` | Contrat produit, décisions, suivi et preuves | Présent |
| `prompts` | Lots P00–P23 et prompts de reprise | Présent |
| `references` | Tokens de référence pour P02 | Présent |

Une seule origine publique ; `/api/v1` est servi par Spring. Spring reste l’autorité pour l’identité, les permissions, les achats, les droits et la progression. Sessions JDBC, CSRF et absence de cache partagé pour les données privées sont obligatoires. Le générateur prépare du texte sans API IA payante.

## Démarrer sous Windows

Mode vérifié : PowerShell 5.1, Node et Java natifs Windows, services Linux dans Docker Desktop. Démarrer Docker Desktop avant les services/tests. Les outils portables du projet préservent les installations globales. Aucune modification de politique PowerShell ni commande Bash n’est nécessaire.

Depuis la racine :

```powershell
node scripts/bootstrap.mjs
.\scripts\courses.cmd ci
.\scripts\courses.cmd run setup:local
.\scripts\courses.cmd run dev
```

Le bootstrap cible Windows x64 : Node **24.22.2 / npm 11.19.1** et Temurin **21.0.13+9**, archives officielles contrôlées par SHA-256 dans `.tools`. Il nécessite le Node déjà installé pour sa première exécution et `tar.exe` fourni par Windows. `courses.cmd` sélectionne ensuite ces outils et évite le lanceur `npm.ps1` bloqué. Maven **3.10.0** est téléchargé et vérifié par le Wrapper.

`setup:local` crée `.env.local` avec des secrets aléatoires et `infra/secrets/s3.local.json`, sans les afficher ni écraser les fichiers existants. Les deux sont ignorés par Git. Les scripts chargent ce fichier racine ; aucune copie de secret dans Next ou dans le navigateur.

`dev` démarre PostgreSQL/Mailpit, Spring puis Next. Ouvrir **http://localhost:3000/fr** ou **http://localhost:3000/en** et utiliser « Vérifier la connexion ». « Tester une erreur API » appelle une route réellement absente. Les journaux locaux sont dans `.runtime/api.log` et `.runtime/web.log` ; leur contenu ne doit pas être publié automatiquement.

Dans un autre terminal :

```powershell
.\scripts\courses.cmd run stop
```

L’arrêt vise les processus enregistrés de ce projet et arrête ses services Compose. Il conserve les volumes et les données. Ne pas utiliser `down -v` pour réparer un démarrage.

## Vérifier et construire

```powershell
.\scripts\courses.cmd run lint
.\scripts\courses.cmd run typecheck
.\scripts\courses.cmd run build
.\scripts\courses.cmd run verify:api
.\scripts\courses.cmd run smoke
.\scripts\courses.cmd run verify:http
.\scripts\courses.cmd audit
```

`smoke` exige les applications démarrées ; les builds et tests API sont indépendants de ce démarrage. `verify:api` utilise le vrai moteur Docker et PostgreSQL Testcontainers isolé, sans H2. `build:api` est un alias de cette vérification complète et produit `apps/api/target/chatgpt-courses-api.jar`.

`verify:http` exige PostgreSQL déjà démarré et les ports 3000/8080 libres. Il lance les serveurs issus des builds, vérifie le proxy, arrête réellement l’API en maintenant Next, vérifie l’erreur puis la reprise, et nettoie uniquement ses processus. Il s’agit de tests HTTP, pas d’un test navigateur. Arrêter `dev` avant de le lancer.

Pour tester les serveurs issus des builds, lancer dans deux terminaux, après `services:up` :

```powershell
.\scripts\courses.cmd run services:up
.\scripts\courses.cmd run start:api
```

```powershell
.\scripts\courses.cmd run start:web
```

Ces lancements séparés se terminent par Ctrl+C dans leurs terminaux ; `stop` ne revendique pas leur gestion. Avec Next maintenu en marche et l’API arrêtée, `run smoke -- --expect-api-unavailable` vérifie l’erreur de connexion sans faux contenu.

Autres opérations locales :

| Commande après `.\scripts\courses.cmd` | Effet |
| --- | --- |
| `run services:up` | PostgreSQL et Mailpit, attente de leur état sain |
| `run services:s3` | Ajoute le profil S3 SeaweedFS local, sans fournisseur externe |
| `run services:status` | État des services |
| `run services:stop` | Arrêt des services, volumes conservés |
| `run verify:persistence` | Redémarre PostgreSQL et vérifie une donnée de preuve unique, puis enlève uniquement sa table de test |

Le test de persistance interrompt brièvement PostgreSQL : le lancer sans travail en cours. Les ports publiés sont exclusivement locaux : API `8080`, PostgreSQL `5432`, Mailpit `8025` et SMTP `1025`, S3 facultatif `8333`. Mailpit est consultable sur http://localhost:8025.

La CI Linux utilise les mêmes versions, le lockfile npm et le Wrapper, avec des actions épinglées à leurs SHA. Son fichier a été contrôlé localement ; aucune exécution GitHub n’est présumée. WSL n’a pas été utilisé pour la recette locale.

## Configuration et suite

[VERSIONS.md](docs/VERSIONS.md) distingue versions résolues et outils P02 encore proposés. [CONFIGURATION.md](docs/CONFIGURATION.md) précise le chargement, les profils et les secrets ; [SCREENS.md](docs/SCREENS.md) centralise les routes FR/EN.

Les pages de fondation sont non indexables et limitées à `APP_ENV=local|test`. Le profil de production exige une origine publique HTTPS et des cookies sécurisés ; cela ne constitue pas un déploiement. Prix, conditions, médias et accès fournisseurs restent ouverts, sans bloquer P02.

Prochaine action : terminer la vérification navigateur de P01 sur les pages FR/EN, les boutons, l’erreur et la reprise. Phase suivante prévue après cette vérification : [prompts/P02_DESIGN_SYSTEM_INTERFACES.txt](prompts/P02_DESIGN_SYSTEM_INTERFACES.txt).
