# ChatGPT Courses

Plateforme de formation pratique à l’IA : choisir une tâche, apprendre, produire un livrable, le vérifier et conserver une méthode personnelle. Le périmètre comprend un site public, un espace apprenant et une administration, avec une structure français/anglais.

## État réel

P01 fournit les fondations locales : pages FR/EN, sonde Spring avec PostgreSQL réel, proxy de même origine, services Compose et première chaîne de vérification. P02 ajoute le système visuel, une galerie interactive et les structures public, apprenant et administration. Les données métier, comptes et paiements seront raccordés dans les prochains lots. Aucun ancien prototype n’est repris et aucun déploiement externe n’est annoncé.

La validation P01 couvre FR/EN, clavier, formats étroits, erreur 404 et panne/reprise réelle de Spring. P02 ajoute 14 tests et 54 captures examinées pour les interfaces ; les sept scénarios P01 passent à nouveau après ces changements. La validation reste locale, avec le Chromium de test autorisé.

Lire [AGENTS.md](AGENTS.md), puis [docs/STATUS.md](docs/STATUS.md). Vérifications et limites : [P02](docs/evidence/P02.md), [P01](docs/evidence/P01.md) ; audit initial : [P00](docs/evidence/P00.md).

## Structure retenue

| Chemin | Rôle | État P01 |
| --- | --- | --- |
| `apps/web` | Next App Router, TypeScript strict, Tailwind, dictionnaires FR/EN et client API | UI Radix adaptée, galerie et trois structures locales ; fondation API conservée |
| `apps/api` | Java 21, Spring Boot, Security, sessions JDBC, JPA et Flyway | Sonde et migration d’infrastructure ; métier en P03 et suivants |
| `infra/compose` | PostgreSQL, Mailpit, profil S3 local | Images exactes avec digests ; production ultérieure |
| `scripts` | Outils, configuration, démarrage et vérification | Commandes ci-dessous |
| `docs` | Contrat produit, décisions, suivi et preuves | Présent |
| `prompts` | Lots P00–P23 et prompts de reprise | Présent |
| `references` | Tokens utilisés par Tailwind et les composants | Intégré en P02 |

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

La [recette navigateur](tests/browser/README.md) utilise les builds web/API et PostgreSQL déjà démarré :

```powershell
.\scripts\courses.cmd run browser:install
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run verify:browser
```

Playwright **1.65.0** est verrouillé ; son Chromium dédié reste dans `.tools/playwright`. Le test utilise par défaut les ports libres **3101/8181**, sans contrôler les onglets personnels. Rapports et captures se trouvent dans [docs/evidence/P01-browser](docs/evidence/P01-browser/README.md). Le focus des contrôles est conservé pendant les requêtes et restauré après une reprise.

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

[VERSIONS.md](docs/VERSIONS.md) distingue versions résolues et CLI shadcn non exécuté. [CONFIGURATION.md](docs/CONFIGURATION.md) précise le chargement, les profils et les secrets ; [SCREENS.md](docs/SCREENS.md) centralise les routes FR/EN.

Les pages de fondation et de démonstration sont non indexables et limitées à `APP_ENV=local|test`. Le profil de production exige une origine publique HTTPS et des cookies sécurisés ; cela ne constitue pas un déploiement. Prix, conditions, médias et accès fournisseurs restent ouverts, sans bloquer le modèle de données P03.

## Examiner les interfaces P02

Le frontend seul suffit pour la vitrine, sans démarrer PostgreSQL ou Spring :

```powershell
.\scripts\courses.cmd ci
.\scripts\courses.cmd run dev:web
```

Arrêter ce lancement avec **Ctrl+C dans son terminal**. Sur http://localhost:3000 :

| Vue locale | Français | Anglais |
| --- | --- | --- |
| Galerie et états | `/fr/dev/components` | `/en/dev/components` |
| Accueil | `/fr/dev/public` | `/en/dev/public` |
| Leçon et atelier | `/fr/dev/learning` | `/en/dev/learning` |
| Administration | `/fr/dev/admin` | `/en/dev/admin` |

Les fixtures sont signalées et séparées. Génération de prompt, saisie, autoévaluation et filtres travaillent dans la page ; aucun enregistrement serveur, rôle administrateur, publication ou achat n’est simulé comme acquis. Recharger/quitter efface le travail local. Les rubriques futures portent « En développement ». Les routes publiques finales du produit ne sont pas activées par cette vitrine ; `/fr` et `/en` conservent la sonde P01.

Recette du build avec le Chromium de test déjà autorisé et installé (fermer d’abord les instances utilisant les ports 3101/8181) :

```powershell
.\scripts\courses.cmd run lint
.\scripts\courses.cmd run typecheck
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run build
.\scripts\courses.cmd run verify:contrast
.\scripts\courses.cmd run verify:design
```

Si Chromium n’est pas installé, `run browser:install` installe la version verrouillée dans `.tools/playwright`. `verify:design` ne télécharge rien : il réserve ses propres serveurs, teste les interfaces, enregistre captures/rapport dans `docs/evidence/P02-browser`, puis vérifie les refus HTTP 404 en modes staging/production et arrête tous ses processus. Cela reste une recette locale du build, sans déploiement. `run verify:browser` conserve les sept scénarios API P01 et nécessite PostgreSQL démarré ainsi que le build API.

Prochain prompt : [prompts/P03_MODELE_DONNEES_API.txt](prompts/P03_MODELE_DONNEES_API.txt).
