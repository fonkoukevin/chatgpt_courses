# Contrats d’API de référence

Le contrat machine des opérations disponibles est [api/openapi.yaml](api/openapi.yaml), versionné en P03. Le reste de ce document distingue conventions préparées et routes planifiées : une route citée dans une section planifiée n’est pas disponible. Chaque lot complète ensemble OpenAPI, DTO, client, tests et cette référence au moment de son implémentation.

## Conventions communes

- Préfixe `/api/v1`, noms de champs JSON en `camelCase`, enum stables en anglais ; traduction des libellés par le frontend.
- JSON pour requêtes/réponses, sauf connexion `application/x-www-form-urlencoded`, webhook au corps brut et transferts de fichiers documentés.
- UUID transmis comme chaînes ; dates ISO 8601 UTC avec suffixe `Z` ; montants entiers `{ amountMinor, currency }`. Aucune valeur de prix par défaut. Révisions et unités mineures JSON sont bornées à `0..9007199254740991` pour rester exactes en JavaScript ; devise explicite, syntaxe de trois lettres majuscules et liste autorisée vérifiée dans le futur service commercial.
- Valeurs facultatives et `null` définis dans OpenAPI ; éviter les champs dont l’absence change silencieusement une permission.
- Listes paginées et bornées ; le CMS livré utilise `{ items, page, size, total }`, page 0-based et taille maximale 100. Les schémas précisent les paramètres de chaque opération. Recherche et tris ne deviennent jamais du SQL concaténé.
- Ressources privées obtenues depuis l’utilisateur authentifié ; un `userId` envoyé par le client ne détermine pas le propriétaire.
- `401` pour identité requise/expirée, `403` pour permission insuffisante, `404` pour objet absent ou non divulguable, selon politique cohérente documentée. Ces codes ne servent pas à révéler les dossiers d’autrui.
- Erreurs `application/problem+json` : `type`, `title`, `status`, `detail`, `instance`, `code`, `traceId` et éventuellement `fieldErrors`. Les codes pilotent les traductions ; `detail` ne contient ni stack trace, secret, mot de passe, jeton ou donnée privée d’un autre utilisateur.
- Erreurs de validation `400`, conflit métier `409`, révision ancienne `412`, précondition requise `428`, limitation `429` avec indication utile de reprise. `503` exprime un fournisseur indisponible ; aucun remplacement automatique par des données de démo.
- Création `201` avec `Location` lorsque pertinent ; suppression idempotente selon contrat ; mutation `200` avec nouvelle représentation/révision ou `204` lorsque convenu.

## Opérations réellement implémentées — P01/P03

`GET /api/v1/system/health` est public et retourne uniquement `{ "status": "UP" }` après une vraie requête PostgreSQL. Une indisponibilité de la base retourne 503 `application/problem+json`, sans exception ou URL JDBC. La réponse n’est pas mise en cache et ne crée pas de session anonyme.

Une route système absente retourne un vrai 404 Problem. Les erreurs contiennent notamment `status`, `code`, `traceId`, `detail` et `instance`. Le proxy préserve les erreurs de Spring ; sa propre erreur de connexion devient 502/504 `API_UNAVAILABLE`, sans données de remplacement. Aucun autre endpoint métier de ce document n’est annoncé implémenté par P01. Les routes privées sont refusées et CSRF reste actif.

P03 conserve le payload de la sonde et le produit avec un DTO explicite. La sonde reste dans l’OpenAPI, complétée par les opérations d’identité P04, d’édition P05 et de catalogue P06 ci-dessous, sous le serveur de même origine `/api/v1`. `system/unknown` est volontairement absent : c’est une requête de diagnostic vers une route manquante, pas une nouvelle opération. Aucun contrôleur de test n’est livré en production. Son interface technique P01 se trouve désormais dans `/{locale}/dev/foundations`, limitée aux profils local/test ; `/fr` et `/en` servent l’accueil public.

Les composants partagés `Problem`, `FieldError`, UUID, Locale, UtcInstant, Revision, Money et la convention ETag sont définis sans inventer de routes pour les utiliser. Les erreurs utilisent `type: about:blank`, un `traceId` UUID et `Cache-Control: private, no-store`. `fieldErrors`, présent pour une erreur de validation, est une liste `{ field, code, message }`, sans valeur rejetée ni message dynamique contenant une donnée saisie. `code` reste stable pour la traduction ; les détails SQL, exceptions, secrets et graphes JPA restent hors réponse.

| Situation préparée | HTTP | Code |
| --- | --- | --- |
| Validation de DTO/paramètre | 400 | `VALIDATION_FAILED` |
| JSON/type de requête invalide | 400 | `INVALID_REQUEST` |
| Syntaxe If-Match invalide ou limites dépassées | 400 | `INVALID_IF_MATCH` |
| Contrainte/conflit métier | 409 | `CONFLICT` |
| ETag dépassé ou conflit optimiste JPA | 412 | `REVISION_CONFLICT` |
| Précondition de révision absente | 428 | `PRECONDITION_REQUIRED` |

