# Configuration locale — P01 à P11

Mise à jour : 8 novembre 2026. Les paramètres consommés suivent les modules réellement présents. Le niveau de validation de chaque lot figure dans STATUS et ses preuves ; une configuration préparée ne prouve aucune intégration externe.

## Fichiers et chargement

| Fichier | Usage réel |
| --- | --- |
| `.env.example` | Modèle commun sans secret |
| `.env.local` | Créé par `setup:local`, ignoré ; source locale chargée par `scripts/lib/runtime.mjs` avec `process.loadEnvFile` |
| `apps/web/.env.example` | Sous-ensemble utile à Next ; aucune copie automatique de secrets vers `apps/web` |
| `apps/api/.env.example` | Variables requises par Spring ; profils YAML sans secret dans les ressources |
| `infra/compose/.env.example` | Modèle Compose ; les scripts passent explicitement `.env.local` avec `--env-file` |
| `infra/secrets/s3.local.json` | Identité S3 locale générée, fichier ignoré, montage en lecture seule ; aucun accès anonyme |
| `.tools`, `.runtime` | Outils portables, journaux et suivi des processus ; ignorés par Git |

Le fichier `.env.local` est chargé uniquement si `APP_ENV` est absent ou vaut `local`. Un processus explicitement `test`, `staging` ou `production` doit fournir sa propre configuration et ne récupère jamais les paramètres locaux manquants. En local, les variables déjà présentes dans le processus prennent priorité. Les valeurs réelles ne sont jamais affichées pour prouver leur présence. En CI, le workflow fournit seulement ses paramètres isolés.

## Paramètres consommés

| Groupe | Variables / comportement |
| --- | --- |
| Environnement | `APP_ENV=local\|test\|production`, `APP_PUBLIC_ORIGIN` sans chemin, identifiants, requête ou fragment. Next prévoit aussi `staging`, non recetté dans P01 ; la recette complète sera fixée en P20 |
| Langue | `APP_DEFAULT_LOCALE=fr\|en` pilote la307 de `/`. P16 consomme `APP_PUBLISHED_LOCALES`, liste distincte `fr,en` ou vide ; seule la production peut indexer ces langues. Le défaut de production doit appartenir à la liste non vide. Cette liste ne publie aucun contenu ni ne modifie les langues achetées |
| Recette Next | `STAGING_BASIC_USERNAME` de3–80 caractères ASCII simples et `STAGING_BASIC_PASSWORD` privé de24–256 caractères, sans deux-points/retour ligne. En `APP_ENV=staging`, absence/invalidité produit503, absence/mauvais identifiants401 ; pages, API et assets protégés. Le POST exact du webhook exige toujours sa signature Spring. Variables exclusivement serveur, jamais `NEXT_PUBLIC_*` |
| API | `API_INTERNAL_URL` exclusivement serveur ; navigateur sur `/api/v1` en relatif. En local/test, origines en boucle locale ; frontend et API ne peuvent pas être la même origine interne (boucle de proxy refusée) |
| Timeout | `API_TIMEOUT_MS`, entier de100 à30000, défaut30000. Erreurs proxy502/504, sans URL interne ni exception dans le corps |
| Base | `POSTGRES_HOST/PORT/DB/USER/PASSWORD`, connexion JDBC construite par Spring ; secret généré localement |
| Spring | `SPRING_PROFILES_ACTIVE=local\|test\|production` cohérent avec `APP_ENV`. Le script de démarrage le dérive de `APP_ENV` si absent ; tests avec profil `test` et PostgreSQL isolé |
| Sessions | `SESSION_COOKIE_SECURE=false` en HTTP local ; `true` requis en production. `HttpOnly`, `SameSite=Lax`, `Path=/`. Schéma JDBC migré par Flyway ; initialisation automatique désactivée |
| Schéma | Flyway actif et nettoyage désactivé ; Hibernate `validate`. V001–V012 : sessions, identité, contenu, travail personnel, médias/outbox et commerce ; aucun seed commercial structurel |
| Services | `POSTGRES_PORT`, `MAIL_HTTP_PORT`, `MAIL_SMTP_PORT`, `S3_PORT`, avec défauts 5432/8025/1025/8333 ; publication uniquement sur `127.0.0.1` |
| S3 local | `STORAGE_ENABLED`, endpoints interne/externe, région, identifiants et deux buckets privés ; `storage:setup` les prépare explicitement. Formats, quotas, TTL et cleanup P10 décrits dans DEPLOYMENT ; aucune identité anonyme |
| Emails | `MAIL_MODE`, SMTP local, `NOTIFICATION_OUTBOX_KEY` AES256 et paramètres worker/reprises ; valeurs sensibles serveur uniquement. Mailpit vérifié, livraison Internet non présumée |
| Vidéo | `VIDEO_ENABLED=false` par défaut ; `local-test` réservé à local/test, répertoire privé absolu et import explicite. Aucun fournisseur de production configuré |
| Commerce | `COMMERCE_ENABLED=false`, `COMMERCE_ALLOWED_CURRENCIES=` par défaut ; EUR/USD/GBP supportées explicitement, aucune devise activée implicitement. `COMMERCE_ORDER_TTL=30m`, borne1minute–24heures, seulement préparation sans paiement |

