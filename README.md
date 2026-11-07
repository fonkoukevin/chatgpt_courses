# ChatGPT Courses

Plateforme de formation pratique à l’IA : choisir une tâche, apprendre, produire un livrable, le vérifier et conserver une méthode personnelle. Le périmètre comprend un site public, un espace apprenant et une administration, avec une structure français/anglais.

## État réel

P00 est un audit du kit de références. Aucune application, dépendance installée, base de données ou interface fonctionnelle n’est livrée à ce stade. Aucun ancien prototype n’est repris comme base validée. Le dossier n’est pas encore un dépôt Git ; aucun historique, branche ou commit n’est disponible.

Lire [AGENTS.md](AGENTS.md), puis [docs/STATUS.md](docs/STATUS.md). Les constats et vérifications sont dans [docs/evidence/P00.md](docs/evidence/P00.md).

## Structure retenue

| Chemin | Rôle | Présence après P00 |
| --- | --- | --- |
| `apps/web` | Next.js App Router, TypeScript, Tailwind, shadcn/Radix | À créer en P01 |
| `apps/api` | Java 21, Spring Boot modulaire, PostgreSQL/JPA/Flyway | À créer en P01 |
| `infra` | Compose local puis entrée Caddy et déploiement | À créer en P01 et lots de livraison |
| `scripts` | Opérations et vérifications adaptées à l’environnement | À créer en P01 |
| `docs` | Contrat produit, décisions, suivi et preuves | Présent |
| `prompts` | Lots P00–P23 et prompts de reprise | Présent |
| `references` | Tokens de référence pour P02 | Présent |

Une seule origine publique ; `/api/v1` est servi par Spring. Spring reste l’autorité pour l’identité, les permissions, les achats, les droits et la progression. Sessions JDBC, CSRF et absence de cache partagé pour les données privées sont obligatoires. Le générateur prépare du texte sans API IA payante.

## Préparation de P01

Mode retenu : outils Node et Java natifs Windows, PowerShell 5.1, services Linux dans Docker Desktop. `npm.cmd` fonctionne ; le lanceur `npm.ps1` est bloqué par la politique PowerShell actuelle. Aucun changement de politique système n’est nécessaire. WSL n’est pas le shell de développement retenu.

- [docs/VERSIONS.md](docs/VERSIONS.md) fixe les versions proposées et leurs sources officielles. Leur installation et leur verrouillage restent à effectuer en P01.
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) décrit les exemples attendus ; [.env.example](.env.example) ne contient aucun secret et n’est encore consommé par aucune application.
- [docs/SCREENS.md](docs/SCREENS.md) centralise les routes FR/EN et leur identité indépendante des slugs.

Aucune commande de démarrage ou de test applicatif n’existe encore. P01 créera les scripts, un seul `package-lock.json` à la racine et le Maven Wrapper, puis documentera les commandes réellement exécutées. Les prix, conditions d’accès, médias et fournisseurs externes restent à renseigner ; cela ne bloque pas les fondations locales.

Prochain prompt : [prompts/P01_FONDATIONS_LOCALES.txt](prompts/P01_FONDATIONS_LOCALES.txt).