P03 teste ce socle avec des contrôleurs **uniquement dans les sources de test**. P04/P05 l’appliquent aussi aux opérations réelles décrites ci-dessous ; les contrôleurs de test restent exclus de l’application livrée.

Génération reproductible : `npm run api:generate` reconstruit types, SDK et transport dans `apps/web/src/lib/api/generated`. `api:validate` vérifie OpenAPI 3.1 ; `api:check` régénère en temporaire et refuse toute différence, fichier supplémentaire ou empreinte de contrat divergente ; `verify:client` compile puis exécute les tests du wrapper et du SDK. Les commandes Windows exactes sont dans le README. La CI appelle `api:check` et `verify:client` avant la compilation web.

Le wrapper manuscrit `lib/api/client.ts` utilise le SDK généré puis valide les réponses à l’exécution : les types TypeScript seuls ne prouvent pas la validité d’un JSON réseau. Réponse invalide, erreur HTTP structurée et API inaccessible restent distinctes. Le transport reste de même origine, sans cache et sans jeton d’authentification dans le stockage navigateur. L’adaptation stricte des annotations du transport généré est bornée et vérifiée par le script de génération ; les sources générées ne s’éditent pas à la main.

## Révisions et idempotence

Un objet modifiable expose `revision` et `ETag`. Exemple conceptuel : `ETag: "project-<uuid>-r7"`. La modification/suppression utilise `If-Match` avec le tag reçu. La précondition est vérifiée atomiquement avec l’écriture. Un 412 conserve la saisie dans le navigateur et permet de récupérer la version courante ; il n’entraîne pas une nouvelle tentative écrasante. Le frontend associe chaque réponse à sa requête et sa saisie : une réponse ancienne ne remplace pas une révision plus récente et ne marque pas enregistrées des modifications encore locales.

Socle P03 : `EntityTags` construit un tag fort `"{kind}-{uuid}-r{revision}"` ; `kind` doit distinguer les représentations si plusieurs langues/projections ont des octets différents pour la même révision. `RevisionPreconditions` s’utilise **après autorisation et lecture, dans la transaction d’écriture**, avec `@Version`/UPDATE conditionnel au moment de la persistance. Le helper seul n’est pas un verrou.

Les listes If-Match utilisent une comparaison forte et un OU entre tags ; un tag faible ne correspond jamais. La syntaxe entière est vérifiée avant acceptation, même après un tag correspondant. Limites : 4096 caractères et 64 éléments. Header absent/vide ⇒ 428 ; tag valide dépassé/faible ⇒ 412 ; syntaxe invalide ⇒ 400. `*` seul est valide en HTTP pour l’existence, mais ne fournit pas la révision explicite exigée par notre politique d’édition : il reçoit 428. Un mélange `*`/tags est invalide. Les lots d’écriture devront tester le chemin complet transactionnel et la conservation de saisie, sans retry écrasant.

Les créations risquant un doublon, notamment commandes, Checkout et demandes de remboursement, utilisent `Idempotency-Key`. Sa portée comprend utilisateur/opération et empreinte du corps. La même clé/corps retrouve le même résultat ; un autre corps reçoit 409. La base maintient les contraintes durables et la transaction correspondantes. La politique de rétention est documentée. La clé locale ne remplace ni celle du fournisseur ni l’unicité des attributions métier.

## Identité et session — validé localement P04

Ces routes existent dans Spring et dans OpenAPI. Les sept tests HTTP réels PostgreSQL/SMTP, le global de 37 tests Java et les 13 scénarios navigateur E06 ont réussi. Le détail et les limites sont dans [evidence/P04.md](evidence/P04.md). Toutes les routes du tableau ont le préfixe `/api/v1`.

| Méthode et route | Entrée ou résultat | Règle |
| --- | --- | --- |
| `GET /auth/csrf` | `{ token, headerName, parameterName }` | Public, jeton Spring masqué XOR ; `X-CSRF-TOKEN` et `_csrf`, `private, no-store` |
| `POST /auth/register` | `{ email, password, displayName?, locale }` | 201 avec `AuthUser`, rôle LEARNER attribué côté serveur ; aucune connexion automatique |
| `POST /auth/login` | Formulaire URL-encodé `email`, `password` | Filtres Spring, CSRF requis ; rotation de session, 200 avec `AuthUser` ou 401 contrôlé |
| `POST /auth/logout` | Aucun corps | CSRF requis, session invalidée et cookie expiré ; 204 |
| `GET /auth/me` | `AuthUser` | 200 connecté ou 401 ; aucune clé de session dans le corps |
| `POST /auth/password-reset-requests` | `{ email, locale }` | 202 vide, identique pour compte inconnu, désactivé ou quota dépassé ; SMTP local Mailpit |
| `POST /auth/password-resets` | `{ token, newPassword }` | 204 ; jeton opaque à usage unique, empreinte en base ; toutes les sessions du compte révoquées |
| `GET /me/preferences` | `{ id, locale, revision }` et ETag fort | Lecture du propriétaire authentifié et actif |
| `PATCH /me/preferences` | `{ locale }` ; mêmes résultat et ETag actualisé | Propriétaire actif + permission `identity.preferences.write` ; `If-Match` et `@Version` dans la transaction |