Stripe reste désactivé avant P12 : aucun Checkout ou paiement réussi n’est fourni en P11. Les contrôles de contenu, conditions, montants et droits viennent des services, au-delà des seuls flags. Prix et conditions réels absents bloquent l’offre ; les fixtures navigateur commerce restent dans une base tmpfs dédiée. Voir [DEPLOYMENT](DEPLOYMENT.md) pour les paramètres médias/emails et [API_CONTRACTS](API_CONTRACTS.md) pour les règles commerciales.

## Profils et accès

- **Local** : outils Windows natifs et services Docker Linux sur réseau bridge dédié ; aucune base distante. Les secrets n’appartiennent qu’à ce profil. SMTP Mailpit est publié sur la boucle locale pour la future API email native Windows.
- **Test** : Testcontainers crée un PostgreSQL éphémère distinct ; tests HTTP réels et migrations. La CI possède en plus une base de smoke jetable, distincte des tests et de tout environnement utilisateur.
- **Production** : profil Spring séparé, origine HTTPS et cookies sécurisés obligatoires. Aucun compte connu, aucune donnée de démonstration ou identité Next parallèle. Les pages de fondation Next retournent 404 hors local/test. Ni ce profil ni le build ne valent publication.

Spring contrôle session, permissions et propriété des routes privées ; CSRF reste obligatoire sur les mutations jusqu’à P11. Les lectures publiques et opérations d’identité explicitement autorisées sont listées dans OpenAPI. Réponses privées et erreurs sont `no-store` ; les cookies de session ne sont relayés que vers l’API configurée, jamais vers une URL client ou une redirection externe.

Les scripts ôtent le commutateur hôte `DEBUG` de l’environnement enfant de Spring et passent `--debug=false` ; ils n’en affichent pas la valeur. La télémétrie Next et celle de l’émulateur SeaweedFS local sont désactivées.

La recette navigateur autorisée utilise Playwright 1.65.0. `browser:install` installe explicitement Chromium dans `.tools/playwright` (`PLAYWRIGHT_BROWSERS_PATH`), hors du navigateur personnel. `verify:browser` réserve par défaut 3101/8181 (`BROWSER_WEB_PORT`/`BROWSER_API_PORT`), valide les ports libres et supervise uniquement ses processus. Un IPC local authentifié commande l’arrêt/reprise du seul Spring de test ; aucun endpoint produit de simulation. Rapports et captures vont dans `docs/evidence/P01-browser/<session>`, journaux et manifests de travail dans `.runtime`.

## Rapprochement des remboursements P13

Les exemples conservent `REFUND_WORKER_ENABLED=false`. En développement Stripe TEST, l’activer explicitement dans `.env.local` puis redémarrer Spring permet le rapprochement des événements et opérations. Ce worker ne crée aucun remboursement : ses appels fournisseur sont des GET. Une exécution financière exige une décision autorisée, puis une action opérateur distincte avec CSRF, contexte de compte, ETag et clé d’idempotence.

