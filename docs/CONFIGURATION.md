# Configuration préparée par P00

Audit du 7 novembre 2026. Le fichier racine `.env.example` est un inventaire sans secret, pas une configuration exécutée. Ni Next.js, ni Spring, ni Compose ne le chargent actuellement. P01 doit raccorder, valider et tester ces valeurs avant d’en annoncer le fonctionnement.

## Fichiers attendus

| Fichier | Lot et responsabilité |
| --- | --- |
| `.env.example` | P00 : noms communs et valeurs locales non secrètes ; seul exemple créé pour l’instant |
| `.env.local` | P01 : valeurs réelles locales exclues de Git, sans copie dans les preuves |
| `apps/web/.env.example` | P01 : seulement les variables lues par Next, notamment l’adresse API interne serveur ; navigateur sur `/api/v1` en relatif |
| `apps/api/src/main/resources/application.yml` et profils | P01 : mapping explicite vers Spring, validation, séparation local/test/production ; aucun secret versionné |
| `infra/compose/.env.example` et Compose local | P01 : services locaux, ports en boucle locale, volume PostgreSQL nommé et images vérifiées |
| `infra/compose/.env.staging.example`, `.env.production.example` | P20 : paramètres externes, secrets séparés et contrôles avant déploiement |

P01 précisera les chemins et le chargement exacts dans le README : un fichier racine n’est pas automatiquement lu par toutes les applications. Éviter les secrets dupliqués ; une même valeur PostgreSQL doit être mappée vers Compose et Spring par la procédure locale. Les fichiers d’exemple restent synchronisés avec le code qui les consomme.

## Groupes et validation à implémenter

| Groupe | Convention P00 | Règle à vérifier dans le code |
| --- | --- | --- |
| Environnement | `APP_ENV`, `APP_PUBLIC_ORIGIN` | Origine HTTP locale autorisée ; HTTPS réel en recette/production ; pas d’URL arbitraire utilisée comme proxy |
| Langues | `APP_DEFAULT_LOCALE=fr`, `APP_PUBLISHED_LOCALES` vide | FR sert au développement ; `fr` et `en` prévus structurellement. Publication selon contenus prêts et décision commerciale ; pas de lancement FR imposé |
| API | `API_INTERNAL_URL`, `API_PORT` | Variable serveur uniquement ; requêtes navigateur relatives ; préfixe `/api/v1` conservé |
| PostgreSQL | `POSTGRES_HOST/PORT/DB/USER/PASSWORD` | Mot de passe local à générer en P01, jamais dans un log ; construction de la connexion JDBC côté Spring ; utilisateur et base distincts par environnement |
| Schéma | Réglages dans les profils Spring, pas dans le navigateur | Flyway seul chemin de migration ; Hibernate `validate` ; schéma Spring Session versionné via Flyway, initialisation JDBC automatique désactivée |
| Session | `SESSION_COOKIE_SECURE=false` pour HTTP local | `HttpOnly`, `SameSite=Lax`, `Path=/` ; `Secure=true` en HTTPS externe ; session JDBC ; CSRF actif selon le contrat |
| Emails | `MAIL_MODE=local`, hôte et port Mailpit | Aucun relais externe local ; API native Windows : publier SMTP sur `127.0.0.1:1025` et interface sur `127.0.0.1:8025`. Un API conteneurisé pourra utiliser le réseau interne |
| Stockage | `STORAGE_ENABLED=false`, `S3_*` vides | Profil S3 compatible optionnel, image stable à vérifier en P01 ; stockage privé et autorisation côté serveur en P10. Aucun fournisseur de production choisi |
| Stripe | `STRIPE_ENABLED=false`, `STRIPE_MODE=test`, secrets vides | Pas de Checkout tant que mode, clés et offre ne sont pas validés ; compte et webhook de chaque environnement séparés ; clé publique inutile pour le Checkout hébergé initial |
| Vidéo | `VIDEO_ENABLED=false`, fournisseur et secret vides | Texte utilisable ; aucun média ni abonnement supposé. Intégration P10 avec ressources réellement fournies |
| Vente | `COMMERCE_ENABLED=false` | Une activation globale ne suffit pas : offre complète, prix/devise/fiscalité, accès, langues, support et conditions acceptables sont aussi requis |

Les durées de session, quotas, durées de liens, rétention et règles commerciales ne sont pas déduits de ces exemples. Les paramètres métier d’offre appartiendront à la configuration métier versionnée, puis aux instantanés de commande ; ils ne doivent pas devenir des valeurs inventées dans un `.env`.

## Ce qui peut être vérifié localement en P01

Next minimal FR/EN, Spring et sa sonde, proxy de même origine, PostgreSQL et persistance après redémarrage, migrations, builds et test d’intégration PostgreSQL. Mailpit capture les emails localement. S3 local est isolé dans un profil ; aucun service distant payant n’est nécessaire. P01 vérifiera les images et leurs digests, notamment Mailpit, S3 et la convention de volume PostgreSQL 18.

Les ports envisagés `3000`, `8080`, `5432`, `8025`, `1025`, `8333` n’avaient aucun écouteur lors de l’audit ; revérifier avant le démarrage. P00 n’a créé aucun conteneur et n’a testé aucun de ces services applicatifs.

## Ce qui demandera des éléments réels plus tard

Domaine et hébergement autorisés, comptes Stripe et fournisseurs retenus, expéditeur vérifié, stockage et vidéo, contenus et traductions relus, identité de l’exploitant, prix, conditions, langues vendues et capacité de support. Ces absences ne bloquent pas P01 ; elles bloqueront l’intégration externe ou la vente correspondante. Aucun accès fournisseur n’a été présumé, aucun achat ni déploiement n’a été effectué.