`AuthUser` contient exactement `{ id, email, displayName, locale, roles, permissions }` ; `displayName` est nullable. Ces listes sont un instantané serveur pour l’interface, pas une délégation de décision au navigateur. Les DTO n’exposent ni hash, entité JPA, version d’authentification, ni identifiant de session. Les propriétés JSON inconnues, notamment `roles` et `userId` dans une inscription ou une préférence, sont refusées avec 400 `INVALID_REQUEST`. Le formulaire de login accepte uniquement `email`, `password` et l’éventuel paramètre CSRF ; aucun rôle ou propriétaire choisi par le client.

L’email est normalisé par suppression des espaces de bord et passage en minuscules, sans retrait de points ou de suffixe `+`, puis validé et limité à 320 caractères. Nom d’affichage facultatif : 120 caractères au plus ; langue : `fr` ou `en`. Un nouveau mot de passe contient 12 à 128 points de code Unicode et au plus 1024 octets UTF-8. Le serveur utilise l’identifiant d’encodage versionné `{pbkdf2@SpringSecurity_v5_8}` : PBKDF2-HMAC-SHA256, 310000 itérations, sel de 16 octets et sortie de 256 bits. Aucun compte ou mot de passe administrateur par défaut n’est créé.

Spring Session persiste les sessions dans PostgreSQL. Le principal sérialisé contient l’UUID stable et des autorités serveur, sans mot de passe ni hash ; son nom/index JDBC est l’UUID, non l’email. À chaque requête portant une identité authentifiée, Spring recharge état actif, version d’authentification et permissions. Compte désactivé/version périmée ⇒ session invalidée ; permission retirée ⇒ la même session perd l’action protégée. La permission d’écriture des préférences est attribuée au rôle LEARNER de référence ; sa révocation est vérifiée sur la vraie route PATCH, sans endpoint d’administration factice. Les autres routes privées non implémentées restent refusées.

Le cookie `SESSION` est HttpOnly, SameSite=Lax, `Path=/`, sans Domain partagé ; `Secure` provient de la configuration runtime validée. Durée d’inactivité : 30 minutes ; nettoyage JDBC chaque minute. Le profil HTTP local emploie `SESSION_COOKIE_SECURE=false` ; la production exige origine HTTPS et `true`. L’API écoute en boucle locale et `server.forward-headers-strategy=none` : elle ne transforme pas un Host ou un `X-Forwarded-*` arbitraire en origine publique. Les liens de récupération utilisent exclusivement `APP_PUBLIC_ORIGIN`. Le déploiement derrière proxy de confiance reste à recetter dans les lots de livraison.

Le CSRF reste celui du framework : dépôt de jeton en session, chargement différé et masquage XOR/BREACH par défaut. Il protège aussi inscription, login, logout et récupération. Le client garde le jeton uniquement en mémoire et le recharge après connexion, déconnexion, réinitialisation ou réponse 401/403 ; il ne répète jamais automatiquement une mutation. Les réponses d’identité/préférences et les erreurs sont `private, no-store`. Les lectures SSR utilisent l’origine API interne configurée, transmettent uniquement le cookie `SESSION` nécessaire et désactivent le cache partagé.

La demande de récupération a un quota atomique de trois demandes par email normalisé sur une fenêtre de quinze minutes, clé de quota hachée en base ; dépasser ce quota conserve la réponse neutre 202. Le jeton contient 32 octets aléatoires, encodés en 43 caractères base64url ; seule son empreinte SHA-256 est stockée. Échéance : 30 minutes. Émission et consommation verrouillent le compte ; consommation atomique, incrément de la version d’authentification, invalidation des autres jetons et suppression des sessions du compte. Jeton invalide, expiré ou déjà consommé ⇒ 400 `INVALID_RESET_TOKEN`. Une réinitialisation réussie invalide aussi la session courante du navigateur et demande un nouveau CSRF avant login.

La notification est émise après commit et livrée de façon asynchrone au port SMTP local Mailpit. Son URL est `/fr/reinitialisation#token=…` ou `/en/reset-password#token=…`. Le frontend retire le fragment de l’historique et garde le jeton en mémoire, sans URL de requête, log ou stockage navigateur. La livraison P04 est en mémoire : l’outbox durable et la reprise opérationnelle relèvent de P10 ; aucune livraison SMTP externe n’est revendiquée.

Après inscription, la connexion normale réutilise les filtres Spring et la destination locale validée. `returnTo` est une route interne en liste autorisée, sinon le compte courant ; ce n’est pas une URL libre. Un essai anonyme non sensible peut être conservé deux heures dans `sessionStorage`, sans `userId`, puis restauré volontairement. Aucun import serveur vers les futurs projets/méthodes n’est simulé avant leurs services propriétaires. Logout purge les caches personnels de cette application sans supprimer les données du compte ni effacer les autres applications.

