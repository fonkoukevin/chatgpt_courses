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
| Langue | `APP_DEFAULT_LOCALE=fr\|en` pilote la redirection de `/` ; les deux routes de fondation existent. `APP_PUBLISHED_LOCALES` reste réservé à la publication future, pas à une offre déjà disponible |
| API | `API_INTERNAL_URL` exclusivement serveur ; navigateur sur `/api/v1` en relatif. En local/test, origines en boucle locale ; frontend et API ne peuvent pas être la même origine interne (boucle de proxy refusée) |
| Timeout | `API_TIMEOUT_MS`, entier de 100 à 30000, défaut 5000. Erreurs proxy 502/504, sans URL interne ni exception dans le corps |
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

## Éléments externes encore nécessaires

Domaine, hébergement autorisé, fournisseurs et secrets de recette/production, expéditeur vérifié, contenus et traductions relus, médias annoncés, identité légale, prix et conditions de chaque offre, langues vendues et support. Ces éléments ne bloquent pas les fondations locales ; leur absence interdira de déclarer fonctionnels l’intégration externe ou le lancement correspondant.

Les limites techniques locales de fichiers/notifications sont explicites dans DEPLOYMENT. Durée d’accès, fiscalité, garanties, actualisations et support commerciaux restent à renseigner par offre ; les instantanés de commande conservent les paramètres acceptés, sans constituer une preuve de paiement.