| Paramètre | Défaut | Rôle |
| --- | --- | --- |
| `REFUND_WORKER_ENABLED` | `false` | Activation du scheduler |
| `REFUND_POLL_DELAY` | `2s` | Intervalle entre passages |
| `REFUND_LEASE_DURATION` | `120s` | Bail de traitement, entre30s et10min |
| `REFUND_RETRY_DELAY` | `10s` | Attente de rapprochement/reprise |
| `REFUND_MAX_ATTEMPTS` | `5` | Tentatives bornées, entre1 et20 |

Le listener local vérifie le même compte TEST, la même version et le même secret privés que Spring ; il reçoit les événements Checkout et `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded`. Un dossier UNKNOWN ou à examiner conserve son montant réservé tant qu’aucun fait certain ne le libère. Aucune durée ou garantie de remboursement bancaire n’est configurée par ce lot. Les liens S3 déjà délivrés expirent selon `ASSET_DOWNLOAD_TTL_SECONDS` (défaut60s, borne1–300s) ; chaque nouvelle délivrance recontrôle les droits.

Dès Stripe activé, le bail doit couvrir `7 × (STRIPE_CONNECT_TIMEOUT + STRIPE_READ_TIMEOUT) + 5s`, même si le scheduler est arrêté : les actions explicites restent possibles. Les sept requêtes couvrent aussi une commande historique sans PaymentIntent local ou une référence de remboursement exigeant une lecture de charge. Les délais par défaut3s+8s demandent82s ; le bail120s convient. Une contradiction fournisseur après confirmation reste à examiner : la réservation déjà close n’est pas réouverte, et le montant historiquement confirmé reste consommé dans le budget.

## Éléments externes encore nécessaires

### Recette et production P20

La configuration déployée utilise `infra/compose/deployment.env.example` et son équivalent staging, distincts du `.env.local` Windows. `WEB_IMAGE` et `API_IMAGE` sont des références de registre par digest ; `APP_PUBLIC_ORIGIN`, langue par défaut et langues publiables sont lues à l’exécution. Aucun domaine de recette ni credential n’est intégré au build. Les exemples `.invalid` et images vides sont refusés jusqu’à renseignement réel.

`SECRETS_DIR` désigne un répertoire Linux absolu privé0700. Fichiers requis : `postgres-admin-password`, `postgres-owner-password`, `postgres-app-password`, `outbox-key` ; ajouter `staging-basic-password` en recette. Valeurs sans retour ligne, au moins24 octets ; outbox :32 octets aléatoires encodés en base64. Les fichiers peuvent être0444 dans ce répertoire0700 pour les UID différents des conteneurs ; les montages sont en lecture seule. Un changement de fichier mot de passe PostgreSQL ne change pas celui d’un rôle déjà créé : appliquer une rotation coordonnée, jamais supprimer le volume.

Le bootstrap PostgreSQL reçoit les mots de passe des rôles ; le migrateur ne reçoit que celui du propriétaire et l’API que celui du rôle applicatif et la clé outbox. Le web reçoit uniquement Basic en staging. Les entrées serveur lisent ces fichiers `/run/secrets/*` sans afficher leur contenu. Compose ne transmet aucune clé Stripe/S3/SMTP par défaut : ces intégrations et tous les workers sont désactivés dans cette candidate privée. L’activation future exige les fournisseurs, secrets limités et décisions commerciales concernés ; elle ne se déduit pas du bon fonctionnement des images. Voir [déploiement](runbooks/deploy.md) et [reprise](runbooks/backup-restore.md).

Domaine, hébergement autorisé, fournisseurs et secrets de recette/production, expéditeur vérifié, contenus et traductions relus, médias annoncés, identité légale, prix et conditions de chaque offre, langues vendues et support. Ces éléments ne bloquent pas les fondations locales ; leur absence interdira de déclarer fonctionnels l’intégration externe ou le lancement correspondant.

Les limites techniques locales de fichiers/notifications sont explicites dans DEPLOYMENT. Durée d’accès, fiscalité, garanties, actualisations et support commerciaux restent à renseigner par offre ; les instantanés de commande conservent les paramètres acceptés, sans constituer une preuve de paiement.