Codes P04 : 400 `VALIDATION_FAILED`/`INVALID_REQUEST`/`INVALID_RESET_TOKEN`, 409 `EMAIL_ALREADY_REGISTERED`, 401 `BAD_CREDENTIALS`/`AUTHENTICATION_REQUIRED`/`ACCOUNT_UNAVAILABLE`, 403 `CSRF_INVALID`/`ACCESS_DENIED`, et les codes de révision ci-dessus. Une indisponibilité de vérification de session reste un échec fermé, avec réponse contrôlée 503. Le quota neutre de récupération n’utilise pas le code 429 préparé pour d’autres limitations.

## Éditorial — validé localement P05

Ces routes existent dans Spring, OpenAPI et le client généré. Les sept tests HTTP réels P05, huit tests de services PostgreSQL et cinq scénarios navigateur passent ; le global comporte 52 tests Java réussis. Les résultats et limites sont dans [preuve P05](evidence/P05.md). Toutes les routes suivantes portent le préfixe `/api/v1`.

Un objet CMS `id` est l’UUID d’une traduction et d’une version pédagogique. `resourceId` identifie la ressource stable, `versionId` sa version pédagogique ; ce sont trois concepts distincts. Types : COURSE, MODULE, ACTIVITY, GUIDE, METHOD_TEMPLATE. Le schéma `ContentView` est le document administratif complet ; liste et historique sont paginés `{ items, page, size, total }`, avec page `0..1000000` et taille `1..100` (défauts 0 et 20).

| Méthode et route | Corps/résultat | Permission |
| --- | --- | --- |
| `GET /admin/contents` | Filtres `q` (240 max), `kind`, `state`, `locale`, `courseId`, `verifiedBefore`, `needsUpdate`, `page`, `size` → `ContentPage` | `content.read` |
| `POST /admin/contents` | `CreateContent` → 201 `ContentView`, Location et ETag | `content.write` |
| `GET /admin/contents/{id}` | `ContentView` et ETag | `content.read` |
| `POST /admin/contents/{id}/revisions` | `SaveRevision` → nouvel instantané, même version | `content.write` |
| `POST /admin/contents/{id}/versions` | `NewVersion` → 201 nouveau document/version, même ressource | `content.write` |
| `POST /admin/contents/{id}/duplicate` | `{ slug, title, reason }` → 201 nouvelle identité en brouillon | `content.write` |
| `POST /admin/contents/{id}/translations` | `CreateTranslation` → 201 document de la langue manquante sur la même version | `content.write` |
| `POST /admin/contents/{id}/transition` | `{ state, reason, sourceRevisionId? }`, état TO_REVIEW/READY/STALE | `content.review` pour READY, `content.write` sinon ; service revérifie la cible |
| `POST /admin/contents/{id}/publish` | `{ revisionId, reason }` → révision courante déterminée publiée | `content.publish` |
| `POST /admin/contents/{id}/archive` | `{ reason }` → traduction archivée, historique conservé | `content.archive` |
| `PUT /admin/contents/{id}/composition` | `{ childVersionIds, reason }` → ordre complet du programme non gelé | `content.write` |
| `GET /admin/contents/{id}/readiness` | `{ ready, blockingIssues, warnings, checkedRevision }` | `content.read` |
| `GET /admin/contents/{id}/revisions` | `RevisionPage` ; paramètres page/size | `content.read` |
| `GET /admin/contents/{id}/preview` | Document administratif complet, aperçu privé | `content.read` |
| `GET /admin/contents/{id}/dependencies` | `{ items, canArchive, consequences }` avant archivage | `content.read` |
| `GET /contents/{resourceId}?locale=fr` | `PublicContent` minimal, langue explicite fr/en | Public, selon publication et politique ci-dessous |

Chaque mutation d’un document existant exige CSRF et `If-Match` ; création initiale sans If-Match, avec CSRF. L’ETag fort est `"content-{id}-r{revision}"`. Les mutations verrouillent la famille de ressource et revérifient les permissions après l’attente. Toute mutation de cette famille augmente ses révisions, car les langues liées et le gel font partie de la représentation. Les lectures multi-requêtes sont REPEATABLE_READ pour produire un instantané cohérent. 428 si la précondition manque, 412 si elle est dépassée ; aucun écrasement automatique. Les réponses administratives sont `private, no-store` et `X-Robots-Tag: noindex, nofollow`. `preview=true` sur une URL publique ne donne aucun accès.

`CreateContent` contient `kind`, `locale`, `slug`, `title`, `summary`, `objectives`, `evaluationDefinition`, `document`, `childVersionIds`, `reason`. `SaveRevision` contient `title`, `summary`, `document`, `reason`. `NewVersion` ajoute à ces champs les objectifs/évaluation canoniques et les versions enfants. `CreateTranslation` exige texte/document fournis explicitement, langue et slug ; aucune traduction automatique n’est présumée. Acteur, états de disponibilité des médias, pointeurs de publication, rôles et propriétaires ne sont jamais choisis par un corps client. Propriétés inconnues, nulls requis et décimaux à la place d’entiers sont refusés.

`ContentDocument` porte objectif traduit, résultat attendu, prérequis, blocs, durée facultative, exercice/corrigé, quiz, grille, accès FREE/PROTECTED, références médias et ressources liées. Les blocs HEADING/PARAGRAPH/LIST/CALLOUT/CODE/LINK sont du texte brut, jamais du HTML/MDX exécuté. Les liens acceptent HTTPS sans identifiants ou un chemin interne simple ; `javascript:`, chemins réseau `//` et caractères de contrôle sont refusés. Les médias sont `{ assetId, kind, required, label }`, sans URL libre ni booléen « disponible » fourni par le client. P10 n’a pas encore de registre : une référence requise non vérifiée bloque la publication ; une référence facultative émet un avertissement.

Les limites exactes figurent dans OpenAPI et sont recontrôlées dans le service : document 48 KiB UTF-8 au total, requête 64 KiB au relais ; titre 240, résumé 2000, raison 1000, objectifs/évaluation 4000 ; 60 blocs de 4000 caractères, 20 prérequis, 20 quiz avec 2..8 options, 30 critères, 20 médias, 30 références et 100 enfants au plus. Les clés de quiz/grille sont uniques et leurs points bornés ; une durée renseignée vaut 1..1440 minutes. La création d’un champ de durée ne signifie pas qu’une estimation réelle a été mesurée.

Cycle : DRAFT → TO_REVIEW → READY → PUBLISHED. READY enregistre une vraie action de revue, sa date et sa révision ; publier recontrôle readiness, revue et permission dans la transaction. Une correction ajoute un instantané append-only, revient DRAFT et garde l’ancienne publication accessible jusqu’à une nouvelle publication explicite. Modifier objectif ou évaluation d’une pédagogie gelée exige une nouvelle version (409 `NEW_PEDAGOGICAL_VERSION_REQUIRED`). Un parent ne se publie qu’avec ses enfants publiés dans la langue et leurs versions gelées. L’archive conserve instantanés, origines et dépendances ; aucune suppression physique d’historique n’est exposée.

Une traduction liée conserve sa révision source d’origine et sa révision source effectivement revue. Lors d’une nouvelle revue, `sourceRevisionId` doit désigner la `currentRevisionId` actuelle du document source ; l’origine historique homonyme ne la remplace pas. Une modification de source rend les traductions dépendantes STALE. La revue vérifie aussi l’équivalence des clés/points/options/index de réponse/grille ; les textes peuvent être localisés. READY est bloqué par `TRANSLATION_ASSESSMENT_MISMATCH` si l’évaluation diffère, plutôt que d’annoncer une équivalence pédagogique inexistante.

Les anciens instantanés P03 restent lisibles : `ContentView.document`/`RevisionView.document` peuvent valoir `null`, avec `legacyBody` privé contenant le texte historique. `STRUCTURED_DOCUMENT_REQUIRED` empêche leur publication jusqu’à une nouvelle révision structurée explicite. Aucun texte historique n’est écrasé ou présenté automatiquement comme prêt.

`PublicContent` est une projection minimale pour les lots consommateurs, pas le catalogue P06. Elle sélectionne la version publiée courante puis la langue demandée, sans retour silencieux à une ancienne version/langue. Brouillon, langue absente ou archive ⇒ 404. Une traduction STALE reste explicite, avec `document:null`. FREE/PUBLISHED peut fournir un `PublicDocument` distinct, sans `correction`, `correctOption` ni `explanation` ; exercice limité aux instructions et quiz aux questions/options/points. PROTECTED fournit seulement les métadonnées publiées et `document:null`, même avec une session EDITOR sur cette route publique. Aucun texte premium n’est envoyé puis masqué, et publier ne crée ni offre, prix, achat ou droit.

Autres codes P05 : 409 `CONTENT_NOT_READY`/`INVALID_CONTENT_TRANSITION`, 400 `VALIDATION_FAILED`/`INVALID_REQUEST`, ainsi que les erreurs communes de permission, conflit et révision. Le rôle de référence EDITOR reçoit les cinq permissions de contenu, sans compte livré ni permission commerciale. Le refus d’une route commerciale future par `denyAll` reste une preuve partielle, pas un test d’un service financier déjà intégré.

## Catalogue public et lecture — implémenté P06, recette navigateur en cours

Le contrat P06 décrit uniquement les cinq lectures réelles suivantes et l’extension éditoriale de métadonnées. Les six tests HTTP PostgreSQL et les six tests de service P06 ont réussi ; le global final et la recette navigateur sont suivis séparément dans [evidence/P06.md](evidence/P06.md). Aucune validation navigateur n’est déduite de la génération ou d’un test de service.

| Méthode et route | Fonction |
| --- | --- |
| `GET /catalog` | `CatalogueQuery` → `{ items, page, pageSize, total }` de `ResourceCard` publiées et disponibles |
| `GET /catalog/facets?locale=fr` | Types, tâches, niveaux, accès et langues réellement représentés dans les publications |
| `GET /catalog/resources/{resourceId}?locale=fr` | `ResourceDetail` de la dernière version globalement publiée ou état de langue/retrait explicite |
| `GET /catalog/by-slug/{kind}/{slug}?locale=fr` | Résolution stricte type + langue + slug vers cette identité publiée |
| `GET /catalog/resources/{resourceId}/versions/{versionId}?locale=fr` | Détail de la version exacte appartenant à cette ressource ; notamment activité épinglée d’un programme |
| `PUT /admin/contents/{id}/metadata` | `{ metadata: PublicMetadata, reason }` → nouvelle révision `ContentView` et ETag ; CSRF, If-Match et `content.write` |

Le préfixe de toutes ces routes est `/api/v1`. `locale=fr|en` est obligatoire ; les lectures publiques n’utilisent ni cookie, ni rôle, ni préférence personnelle. Aucun endpoint séparé `/courses/...`, `/guides/...`, `/activities/...` ou `/method-templates/...` n’est inventé pour doubler ces lectures : le type du détail réel distingue ces ressources. L’activité textuelle fonctionne avec la route de version exacte ; progression, tentatives, droits privés et projets restent à leurs lots.

`q` (240 caractères au plus) cherche titre, résumé, slug et objectif dans la révision publiée, jamais dans un nouveau brouillon. Filtres combinables : `type=COURSE|ACTIVITY|GUIDE|METHOD_TEMPLATE`, `goal`, `level=BEGINNER|INTERMEDIATE|ADVANCED`, `access=FREE|PROTECTED`, langue ; MODULE demeure un nœud de programme. Tâches stables : `understand-brief`, `define-scope`, `prepare-prompt`, `build-proposal`, `check-output`, `reuse-method`. Elles sont issues du dossier de référence ; une facette n’apparaît qu’avec un nombre réel de publications disponibles. Page 0-based `0..1000000`, `pageSize=1..100` (défaut 20). Tri `TITLE` par titre normalisé puis resourceId, ou `RECENT` par date réelle d’événement de publication décroissante puis resourceId ; date historique inconnue placée à la fin, sans date inventée.

`ResourceCard` expose identités/version/révision publiées, langue/slug, titre/résumé, objectif/résultat attendu, durée facultative, accès, tâches/niveau et date de revue publiée. Aucun auteur privé, email, rôle, définition canonique d’évaluation ou texte personnel. Une identité/langue n’apparaît qu’une fois, dans la dernière version globalement publiée ; brouillons, archives et traductions dépassées sont exclus côté serveur.

`ResourceDetail` distingue `PUBLISHED`, `MISSING_TRANSLATION`, `STALE`, `WITHDRAWN`. Une identité sans publication est 404 ; une publication connue sans traduction ou retirée conserve ses UUID et les états des langues équivalentes, sans emprunter un titre ou un corps à une autre langue/version. Le slug est localisé ; le changement de langue utilise les identifiants équivalents, pas une substitution textuelle de slug. Une traduction dépassée ne fournit aucun document. La revue d’un prochain brouillon ne modifie ni la date de revue publique ni la source publiquement examinée : ces valeurs sont capturées seulement lors de la publication explicite. Passer une traduction de STALE à READY ne la republie pas.

Pour FREE/PUBLISHED, `document` est le `PublicDocument` expurgé P05 : aucun `correction`, `correctOption` ou `explanation`. Pour PROTECTED, il vaut `null`, même si le demandeur possède une session EDITOR ; seuls objectif, résultat attendu, prérequis, durée et métadonnées explicitement publics sont présents. La description publique de vérification est `metadata.evaluationDescription`, jamais `evaluationDefinition` canonique. Le programme contient des nœuds récursifs de métadonnées seulement ; chaque `versionId` est exactement la `version_compositions.child_version_id` enregistrée dans son parent. Une nouvelle version d’activité ne remplace donc pas silencieusement celle d’un ancien programme. Les liens E10 transmettent la version du parcours et celle de l’activité ; le serveur Next vérifie leur appartenance puis demande la version exacte à Spring.

`PublicMetadata` contient `goalCodes`, `level`, `audience`, `tools`, `sources`, `faq`, `evaluationDescription`. V005 l’attache à une révision dans une table append-only ; les anciens instantanés reçoivent un objet vide explicite, niveau/description de vérification `null`. `ContentView` et `RevisionView` privés portent aussi ce snapshot. PUT metadata crée un nouveau brouillon à texte/identité/version conservés ; l’ancienne publication garde ses métadonnées jusqu’à revue et publication. Une simple correction conserve les métadonnées ; duplication/nouvelle version recopient leur source en brouillon, traduction initiale vide pour éviter une fausse traduction. Le document historique doit être converti explicitement avant cette action.

Limites : métadonnées 16 KiB UTF-8 ; six tâches sans doublons, dix publics/outils, vingt sources, douze FAQ ; publics 500 caractères, nom d’outil 120, libellé de source 240, question 500, réponse 2000, modalités publiques 4000. URL facultative d’outil ou obligatoire de source : 2000 caractères, HTTPS sans credentials ou chemin interne simple ; pas d’URL téléchargée côté serveur. Champs inconnus et valeurs invalides sont refusés, permission et précondition revérifiées en transaction. Les textes sont échappés, pas du HTML libre.

P06 utilise **`Cache-Control: no-store`**, lectures SSR de l’origine interne configurée sans cookie et fetch navigateur `credentials: omit`. Aucun cache public dépendant d’une session et aucune invalidation supposée implémentée. Les métadonnées préparent canonical et équivalents publiés, mais les pages restent **noindex/nofollow jusqu’à P16**. Les erreurs de base/transaction deviennent 503 `SERVICE_UNAVAILABLE` contrôlé ; 200 vide reste un vrai zéro résultat, sans faux catalogue de remplacement.

Avant P11/P12, aucune offre, aucun prix, achat, état « déjà acquis » ou paiement ne sont fournis par ce contrat. La décision privée d’accès futur est distincte de ces projections ; ses motifs préparés (`AUTH_REQUIRED`, `OFFER_REQUIRED`, `ACCESS_EXPIRED`, etc.) ne sont pas des droits P06 déjà intégrés. Le signalement UI conserve resourceId/versionId/revisionId/langue et permet une copie ; aucun faux endpoint ni message « envoyé » avant le service de support.

## Apprentissage, projets et méthodes — planifié P07–P09

| Méthode et route | Fonction et contrôle |
| --- | --- |
| `GET /me/learning` | Reprise, parcours, progression distincte des évaluations et méthodes récentes |
| `POST /me/enrollments` | Commencer un parcours accessible, sans doubler une inscription existante |
| `PUT /me/activity-progress/{activityId}` | Déclaration d’une activité terminée ; validation de l’activité et prérequis côté serveur |
| `PUT /me/media-progress/{mediaId}` | Position propre à ce média ; durée/bornes vérifiées, sans transposition FR/EN |
| `POST /activities/{activityId}/quiz-attempts` | Réponses et version ; correction calculée côté serveur, tentative et langue conservées |
| `GET /me/projects` / `POST /me/projects` | Liste du propriétaire ; création à partir d’une activité/version accessible |
| `GET/PATCH /me/projects/{projectId}` | Texte structuré, état et révision ; `If-Match` sur sauvegarde |
| `GET /me/projects/{projectId}/revisions` | Historique privé, pagination et contenu accessible au propriétaire |
| `POST /me/projects/{projectId}/self-assessments` | Révision de production, grille/version et vérifications déclarées ; score calculé mais identifié comme déclaré |
| `POST /activities/{activityId}/solution-reveals` | Action volontaire/tentative préalable selon activité ; consultation tracée sans validation du projet |
| `GET/POST /me/methods` | Bibliothèque et création d’une copie avec texte indépendant et origine |
| `GET/PATCH/DELETE /me/methods/{methodId}` | Propriété, révision, confirmation UI de suppression ; aucune mutation du modèle source |
| `POST /me/methods/{methodId}/duplicates` | Nouvelle copie privée avec identifiant différent |
| `GET /me/methods/{methodId}/source-update` | Différence/version source et possibilité explicite de créer une nouvelle copie |

Les notes d’activité peuvent avoir des endpoints dédiés `/me/activity-notes/{activityId}` avec les mêmes conventions de propriétaire et révision. Documenter le format exact avant de connecter leur éditeur. Le générateur de prompts assemble localement ou côté serveur des données structurées ; il n’appelle pas un modèle IA par défaut.

Les résultats de quiz, autoévaluations et futures revues humaines ont des types distincts. Un DTO d’évaluation contient au minimum `method`, `projectRevisionId`, `rubricVersionId`, `score`, `blockingIssues`, `evaluatedAt`, `evaluatorId?`, `declaredByUser`. La revue humaine reste désactivée tant que le service commercial n’existe pas.

## Fichiers et vidéo — planifié P10

| Méthode et route | Fonction |
| --- | --- |
| `POST /me/projects/{projectId}/upload-intents` | Autoriser un dépôt selon activité, taille et formats, générer une clé objet serveur |
| `POST /me/projects/{projectId}/attachments` | Confirmer le transfert ; le serveur vérifie existence, taille, type et état de validation avant de l’utiliser |
| `POST /assets/{assetId}/download-access` | Vérifier propriétaire/droit/publication puis délivrer un accès temporaire |
| `POST /media/{mediaId}/playback-access` | Même vérification pour le média premium et le fournisseur configuré |

Le navigateur ne choisit pas une clé de bucket arbitraire ni une URL externe à récupérer. Aucune présignature n’autorise implicitement tous les fichiers du même compte. Les URLs temporaires et jetons de lecture sont exclus des logs et caches publics. En cas de révocation, un nouvel accès est refusé ; un lien précédemment délivré suit sa durée de validité.

## Offres, commandes, Stripe et remboursements — planifié P11–P13

| Méthode et route | Entrée ou résultat |
| --- | --- |
| `GET /offers/{offerId}?locale=fr` | Offre publique, révision, conditions, total applicable ou raisons d’indisponibilité |
| `POST /me/orders` | `{ offerId, offerRevision, locale }`, clé d’idempotence ; récapitulatif calculé et instantané côté serveur |
| `GET /me/orders` | Liste paginée des commandes du propriétaire |
| `GET /me/orders/{orderId}` | Instantané, montants, paiement, remboursement, activation, droits et actions disponibles |
| `POST /me/orders/{orderId}/checkout` | `{ acceptedTermsVersion }`, `If-Match` et clé d’idempotence ; Checkout créé depuis l’instantané serveur valide et les conditions explicitement acceptées |
| `POST /webhooks/stripe` | Corps brut et `Stripe-Signature` ; aucune session utilisateur ni prix fourni par le navigateur |
| `GET /me/entitlements` | Origines d’accès et périodes présentables au propriétaire |
| `POST /me/orders/{orderId}/refund-requests` | Motif et lignes demandées ; demande utilisateur, sans exécution automatique d’un remboursement |
| `GET /me/refund-requests/{requestId}` | État réel et historique compréhensible au propriétaire |

La réponse de commande distingue `orderStatus`, `paymentStatus`, `fulfillmentStatus`, `refundSummary` et `effectiveAccess`. `fulfillmentStatus` peut être `NOT_READY`, `PENDING`, `READY`, `RETRYING` ou `NEEDS_REVIEW` ; ces états opérationnels ne modifient pas artificiellement le paiement. L’URL de retour ne suffit jamais à produire `READY`.

Les champs exacts d’un instantané incluent `offerId`, `offerRevision`, lignes/ressources couvertes, titres affichés à l’achat, langues incluses, prix/devise, total, règles d’accès et d’actualisation, support annoncé, date et référence des conditions acceptées lorsqu’elles sont configurées. Le serveur compare `acceptedTermsVersion` à la version présentée et enregistre l’action d’acceptation, sans la déduire d’une visite. Les conditions juridiques ne sont pas inventées par Codex.

La page de retour interroge la commande propriétaire avec une attente bornée et propose ensuite un retour au compte. Elle n’interroge pas Stripe directement avec une clé secrète. Une commande à état ambigu ne déclenche pas automatiquement une deuxième tentative payante.

## Administration commerciale et exploitation — planifiées P11–P15

Les routes `/admin/**` exigent des permissions précises. Les permissions affichées au client facilitent l’interface ; elles ne dispensent pas des contrôles Spring sur chaque opération.

| Groupe de routes | Opérations |
| --- | --- |
| `/admin/offers` et `/{id}/readiness` | Offres, prix, inclusions, conditions et bloqueurs commerciaux |
| `/admin/offers/{id}/activate` / `deactivate` | Vente active distincte de publication ; audit et révision |
| `/admin/orders/{id}` | Consultation opérationnelle et origine des droits |
| `/admin/orders/{id}/reconciliation-requests` | Reprise du rapprochement réel, pas bouton « marquer payé » |
| `/admin/refund-requests/{id}/decision` | Décision explicite : montant, lignes, effet d’accès et motif |
| `/admin/refunds` | Exécution autorisée d’une décision, idempotence et rapprochement fournisseur |
| `/admin/incidents` et `/{id}/retry` | Emails, événements et traitements échoués, reprise contrôlée |
| `/admin/support-tickets` | Statut, contexte, réponses et permissions limitées |
| `/admin/audit` / `/admin/metrics` | Événements minimisés, filtres, définitions et agrégations |

Une réponse de `readiness` contient `{ ready, blockingIssues, warnings, checkedRevision }`. Chaque problème indique un `code`, le champ ou la ressource et une action de correction. Le serveur revérifie les conditions lors de la publication/activation ; la réponse précédente ne vaut pas permission permanente.

## Contrat et tests

P03 livre le contrat machine et les commandes de validation/génération avec des outils compatibles avec TypeScript 6 ; P04/P05/P06 les étendent aux routes réelles d’identité, CMS et catalogue public. La CI est configurée pour ces commandes ; une exécution GitHub n’est pas présumée. Les DTO exposés ne sont jamais des entités JPA brutes. Les modèles et FK actuels/futurs sont précisés dans [DATA_MODEL.md](DATA_MODEL.md), les résultats réellement observés dans [evidence/P03.md](evidence/P03.md), [evidence/P04.md](evidence/P04.md), [evidence/P05.md](evidence/P05.md) et [evidence/P06.md](evidence/P06.md).

Chaque lot qui ajoute une route fournit des tests sur le backend réel pour ses invariants, puis met à jour le client et les écrans. Les états de facture, remboursement ou autorisation ne sont jamais inventés uniquement pour faire passer un test d’interface.

Références de sécurité et de paiement : consulter les liens officiels de `docs/ARCHITECTURE.md` pour la version utilisée. `docs/ACCEPTANCE.md` relie les contrats aux scénarios T01–T20 et complète les preuves au fil de leur exécution.
