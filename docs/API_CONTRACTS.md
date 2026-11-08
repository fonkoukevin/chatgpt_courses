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

P03 conserve le payload de la sonde et le produit avec un DTO explicite. La sonde reste dans l’OpenAPI, complétée par les opérations d’identité P04, d’édition P05, de catalogue P06, de méthodes P07 et d’apprentissage P08 ci-dessous, sous le serveur de même origine `/api/v1`. `system/unknown` est volontairement absent : c’est une requête de diagnostic vers une route manquante, pas une nouvelle opération. Aucun contrôleur de test n’est livré en production. Son interface technique P01 se trouve désormais dans `/{locale}/dev/foundations`, limitée aux profils local/test ; `/fr` et `/en` servent l’accueil public.

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

P04 utilisait une livraison asynchrone en mémoire. P10 la remplace par une insertion d’outbox dans la transaction qui crée le jeton, puis un worker SMTP après commit ; la récupération reste neutre. Son URL demeure `/fr/reinitialisation#token=…` ou `/en/reset-password#token=…`. Le frontend retire le fragment de l’historique et garde le jeton en mémoire, sans URL de requête, log ou stockage navigateur. Les garanties et limites SMTP/outbox sont décrites ci-dessous ; aucune livraison SMTP externe n’est revendiquée.

Après inscription, la connexion normale réutilise les filtres Spring et la destination locale validée. `returnTo` est une route interne en liste autorisée, sinon le compte courant ; ce n’est pas une URL libre. Un essai anonyme non sensible peut être conservé deux heures dans `sessionStorage`, sans `userId`, puis restauré volontairement. P07 ajoute l’import explicite vers les méthodes personnelles décrit ci-dessous ; aucun service de projets P09 n’est simulé. Logout purge les caches personnels de cette application sans supprimer les données du compte ni effacer les autres applications.

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

`ContentDocument` porte objectif traduit, résultat attendu, prérequis, blocs, durée facultative, exercice/corrigé, quiz, grille, accès FREE/PROTECTED, références médias et ressources liées. Les blocs HEADING/PARAGRAPH/LIST/CALLOUT/CODE/LINK sont du texte brut, jamais du HTML/MDX exécuté. Les liens acceptent HTTPS sans identifiants ou un chemin interne simple ; `javascript:`, chemins réseau `//` et caractères de contrôle sont refusés. Les médias sont `{ assetId, kind, required, label }`, sans URL libre ni booléen « disponible » fourni par le client. P10 branche le registre FILE/IMAGE serveur ; une référence requise non vérifiée bloque toujours la publication, une référence facultative émet un avertissement. Le raccordement vidéo est suivi séparément ci-dessous.

Les limites exactes figurent dans OpenAPI et sont recontrôlées dans le service : document 48 KiB UTF-8 au total, requête 64 KiB au relais ; titre 240, résumé 2000, raison 1000, objectifs/évaluation 4000 ; 60 blocs de 4000 caractères, 20 prérequis, 20 quiz avec 2..8 options, 30 critères, 20 médias, 30 références et 100 enfants au plus. Les clés de quiz/grille sont uniques et leurs points bornés ; une durée renseignée vaut 1..1440 minutes. La création d’un champ de durée ne signifie pas qu’une estimation réelle a été mesurée.

Cycle : DRAFT → TO_REVIEW → READY → PUBLISHED. READY enregistre une vraie action de revue, sa date et sa révision ; publier recontrôle readiness, revue et permission dans la transaction. Une correction ajoute un instantané append-only, revient DRAFT et garde l’ancienne publication accessible jusqu’à une nouvelle publication explicite. Modifier objectif ou évaluation d’une pédagogie gelée exige une nouvelle version (409 `NEW_PEDAGOGICAL_VERSION_REQUIRED`). Un parent ne se publie qu’avec ses enfants publiés dans la langue et leurs versions gelées. L’archive conserve instantanés, origines et dépendances ; aucune suppression physique d’historique n’est exposée.

Une traduction liée conserve sa révision source d’origine et sa révision source effectivement revue. Lors d’une nouvelle revue, `sourceRevisionId` doit désigner la `currentRevisionId` actuelle du document source ; l’origine historique homonyme ne la remplace pas. Une modification de source rend les traductions dépendantes STALE. La revue vérifie aussi l’équivalence des clés/points/options/index de réponse/grille ; les textes peuvent être localisés. READY est bloqué par `TRANSLATION_ASSESSMENT_MISMATCH` si l’évaluation diffère, plutôt que d’annoncer une équivalence pédagogique inexistante.

Les anciens instantanés P03 restent lisibles : `ContentView.document`/`RevisionView.document` peuvent valoir `null`, avec `legacyBody` privé contenant le texte historique. `STRUCTURED_DOCUMENT_REQUIRED` empêche leur publication jusqu’à une nouvelle révision structurée explicite. Aucun texte historique n’est écrasé ou présenté automatiquement comme prêt.

`PublicContent` est une projection minimale pour les lots consommateurs, pas le catalogue P06. Elle sélectionne la version publiée courante puis la langue demandée, sans retour silencieux à une ancienne version/langue. Brouillon, langue absente ou archive ⇒ 404. Une traduction STALE reste explicite, avec `document:null`. FREE/PUBLISHED peut fournir un `PublicDocument` distinct, sans `correction`, `correctOption` ni `explanation` ; exercice limité aux instructions et quiz aux questions/options/points. PROTECTED fournit seulement les métadonnées publiées et `document:null`, même avec une session EDITOR sur cette route publique. Aucun texte premium n’est envoyé puis masqué, et publier ne crée ni offre, prix, achat ou droit.

Autres codes P05 : 409 `CONTENT_NOT_READY`/`INVALID_CONTENT_TRANSITION`, 400 `VALIDATION_FAILED`/`INVALID_REQUEST`, ainsi que les erreurs communes de permission, conflit et révision. Le rôle de référence EDITOR reçoit les cinq permissions de contenu, sans compte livré ni permission commerciale. Le refus d’une route commerciale future par `denyAll` reste une preuve partielle, pas un test d’un service financier déjà intégré.

## Catalogue public et lecture — validé localement P06

Le contrat P06 décrit les cinq lectures réelles suivantes et l’extension éditoriale de métadonnées. Six tests HTTP PostgreSQL, six tests de service, le global de 65 tests Java et six scénarios navigateur ont réussi ; 35 captures finales ont été examinées. Résultats et limites dans [evidence/P06.md](evidence/P06.md).

| Méthode et route | Fonction |
| --- | --- |
| `GET /catalog` | `CatalogueQuery` → `{ items, page, pageSize, total }` de `ResourceCard` publiées et disponibles |
| `GET /catalog/facets?locale=fr` | Types, tâches, niveaux, accès et langues réellement représentés dans les publications |
| `GET /catalog/resources/{resourceId}?locale=fr` | `ResourceDetail` de la dernière version globalement publiée ou état de langue/retrait explicite |
| `GET /catalog/by-slug/{kind}/{slug}?locale=fr` | Résolution stricte type + langue + slug vers cette identité publiée |
| `GET /catalog/resources/{resourceId}/versions/{versionId}?locale=fr` | Détail de la version exacte appartenant à cette ressource ; notamment activité épinglée d’un programme |
| `PUT /admin/contents/{id}/metadata` | `{ metadata: PublicMetadata, reason }` → nouvelle révision `ContentView` et ETag ; CSRF, If-Match et `content.write` |

Le préfixe de toutes ces routes est `/api/v1`. `locale=fr|en` est obligatoire ; les lectures publiques n’utilisent ni cookie, ni rôle, ni préférence personnelle. P06 ne crée pas d’alias `/courses/...`, `/guides/...` ou `/activities/...` : le type du détail réel distingue ces ressources. P07 ajoute une lecture réelle de définition de méthode, distincte du détail d’article, ci-dessous. L’activité textuelle fonctionne avec la route de version exacte ; progression, tentatives, droits privés et projets restent à leurs lots.

`q` (240 caractères au plus) cherche titre, résumé, slug et objectif dans la révision publiée, jamais dans un nouveau brouillon. Filtres combinables : `type=COURSE|ACTIVITY|GUIDE|METHOD_TEMPLATE`, `goal`, `level=BEGINNER|INTERMEDIATE|ADVANCED`, `access=FREE|PROTECTED`, langue ; MODULE demeure un nœud de programme. Tâches stables : `understand-brief`, `define-scope`, `prepare-prompt`, `build-proposal`, `check-output`, `reuse-method`. Elles sont issues du dossier de référence ; une facette n’apparaît qu’avec un nombre réel de publications disponibles. Page 0-based `0..1000000`, `pageSize=1..100` (défaut 20). Tri `TITLE` par titre normalisé puis resourceId, ou `RECENT` par date réelle d’événement de publication décroissante puis resourceId ; date historique inconnue placée à la fin, sans date inventée.

`ResourceCard` expose identités/version/révision publiées, langue/slug, titre/résumé, objectif/résultat attendu, durée facultative, accès, tâches/niveau et date de revue publiée. Aucun auteur privé, email, rôle, définition canonique d’évaluation ou texte personnel. Une identité/langue n’apparaît qu’une fois, dans la dernière version globalement publiée ; brouillons, archives et traductions dépassées sont exclus côté serveur.

`ResourceDetail` distingue `PUBLISHED`, `MISSING_TRANSLATION`, `STALE`, `WITHDRAWN`. Une identité sans publication est 404 ; une publication connue sans traduction ou retirée conserve ses UUID et les états des langues équivalentes, sans emprunter un titre ou un corps à une autre langue/version. Le slug est localisé ; le changement de langue utilise les identifiants équivalents, pas une substitution textuelle de slug. Une traduction dépassée ne fournit aucun document. La revue d’un prochain brouillon ne modifie ni la date de revue publique ni la source publiquement examinée : ces valeurs sont capturées seulement lors de la publication explicite. Passer une traduction de STALE à READY ne la republie pas.

Pour FREE/PUBLISHED, `document` est le `PublicDocument` expurgé P05 : aucun `correction`, `correctOption` ou `explanation`. Pour PROTECTED, il vaut `null`, même si le demandeur possède une session EDITOR ; seuls objectif, résultat attendu, prérequis, durée et métadonnées explicitement publics sont présents. La description publique de vérification est `metadata.evaluationDescription`, jamais `evaluationDefinition` canonique. Le programme contient des nœuds récursifs de métadonnées seulement ; chaque `versionId` est exactement la `version_compositions.child_version_id` enregistrée dans son parent. Une nouvelle version d’activité ne remplace donc pas silencieusement celle d’un ancien programme. Les liens E10 transmettent la version du parcours et celle de l’activité ; le serveur Next vérifie leur appartenance puis demande la version exacte à Spring.

`PublicMetadata` contient `goalCodes`, `level`, `audience`, `tools`, `sources`, `faq`, `evaluationDescription`. V005 l’attache à une révision dans une table append-only ; les anciens instantanés reçoivent un objet vide explicite, niveau/description de vérification `null`. `ContentView` et `RevisionView` privés portent aussi ce snapshot. PUT metadata crée un nouveau brouillon à texte/identité/version conservés ; l’ancienne publication garde ses métadonnées jusqu’à revue et publication. Une simple correction conserve les métadonnées ; duplication/nouvelle version recopient leur source en brouillon, traduction initiale vide pour éviter une fausse traduction. Le document historique doit être converti explicitement avant cette action.

Limites : métadonnées 16 KiB UTF-8 ; six tâches sans doublons, dix publics/outils, vingt sources, douze FAQ ; publics 500 caractères, nom d’outil 120, libellé de source 240, question 500, réponse 2000, modalités publiques 4000. URL facultative d’outil ou obligatoire de source : 2000 caractères, HTTPS sans credentials ou chemin interne simple ; pas d’URL téléchargée côté serveur. Champs inconnus et valeurs invalides sont refusés, permission et précondition revérifiées en transaction. Les textes sont échappés, pas du HTML libre.

P06 utilise **`Cache-Control: no-store`**, lectures SSR de l’origine interne configurée sans cookie et fetch navigateur `credentials: omit`. Aucun cache public dépendant d’une session et aucune invalidation supposée implémentée. Les métadonnées préparent canonical et équivalents publiés, mais les pages restent **noindex/nofollow jusqu’à P16**. Les erreurs de base/transaction deviennent 503 `SERVICE_UNAVAILABLE` contrôlé ; 200 vide reste un vrai zéro résultat, sans faux catalogue de remplacement.

Avant P11/P12, aucune offre, aucun prix, achat, état « déjà acquis » ou paiement ne sont fournis par ce contrat. La décision privée d’accès futur est distincte de ces projections ; ses motifs préparés (`AUTH_REQUIRED`, `OFFER_REQUIRED`, `ACCESS_EXPIRED`, etc.) ne sont pas des droits P06 déjà intégrés. Le signalement UI conserve resourceId/versionId/revisionId/langue et permet une copie ; aucun faux endpoint ni message « envoyé » avant le service de support.

## Méthodes et générateur — validé localement P07

Les neuf opérations suivantes existent dans Spring et OpenAPI. Le global Java exécuté le 8 novembre 2026 a réussi : **78 tests, zéro échec/erreur/ignoré**, dont six tests de service et sept tests HTTP P07 sur PostgreSQL. `verify:client` réussit avec **42 tests**, dont six nouveaux tests de transport/stockage P07 avec doubles unitaires et six tests du générateur. Build web, cycle HTTP réel et recette Chromium ont également réussi ; résultats et limites dans [evidence/P07.md](evidence/P07.md).

| Méthode et route, préfixe `/api/v1` | Entrée ou résultat | Contrôle |
| --- | --- | --- |
| `GET /me/methods` | `q?`, `category?`, `page=0`, `pageSize=20` → `MethodPage` | `methods.read`, liste du seul propriétaire |
| `POST /me/methods` | `{ fields: MethodFields }` → 201 `MethodView`, `Location`, ETag | `methods.write`, CSRF et contexte de compte ; origine absente |
| `GET /me/methods/{id}` | `MethodView`, ETag | `methods.read`, objet du propriétaire ou 404 |
| `PATCH /me/methods/{id}` | `{ fields: MethodFields }` → `MethodView`, nouvel ETag | Remplacement explicite des champs personnels ; propriété, CSRF, contexte et If-Match |
| `DELETE /me/methods/{id}` | 204 vide | Même contrôle d’écriture ; copie supprimée physiquement, seconde suppression 404 |
| `POST /me/methods/{id}/duplicates` | Aucun corps → 201 `MethodView`, `Location`, ETag | If-Match de la copie personnelle ; nouvel UUID, texte/notes/origine indépendants |
| `GET /me/methods/{id}/source-update` | `MethodSourceUpdate` | Propriétaire, lecture dynamique séparée sans ETag personnel |
| `POST /me/methods/from-template` | `{ sourceResourceId, sourceVersionId, sourceRevisionId, sourceLocale, fields }` → 201 `MethodView` | Snapshot METHOD_TEMPLATE exact, publié, FREE et défini, vérifié côté serveur |
| `GET /method-templates/{resourceId}/versions/{versionId}?locale=fr` | `MethodTemplate` | Public, version exacte ; aucune définition premium, aucun repli de langue/version |

Les lectures/écritures personnelles sont `private, no-store`. Les permissions `methods.read` et `methods.write` sont attribuées au rôle LEARNER de référence ; aucun compte n’est créé par cette attribution. Le service recontrôle compte actif, permission et propriétaire, y compris après attente du verrou. Lire, modifier, dupliquer, supprimer ou inspecter la source de la méthode d’autrui retourne 404. Un rôle éditorial ne donne aucun accès aux copies privées ni à une définition premium.

`MethodFields` contient exactement `title`, `locale`, `text`, `parameters`, `generatedFrom`, `notes`, `category`. Titre 1..240, texte 1..32000, notes 0..8000 caractères ; catégorie nullable ou 1..80 non blancs, langue du texte FR/EN. Les sept `MethodParameters` sont `objective`, `context`, `availableData`, `recipient`, `format`, `constraints`, `clarifications`, chacun 0..4000 caractères. `generatedFrom` est nullable ou un dernier jeu de paramètres assemblé, distinct du texte final. L’ensemble des champs est limité à **48 KiB JSON UTF-8**, y compris ce marqueur ; Unicode invalide et NUL sont refusés. Le proxy conserve sa borne globale de 64 KiB. Propriétaire, origine, rôles et révision autoritaire sont refusés en entrée, notamment par le rejet des champs inconnus.

La recherche, limitée à 240 caractères, porte uniquement sur titre/notes/catégorie du propriétaire ; catégorie exacte facultative. `page` 0..1000000, `pageSize` 1..100 ; ordre `updatedAt DESC, id`. Les résumés de liste ne livrent ni texte ni notes. Une seconde session du même compte retrouve le détail persisté, sans traduction automatique de ses champs.

Toutes les mutations `/me/methods` exigent **`X-Account-Context`**, UUID du compte attendu lors de l’action explicite. Le serveur le compare à l’acteur de session dans la transaction ; ce header ne choisit jamais le propriétaire. Absent ⇒ **428 `ACCOUNT_CONTEXT_REQUIRED`** ; autre compte ⇒ **409 `ACCOUNT_CONTEXT_CHANGED`** ; syntaxe invalide ⇒ **400 `VALIDATION_FAILED`**. Cette précondition ferme le cas ancien onglet A → connexion B → enregistrement du texte A. L’import sous B nécessite une nouvelle décision explicite, pas un retry automatique.

L’ETag fort du détail est `"personal-method-{id}-r{revision}"`. PATCH, DELETE et duplication exigent If-Match, après propriété et verrouillage de la ligne : absent 428, révision dépassée 412, comparaison forte du socle. La révision et la mise à jour sont atomiques. La notice de source est séparée : modifier une publication ne change pas les octets ni l’ETag de la copie. Elle retourne `NONE`, `CURRENT`, `UPDATE_AVAILABLE` ou `UNAVAILABLE`, avec origine capturée et éventuel candidat autorisé de la même identité/langue. Aucune ancienne publication de langue différente ne remplace la publication courante dans cette notice.

`MethodOrigin` conserve resourceId/versionId/translationId/revisionId, langue, titre et slug capturés par le serveur. Une correction, nouvelle version, mise en accès PROTECTED ou un retrait de source ne réécrit ni texte ni notes de la copie ; duplication personnelle reste possible sans nouvel accès à la source. Une nouvelle copie depuis la source exige au contraire une publication encore autorisée : non publiée/type incorrect ou retirée ⇒ 404 ; PROTECTED ⇒ 403 tant qu’aucun droit pédagogique réel n’est disponible ; révision publiée différente de celle choisie ⇒ 412 ; définition absente/incomplète ⇒ 409 `CONTENT_NOT_READY`.

`MethodDefinition`, nullable dans le JSONB éditorial `ContentDocument`, contient `useCases`, `requiredInputs`, `steps`, `starterInstruction`, `example`, `checks`, `limitations`, `defaults`. Listes 0..20, éléments 1..1000 ; instruction 0..4000, exemple 0..8000 ; total **24 KiB UTF-8**, inclus dans la borne existante de document 48 KiB. Une définition peut rester incomplète en DRAFT, mais toute nouvelle publication METHOD_TEMPLATE exige les éléments complets (`METHOD_DEFINITION_REQUIRED`). L’ancien JSON sans ce champ signifie null ; les articles déjà publiés P06 restent lisibles et le générateur annonce `MISSING_DEFINITION`. Aucun parsing de paragraphes ne produit une définition supposée validée. SaveRevision P05 porte l’édition, sans endpoint CMS supplémentaire. `PublicDocument.methodDefinition` n’est servi que dans le corps FREE/PUBLISHED ; le template exact distingue aussi PROTECTED, STALE, WITHDRAWN et MISSING_TRANSLATION avec `definition=null`.

Le générateur local exige objectif, données disponibles et format pour assembler, sans appel IA. Son texte éditable ne change pas silencieusement après modification des paramètres. Le visiteur peut copier ; seule une action explicite conserve un essai non sensible en `sessionStorage` pendant deux heures, sous UUID de brouillon et sans propriétaire. Après connexion, l’import reste volontaire sous le compte affiché ; expiration/stockage indisponible ne sont pas annoncés comme une sauvegarde. Logout purge ces clés et les caches personnels ciblés. Les retours autorisés couvrent les routes E12 FR/EN, le seul query `draft=<uuid>` sur la création et les filtres bornés de liste ; domaines externes, traversées de chemin, paramètres d’identité et doublons sont refusés. Changer la langue de navigation conserve le texte personnel original.

Le client valide réponse, code HTTP et ETag avant confirmation ; conserve les modifications postérieures à une requête lente et la saisie sur 412, erreur ou expiration. Comparaison, copie, rechargement et rebase sont explicites. CSRF reste en mémoire ; 401/403 déclenche une nouvelle acquisition pour une prochaine action, sans répéter la mutation. Un 409 de compte ou 412 ne déclenche aucun retry POST.

## Apprentissage, notes et quiz — validé localement P08

`LearningService`, DTO explicites et OpenAPI fournissent les quinze opérations ci-dessous. Le global PostgreSQL réussit avec **95 tests**, dont huit tests de services et neuf HTTP P08 ; les **51 tests client** comprennent transport simulé et règles d’état. Builds et chaîne HTTP réelle réussis, **10 scénarios Chromium en 72,87 s** et **33 captures finales examinées** ; résultats et limites dans [evidence/P08.md](evidence/P08.md). Toutes les routes ont le préfixe `/api/v1` ; aucune exécution GitHub ni publication de production n’est déduite de la validation locale.

| Méthode et route | Commande ou résultat | Contrôle |
| --- | --- | --- |
| `GET /me/learning?locale=fr` | `LearningDashboard` : reprise, inscriptions et cinq méthodes récentes au plus | `learning.read`, données du seul propriétaire, aucune reprise inventée |
| `POST /me/enrollments` | `{ courseResourceId, courseVersionId, locale }` → `EnrollmentView` | `learning.write`, CSRF/contexte ; 201 créée, 200 existante |
| `GET /me/enrollments/{id}?locale=fr` | Programme/version figés et dénominateur | Propriétaire ou 404 |
| `GET /me/enrollments/{id}/activities/{activityId}?activityVersionId={uuid}&locale=fr` | `LearningActivity` et chaîne d’accès agrégée | Propriétaire, couple activité/version du snapshot ; aucun corrigé initial |
| `POST /me/enrollments/{id}/visits` | `{ activityId, activityVersionId, locale }` → `VisitView` | Mise à jour de reprise seulement ; activité FREE disponible |
| `GET /me/activity-progress/{activityId}?enrollmentId={uuid}&activityVersionId={uuid}` | `ActivityProgressView` et ETag individuel | Propriétaire et version exacte |
| `PUT /me/activity-progress/{activityId}` | `{ enrollmentId, activityVersionId, read, completed, locale }` → progrès et nouvel ETag | Propriétaire, publication FREE, If-Match ; faits déclarés séparés |
| `GET /me/activity-notes/by-activity/{activityId}?activityVersionId={uuid}` | `{ note: ActivityNoteView|null }` | Recherche du propriétaire sans création par GET |
| `POST /me/activity-notes` | `{ activityId, activityVersionId, locale, text }` → 201 note, Location et ETag | Création sur publication FREE ; doublon 409 `ACTIVITY_NOTE_EXISTS` |
| `GET /me/activity-notes/{id}` | Note et ETag | Propriétaire, y compris après retrait |
| `PATCH /me/activity-notes/{id}` | `{ text }` → note et nouvel ETag | Propriétaire et If-Match ; langue/origine immuables |
| `POST /activities/{activityId}/quiz-attempts` | `{ enrollmentId, activityVersionId, revisionId, locale, submissionId, answers }` → 201 `QuizAttemptView` | Propriétaire, version inscrite, publication exacte et correction serveur |
| `GET /me/quiz-attempts?activityVersionId={uuid}&page=0&pageSize=20` | Historique paginé FR/EN | Propriétaire, langue et snapshot de chaque tentative conservés |
| `GET /me/quiz-attempts/{id}` | Tentative historique | Propriétaire ou 404, même après retrait de source |
| `POST /learning/activities/{resourceId}/versions/{versionId}/quiz-checks` | `{ revisionId, locale, answers }` → `QuizCheckResult` | Public, CSRF obligatoire, FREE publiée exacte ; correction éphémère sans inscription/tentative/progrès |

Les lectures privées sont `private, no-store`, sous permission `learning.read` ; mutations privées sous `learning.write`, CSRF et `X-Account-Context` comparé à la session, jamais utilisé comme propriétaire. Précondition de compte absente 428, autre compte 409 ; erreurs sans données privées. La correction formative publique utilise le jeton/session anonyme Spring normal, sans contexte de compte ni écriture pédagogique. Elle ne contient ni attemptId ni date de sauvegarde. Les réponses d’erreur distinguent validation 400, PROTECTED 403, publication retirée/absente 404, version publiée différente 412 et indisponibilité 503, sans donnée de remplacement.

L’inscription est unique par `(owner, courseVersion)` et ne crée aucun droit acheté. Un parcours publié PROTECTED peut être commencé s’il contient une activité FREE disponible ; chaque action d’activité conserve son contrôle propre. Programme, ordre et versions sont capturés. Le dénominateur compte les **versions d’activité distinctes**, y compris protégées/retirées ; même activité/version répétée dédupliquée, deux versions de la même identité distinctes. Les GET d’activité/progrès exigent donc `activityVersionId` : aucun premier élément choisi implicitement. `LearningActivity.accessStatus` et `availability` décrivent toute la chaîne parcours/module/activité ; un parent indisponible neutralise le corps enfant. ACTIVE/PROTECTED/UNAVAILABLE sont réels ; aucun état commercial expiré/révoqué n’est fabriqué avant les droits correspondants.

Visite/reprise, `readAt`, `completedAt`, réussite de quiz et projet sont des faits distincts. Le pourcentage se rapporte au dénominateur du snapshot ; un quiz réussi ne termine pas automatiquement l’activité et ne valide aucun projet. `ProgressTotals.projectAvailability=NOT_AVAILABLE` désigne le fait agrégé d’apprentissage non défini ; il ne signifie pas l’absence de l’atelier personnel P09. Le tableau de bord pointe vers les projets sans fabriquer de taux de compétence. Une visite ne change pas la révision du progrès. Progrès et note ont leurs tags forts séparés `"activity-progress-{id}-r{revision}"` et `"activity-note-{id}-r{revision}"` ; PUT/PATCH exigent If-Match après propriété/verrou, 428/412 sans écrasement. Les enveloppes dynamiques n’utilisent pas ces tags.

Une note est unique par propriétaire/version d’activité, langue originale fixée à création. Texte 0..16000 caractères, JSON UTF-8 au plus 48 KiB, Unicode valide sans NUL ; note vide explicitement sauvegardable. Elle reste lisible/modifiable après retrait sans révéler le contenu réservé. FR/EN partage le même progrès et l’historique d’une version pédagogique équivalente, mais ne traduit pas la note. Les lectures privées et le client n’envoient pas son texte aux mesures ou aux journaux.

`ContentDocument.quizPolicy`, nullable et optionnel en entrée historique, définit `passPercent=1..100` et `maxAttempts=null|1..50`. Null/absent signifie politique effective **100 %, tentatives illimitées**. La politique effective gèle avec l’évaluation et doit être équivalente dans la traduction revue ; expliciter le même défaut n’impose pas une nouvelle version. Une politique différente sur version gelée requiert une nouvelle version pédagogique. Le DTO initial reste sans bonnes réponses ; politique publique ne signifie pas corrigé public avant soumission.

`answers` contient exactement une `{ key, optionIndex }` par question publiée : 1..20 réponses, options 0..7 puis bornes réelles vérifiées, aucune clé inconnue, omission ou duplication. Score/correction calculés côté serveur, jamais reçus comme autorité : `scorePoints*100 >= maxPoints*passPercent`. La tentative append-only capture questions/options/correction/points, politique, révision/version et langue. Limite de tentatives commune FR/EN par propriétaire/version ; quiz absent 409 `QUIZ_UNAVAILABLE`, quota atteint 409 `QUIZ_ATTEMPTS_EXHAUSTED`. Même propriétaire/submissionId/corps retrouve la même tentative en 201, autre corps 409 `CONFLICT` ; ce replay historique reste lisible après retrait sans corriger de nouveau. La correction anonyme est explicitement formative et non conservée ; une action authentifiée distincte crée le résultat durable.

Dashboard borné aux cent inscriptions récentes, historique des tentatives page 0..1000000 et pageSize 1..100, ordre submittedAt DESC puis id. Reprise : dernière activité encore accessible, sinon première non terminée accessible, sinon première accessible, toujours dans la version inscrite. Les méthodes récentes ne chargent pas leurs textes ; permission absente annoncée FORBIDDEN. Aucun projet, média ou diagnostic facultatif fictif ne complète ces données. Les contrôles client vérifient aussi cohérence des identités/versions, sommes de points, résultat et tags ; 412/428/503 restent distincts sans répétition automatique de mutation.

## Projets, autoévaluation et corrigé — P09

| Méthode et route | Fonction et contrôle |
| --- | --- |
| `GET /project-templates/{activityId}/versions/{versionId}?locale` | Brief public d’une activité FREE publiée et configurée, avec grille sans identifiant d’instantané personnel ; aucune correction initiale |
| `GET /me/projects` | Recherche propriétaire `q`, état dérivé, activité/version et pagination ; résumés sans prose complète |
| `POST /me/projects` | `creationId`, origine exacte, inscription facultative, `fields`, `stage` ; 201 à la création, 200 au rejeu identique, Location et ETag |
| `GET/PATCH /me/projects/{id}` | Production propriétaire et grille capturée ; PATCH crée une révision personnelle avec If-Match |
| `GET /me/projects/{id}/status` | Stade, état dérivé et autoévaluation de la révision courante, séparés de l’ETag du texte |
| `GET /me/projects/{id}/context?locale` | Contexte pédagogique réautorisé, IDs d’activité/version explicites ; aucune traduction du texte personnel |
| `GET /me/projects/{id}/revisions` | Page de résumés sans champs de production |
| `GET /me/projects/{id}/revisions/{revisionId}` | Une révision personnelle complète, avec son auteur et sa date |
| `POST /me/projects/{id}/self-assessments` | `submissionId`, révision personnelle, grille, vingt contrôles et quatre déclarations bloquantes ; If-Match, réponse 201 |
| `GET /me/projects/{id}/self-assessments` | Page de résumés sans commentaires ni liste de réponses complète |
| `GET /me/projects/{id}/self-assessments/{assessmentId}` | Détail immuable d’une preuve du propriétaire |
| `POST /activities/{activityId}/solution-reveals` | Révision personnelle et origine exacte ; consultation volontaire réautorisée et tracée, réponse 200 |
| `GET /admin/project-presets/{caseCode}?locale` | Références BR01/BR02 FR/EN depuis une ressource serveur, permission `content.read` ; aucun seed ni publication |

Les types exacts sont dans [OpenAPI](api/openapi.yaml). La validation locale du périmètre technique compte **112 tests Java**, dont huit de service P09 et neuf HTTP avec les vrais filtres et PostgreSQL, puis **58 tests unitaires client**, dont sept P09 avec réponses réseau simulées. La recette P09 complète sans instrumentation réussit **8/8 en 59,9 s**. Résultats globaux, refus d’accusé intermédiaire non reproduit sans cause confirmée et limites sont conservés dans [evidence/P09.md](evidence/P09.md) ; aucune intégration externe ou production n’en est déduite.

### Production, révision et compte attendu

`ProjectFields` contient titre, langue originale, sept sections (`objective`, `scope`, `method`, `timeline`, `budget`, `clarifications`, `nextStep`) et `externalText` indépendant. Titre 1..240, sections 0..8000, texte collé 0..32000 caractères ; ensemble JSON UTF-8 ≤48 KiB, Unicode valide sans NUL. Le propriétaire vient de la session ; aucun score, rôle ou propriétaire reçu en JSON ne fait autorité. Création et sauvegarde acceptent seulement `DRAFT` ou `READY_FOR_SELF_ASSESSMENT`. READY exige un texte non blanc dans une section ou le texte collé, sans prétendre vérifier sa qualité.

Permissions `projects.read` et `projects.write`, propriété Spring, réponses privées `private, no-store`, mutations CSRF et `X-Account-Context`. Compte attendu absent : 428 ; différent de la session : 409 ; UUID malformé : 400. Le header est une précondition, jamais le choix du propriétaire. Les objets d’un autre compte répondent 404. PATCH et autoévaluation comparent If-Match après verrou/propriété : absence 428, révision dépassée 412, sans écrasement ni retry automatique.

L’ETag fort `"project-{id}-r{revision}"` couvre `ProjectView`, dont le stade, l’origine et la grille immuables. Une sauvegarde réellement identique conserve cet ETag ; une nouvelle production ajoute une révision. Autoévaluation, statut et contexte ne modifient pas le compteur de texte. `ProjectStatus.state` distingue DRAFT, READY_FOR_SELF_ASSESSMENT, SELF_ASSESSED et NEEDS_REVISION ; une ancienne évaluation ne devient pas celle d’une nouvelle production. Les GET d’historique sont paginés (page 0..1000000, taille 1..100), révisions par numéro décroissant et évaluations par date puis numéro d’évaluation décroissants.

La création est idempotente par propriétaire et `creationId` : même corps retrouve le projet, autre corps 409. L’autoévaluation utilise son propre `submissionId` et une empreinte du corps ; un rejeu déjà committé est retrouvé avant comparaison If-Match, sans le rattacher à une nouvelle révision. Les réponses ambiguës restent à rapprocher explicitement, sans répétition automatique.

### Grille déclarative et correction protégée

`ContentDocument.projectPolicy` est nullable : absence historique signifie atelier non configuré, pas grille inventée. Un brouillon peut être incomplet ; publication exige vingt critères à un point, quatre erreurs explicites, un seuil de 1..20 et une règle `EXPLICIT` ou `AFTER_SUBMISSION`. Catégories dérivées des clés fidelity/scope/budget/schedule/presentation, sans changement du modèle global de grille. Les préparations de référence proposent 16/20 ; BR02 adapte les critères au dossier fourni. Politique/grille restent gelées avec la version pédagogique et équivalentes entre traductions.

`SelfAssessmentView` expose `method=SELF_ASSESSMENT`, `projectRevisionId`, `rubricVersionId`, `scorePoints`, `maxPoints`, `passPoints`, `thresholdMet`, `needsRevision`, déclarations/commentaires, date, auteur, `evaluatorId=null` et `declaredByUser=true`. Spring somme les contrôles déclarés satisfaits ; une erreur bloquante ou un score sous le seuil impose NEEDS_REVISION. Aucun service ne vérifie automatiquement la vérité de la prose, les calculs du devis ou une formulation attendue mot à mot. Quiz, autoévaluation et future revue humaine restent distincts.

Le projet conserve production, grille et historique après retrait de la source ou perte d’accès. Le brief et le corrigé sont réautorisés séparément. Une nouvelle création exige une activité FREE publiée, la version/révision/langue exactes et, si fournie, une inscription propriétaire contenant cet item encore disponible. Pour un projet lié à une inscription, les lectures de contexte et chaque livraison/rejeu du corrigé revérifient aussi la chaîne parcours/module/activité dans les versions inscrites : un parent retiré ou sans traduction disponible bloque cette ressource pédagogique. Un parcours PROTECTED ne bloque pas son activité explicitement FREE lorsqu’elle reste accessible selon les règles P08 ; l’inscription ne confère aucun droit premium. Le template public autonome répond NOT_CONFIGURED sans corps/grille pour une ancienne activité sans politique ; une identité jamais publiée reste 404.

Le corrigé reste celui de la révision source capturée. EXPLICIT exige l’action volontaire ; AFTER_SUBMISSION exige une autoévaluation déjà enregistrée pour la révision personnelle précise, sans seuil de score ou quiz imposé. Chaque livraison, y compris le rejeu d’une trace, revérifie la publication courante FREE de la même version et langue d’origine. Retrait ou protection refuse la livraison. La consultation est unique par propriétaire/révision personnelle/source/langue et ne valide ni projet ni progression. Dans `ProjectContext`, `currentPublishedRevisionId` concerne la langue d’origine ; `resource` peut être la traduction demandée avec sa propre révision, sans changer les textes personnels.

L’atelier anonyme prépare un texte local ; seule une action volontaire conserve un brouillon non sensible en session navigateur pendant deux heures pour import explicite dans le compte affiché. Les productions authentifiées restent en mémoire/serveur. P09 ne comprenait pas de dépôt de fichier ; le raccordement P10 est décrit ci-dessous. La revue humaine demeure désactivée ; aucun prix, offre de correction ou service commercial n’est déduit de P09.

## Fichiers — implémentation P10 validée localement

Les dix opérations suivantes sont implémentées dans Spring. La validation locale P10 comprend **138 tests Java globaux**, le ciblé identité **6/6 avec `MAIL_MODE=disabled`**, le ciblé stockage final **8/8 avec 24 slots SeaweedFS** et **12/12 scénarios Chromium**. Ces ciblés sont des vérifications complémentaires, pas des tests à additionner au total global. Le test de configuration critique a aussi réussi. Aucun fournisseur de production n’est déduit de cette recette : voir [STATUS.md](STATUS.md) et [evidence/P10.md](evidence/P10.md). Préfixe `/api/v1`.

| Méthode et route | Entrée → résultat | Autorisation serveur |
| --- | --- | --- |
| `GET /me/projects/{projectId}/file-policy` | → `UploadCapabilities` | Propriétaire, `assets.read` ; lisible même si stockage désactivé |
| `GET /me/projects/{projectId}/attachments` | `page`, `pageSize` → `AssetPage` | Propriétaire, `assets.read` |
| `POST /me/projects/{projectId}/upload-intents` | `UploadRequest` → `UploadIntent`, 201 | Propriétaire, `assets.write`, quota atomique |
| `POST /me/projects/{projectId}/attachments` | `{ assetId }` → `AssetView`, 200 | Propriétaire du projet et du fichier, `assets.write` |
| `GET /admin/assets/upload-policy` | → `UploadCapabilities` | `content.read` |
| `POST /admin/assets/upload-intents` | `EditorialUploadRequest` → `UploadIntent`, 201 | `content.write`, version réellement rattachée à la ressource |
| `GET /admin/assets/{assetId}` | → `AssetView` | `content.read`, EDITORIAL uniquement |
| `POST /admin/assets/{assetId}/confirmations` | → `AssetView`, 200 | `content.write`, EDITORIAL uniquement |
| `POST /admin/assets/{assetId}/download-access` | → `DownloadAccess` | Prévisualisation `content.read`, EDITORIAL uniquement ; jamais fichier personnel |
| `POST /assets/{assetId}/download-access` | `AssetAccessContext` ou null → `DownloadAccess` | Personnel propriétaire ; éditorial référencé par publication exacte FREE, langue et chaîne éventuelle |

CSRF reste actif. `X-Account-Context` est exigé sur création/confirmation et sur toute demande de lien authentifiée ; ce UUID attendu est comparé au compte de session, jamais utilisé comme propriétaire. L’éditorial FREE anonyme reste possible avec CSRF et contexte pédagogique exact, sans header de compte. Réponses `private, no-store`, plus `noindex, nofollow` sur `/admin/assets/**`. Aucun PATCH libre de métadonnées ou effacement d’historique ; aucun If-Match d’un fichier ne remplace ces contrôles.

`UploadRequest={filename,contentType,sizeBytes}` : nom de 1 à 180 caractères sans chemin/contrôle, MIME autorisé et entier positif. `EditorialUploadRequest` ajoute `resourceId`, `versionId`, `locale` FR/EN. Ni clé, bucket, propriétaire, état READY ni URL à récupérer ne sont acceptés. `UploadCapabilities` expose `enabled`, `unavailableReason`, formats `{contentType,extensions,kind,maxBytes,available,unavailableReason}`, quotas et TTL. Désactivé (`STORAGE_NOT_CONFIGURED`) diffère d’une panne. TXT UTF8 personnel/éditorial et PNG/JPEG éditoriaux sont actifs ; PDF est indisponible sans validateur documentaire adapté (`DOCUMENT_VALIDATOR_UNAVAILABLE`).

`UploadIntent={asset,method:PUT,uploadUrl,headers,expiresAt}`. `AssetView` expose UUID, révision, scope PROJECT_FILE/EDITORIAL, type FILE/IMAGE, état PENDING/READY/REJECTED/EXPIRED, nom/MIME/taille, langue éditoriale ou null, projet personnel ou null, dates et code de refus éventuel. Validation PENDING/FORMAT_VERIFIED/REJECTED : **FORMAT_VERIFIED ne signifie pas antivirus validé.** Confirmation READY idempotente ; objet absent encore PENDING → 409 `UPLOAD_OBJECT_MISSING`. Format/MIME/taille reçus incorrects → REJECTED conservé ; échéance atteinte → EXPIRED. Paramètres invalides : 400 `VALIDATION_FAILED` ; quota : 409 `ASSET_QUOTA_EXCEEDED` ; fichier non prêt : 409 `ASSET_NOT_READY` ; panne : 503 `SERVICE_UNAVAILABLE`. Préconditions de compte 428/409, objet d’autrui 404. Listes page 0..1000000, pageSize 1..100, createdAt DESC puis id.

Le serveur vérifie HEAD, lit les octets avec une borne, valide puis écrit ces mêmes octets vers une autre clé opaque READY. L’ancienne PUT ne vise que staging. Les images sont décodées, bornées et réencodées ; TXT strict UTF8 est servi en attachment. Défauts configurables : 5 MiB par fichier, 10 MiB par image, dix fichiers et 20 MiB par projet ; images limitées à 4096 par dimension et 16 millions de pixels. PENDING non expirés et READY comptent sous verrou dans le quota ; les valeurs configurées restent l’autorité.

`AssetAccessContext={locale,resourceId,versionId,enrollmentId}` est requis pour l’éditorial et doit désigner une publication qui référence réellement cet asset. Une inscription ajoute propriété et chaîne épinglée P08. Parent retiré/STALE ou langue indisponible bloque un nouveau lien ; un parent PROTECTED n’interdit pas son activité explicitement FREE. PROTECTED reste refusé avant P12. Les fichiers personnels restent autorisés au propriétaire après retrait de source, selon les permissions du compte.

`DownloadAccess={assetId,method:GET,url,expiresAt,contentType,filename,disposition,sizeBytes,sha256}` : taille et SHA256 hex64 viennent des octets READY vérifiés ; HEAD recontrôle présence/taille/MIME avant présignature. Les deux buckets ont une ACL privée ; leur usage éditorial/personnel diffère. Le client utilise fetch `credentials:omit`, contrôle les octets puis une blobURL pour éviter d’envoyer SESSION à un autre port du même hôte. Aucun lien signé stocké/journalisé. TTL par défaut PUT 300 s / GET 60 s, bornés par configuration. Un lien émis peut survivre à une révocation jusqu’à son expiration fournisseur ; aucun effacement d’un téléchargement n’est promis.

## Notifications transactionnelles — V010, validées localement en P10

`GET /admin/notifications?status&page&pageSize` exige `notifications.read`. `POST /admin/notifications/{id}/retry` exige `notifications.manage`, CSRF et `X-Account-Context`, corps `{reason:CONFIGURATION_FIXED|MANUAL_RECONCILIATION,ackDuplicate:boolean}`. Permissions installées sans compte ni attribution automatique. Réponses privées : métadonnées opérationnelles seulement, jamais destinataire, clé métier, token, texte ou ciphertext. Pagination 0-based / taille 1..100, createdAt DESC puis id.

Inscription et récupération insèrent réellement ACCOUNT_CREATED/PASSWORD_RESET dans la transaction métier. Les ports ACCESS_ACTIVATED/SUPPORT_REPLY réutilisent cette outbox, en attente de leurs événements réels P12/support ; aucune activation/réponse fictive. Même clé métier/empreinte retrouve la notification ; autre corps 409 CONFLICT. Destinataire/contenu sont chiffrés AES-GCM authentifié ; `NOTIFICATION_OUTBOX_KEY`, Base64 de 32 octets, reste hors dépôt et doit survivre au redémarrage.

Le worker prend un bail SKIP LOCKED, commit puis appelle SMTP hors transaction. PENDING→PROCESSING ; connexion impossible avant acceptation → RETRY avec délai exponentiel borné puis DEAD ; erreur d’authentification/format définitive → DEAD ; issue SMTP ambiguë/bail abandonné → INDETERMINATE sans renvoi automatique. SENT signifie retour SMTP observé, pas réception finale par une personne. La charge est purgée après envoi/expiration ; un jeton expiré est refusé selon les horloges applicative et PostgreSQL.

Reprise seulement RETRY/DEAD/INDETERMINATE avec charge présente/non expirée ; INDETERMINATE exige `ackDuplicate=true`. Chaque reprise est tracée et remet le compteur du cycle à zéro sans effacer le total. Défauts : consultation toutes les 1 s, bail de 30 s, cinq essais, délai de 5 s à 5 min, charge conservée au plus 24 h ou jusqu’à l’échéance du jeton si plus courte. L’échec email ne retire aucun accès. SMTP ne garantit pas une livraison exactement une fois après toute coupure ; neuf tests ciblés PostgreSQL/Mailpit vérifient reprise/déduplication, sans valider un domaine expéditeur externe.

## Vidéo et positions — V011, validées localement en P10

Le module `media` implémente le port P08 avec un provider LOCAL_TEST, désactivé par défaut et activable seulement en local/test. Huit scénarios PostgreSQL/HTTP ciblés ont réussi, dont Range, expiration, publication, propriétaire et concurrence ; le global Java et les douze scénarios Chromium P10 ont ensuite réussi, avec lecture native réellement décodée et reprise des positions FR/EN. Le clip MDN technique documenté dans [tests/fixtures/media](../tests/fixtures/media/README.md) sert aux tests ; aucune vidéo de cours produite ou plateforme de streaming de production n’est annoncée.

| Méthode et route, préfixe `/api/v1` | Résultat et contrôles |
| --- | --- |
| `GET /media/{mediaId}?resourceId&versionId&locale&enrollmentId?` | `VideoMediaView` ; publication FREE exacte, référence VIDEO, langue et chaîne éventuelle |
| `POST /media/{mediaId}/playback-access` | `MediaAccessContext` → `VideoPlaybackAccess` ; même autorisation, CSRF ; compte attendu si authentifié |
| `GET` ou `HEAD /media/{mediaId}/stream?grant=…` | Octets MP4 ou headers seuls ; bearer court réellement émis, jamais un chemin client |
| `GET /me/media-progress/{mediaId}?resourceId&versionId&locale&enrollmentId?` | `MediaProgressView` + ETag ; `media.progress.read`, média autorisé |
| `PUT /me/media-progress/{mediaId}` | `{context,positionSeconds}` → `MediaProgressView` + ETag ; `media.progress.write`, CSRF, compte attendu et If-Match |

`MediaAccessContext={locale,resourceId,versionId,enrollmentId}` réemploie la politique de fichiers éditoriaux : référence explicite, version exacte, FREE seulement avant P12 ; origine du média conservée, réutilisation de même langue explicitement référencée possible. Chaque nouveau lien recontrôle publication et chaîne. Un bearer déjà émis garde sa validité résiduelle jusqu’au TTL, même si la source est retirée entre-temps.

`VideoMediaView` expose `id`, `locale`, `provider`, `durationSeconds`, `sizeBytes`, `sha256`, `playbackAvailable`, `unavailableReason`, `transcript`, `captionsVtt`. Taille/hash/durée proviennent du MP4 importé et vérifié ; texte et sous-titres manquants restent null. Provider absent ou fichier indisponible est un état réel, jamais un lecteur prétendument prêt. `VideoPlaybackAccess={mediaId,provider,url,expiresAt,contentType,durationSeconds,sizeBytes,sha256}` contient une URL relative de flux, type `video/mp4`, et les faits mesurés. Token opaque de 32 octets ; seule son empreinte SHA256 est conservée. TTL par défaut 60 s, borné à 1..60 s. Aucun token ou URL complète dans les logs, caches ou Problem.instance.

Le flux supporte une seule plage `bytes`, avec 200/206/416, `Accept-Ranges`, `Content-Length` et `Content-Range`. Il reste `private, no-store`, `nosniff`, `no-referrer`. Un grant invalide/expiré répond 404 ; provider indisponible répond 503 à la demande de lecture. Le proxy relaie le flux binaire et Range, sans appliquer sa limite JSON de 64 KiB au corps vidéo.

`MediaProgressView={mediaId,locale,durationSeconds,positionSeconds,revision,updatedAt}` est propre au couple propriétaire/mediaId. Absence de ligne : position 0, révision 0, date null, explicitement non sauvegardée ; le premier PUT crée la révision 1. Tag fort `"media-progress-{mediaId}-r{revision}"`, 428 sans précondition, 412 sur conflit, no-op identique sans faux nouvel enregistrement. Le serveur borne la position à la durée réelle ; aucune lecture, fin d’activité, note de quiz ou validation de projet n’en est déduite. Les vidéos FR/EN distinctes gardent leurs propres positions.

Import uniquement par manifeste serveur local/test, chemin privé absolu et CLI explicite sans Spring, migration ou seed. Le registre est immuable ; un id existant incompatible est refusé avant copie, une restauration identique reste possible. Traversées, symlinks sortants et racines public/static/.next sont refusés. Aucun téléversement vidéo arbitraire ni transcodage maison n’est ajouté.


## Offres et préparation de commande — P11 validé localement

Treize opérations Spring et leurs DTO explicites sont implémentés. Le ciblé combiné PostgreSQL/HTTP/schéma a réussi : **26/26**, dont **huit tests de service d’offres** et **neuf tests HTTP de commerce**. Le global Java a ensuite réussi : **155 tests**, zéro échec/erreur/ignoré, Maven **6 min 12**, terminé le 8 novembre 2026 à 08:46:32 +01:00. Après raccordement des variables natives puis ajout du recontrôle de permission attendu après verrou, le ciblé HTTP final a réussi **10/10**, Maven **1 min 23**, avec repackage du JAR final. Le global 155 précède ce dernier correctif ; le ciblé dix l’exécute. **Chromium 8/8**, sans filtre ni retry, **20 captures examinées**, chaîne HTTP réelle et nettoyage des processus réussis. [Chronologie des preuves](evidence/P11.md). P11 prépare une commande persistée, ni un paiement ni une attribution d’accès. Préfixe `/api/v1`.

| Méthode et route | Résultat | Autorisation |
| --- | --- | --- |
| `GET /offers?locale&page&pageSize` | `OfferPage`, ACTIVE/INACTIVE seulement | Public, sans personnalisation |
| `GET /offers/{id}?locale` | `PublicOffer` | Public ; DRAFT reste 404 |
| `GET /admin/offers?q&state&kind&locale&page&pageSize` | `OfferPage` | `commerce.offers.read` |
| `POST /admin/offers` | `CreateOffer` → `OfferView`, 201 | `commerce.offers.write` |
| `GET /admin/offers/{id}` | `OfferView` + ETag | `commerce.offers.read` |
| `PATCH /admin/offers/{id}` | `SaveOffer` → nouvelle révision, ETag | `commerce.offers.write`, If-Match |
| `GET /admin/offers/{id}/readiness` | `OfferReadiness` | `commerce.offers.read` |
| `POST /admin/offers/{id}/activate` | `{reason}` → `OfferView` + ETag | `commerce.offers.activate`, If-Match, readiness recalculée |
| `POST /admin/offers/{id}/deactivate` | `{reason}` → `OfferView` + ETag | `commerce.offers.activate`, If-Match |
| `GET /me/offers/{id}/purchase-context?locale` | `PurchaseContext` | `commerce.orders.read`, compte actif |
| `POST /me/orders` | `CreateOrder` → `OrderView`, 201/200 | `commerce.orders.write`, compte actif |
| `GET /me/orders?page&pageSize` | `OrderPage` | Propriétaire, `commerce.orders.read` |
| `GET /me/orders/{id}` | `OrderView` + ETag | Propriétaire, `commerce.orders.read` ; autrui 404 |

Toutes les mutations exigent CSRF et `X-Account-Context`. Les commandes exigent en plus `Idempotency-Key` UUID canonique ; absence 428 `IDEMPOTENCY_KEY_REQUIRED`, syntaxe invalide 400. Les réponses sont `private, no-store`, les routes admin non indexables. Pagination 0..1000000 / taille 1..100 ; offres code ASC puis id, commandes createdAt DESC puis id. Recherche admin q ≤240 caractères. Les permissions commerciales ne sont pas accordées à EDITOR : COMMERCE_MANAGER est une référence sans compte ; LEARNER possède seulement lecture/écriture de ses commandes.

`CreateOffer={code,kind,fields,reason}` : code stable, kind COURSE ou PACK ; `SaveOffer={fields,reason}` crée un instantané append-only. `OfferFields` contient copies FR/EN, ressources `{resourceId,versionId}` exactes, langues incluses, prix `Money` nullable, fiscalité et conditions. Les conditions distinguent accès FIXED/UNLIMITED, actualisations NONE/PERIOD, politique PINNED/UPDATES_DURING_PERIOD, support NONE/ASYNC, correction humaine désactivée et textes versionnés par langue. Un champ absent/vide en brouillon reste non configuré. Total éditable ≤48 KiB UTF8 ; vingt inclusions maximum, une pour COURSE et au moins deux pour PACK. Aucun prix d’un exercice ne devient un prix de formation.

La liste de devises activées est configurée serveur, vide par défaut ; le socle sait traiter explicitement EUR/USD/GBP à deux décimales, sans supposer cette échelle pour toute devise ISO. Le total est fourni par l’offre serveur, sans calcul fiscal implicite : EXCLUSIVE est bloqué faute de calcul de total applicable ; INCLUSIVE/EXEMPT exigent un libellé configuré. Cela ne remplace pas la validation des paramètres commerciaux et juridiques réels.

`OfferView` contient identité produit/offre, révision agrégée, id/numéro de révision historique, code/type/état, champs et dates ; tag fort `"offer-{id}-r{revision}"`. La readiness dynamique reste séparée. Une sauvegarde d’offre ACTIVE la remet INACTIVE, puis nécessite réactivation explicite. `OfferReadiness={offerId,checkedRevision,summaryReady,checkoutAvailable,blockingIssues,warnings,checkoutUnavailableReason}` distingue les conditions structurelles de la disponibilité du paiement. `summaryReady` peut être vrai sur une offre INACTIVE ; la commande exige ACTIVE et revérifie révision, langues, descendants épinglés et médias obligatoires réellement disponibles. `checkoutAvailable` reste faux avec `PAYMENT_NOT_CONFIGURED` en P11.

`PublicOffer.resources` contient une entrée par ressource dans la seule langue demandée, avec version/numéro, titre/slug, état de disponibilité et accès ; aucun corps premium/corrigé n’y figure. La readiness contrôle toutes les langues incluses. Une traduction absente reste explicite, sans repli silencieux. Prix et conditions incomplets restent nullable plutôt que fabriqués.

`PurchaseContext={offer,coverage,activeOrder}` est privé et sans ETag : couverture NONE/PARTIAL/ALL, langues déjà couvertes/manquantes par ressource et commande active éventuelle, y compris CONFIRMED en P12. FREE signifie que le parcours et tous ses descendants sont effectivement ouverts ; un simple suivi d’apprentissage ne vaut pas achat. Les origines de droits sont lues sans être créées en P11 ; les fixtures MANUAL_TEST sont ignorées hors local/test. Une couverture partielle ne crée aucune réduction et une couverture complète refuse une nouvelle préparation par 409 `ALREADY_ACCESSIBLE`.

`CreateOrder={offerId,offerRevision,locale,acceptedTermsVersion}` ne reçoit ni propriétaire, prix, montant, ressources, état financier ou droit. L’action explicite d’acceptation des conditions doit précéder ce POST ; version exacte et date serveur sont enregistrées après les verrous. Le serveur fige `OrderSnapshot` : révision d’offre, lignes de ressources, titres, versions/langues, total/devise, fiscalité et conditions. Offre modifiée : 409 `OFFER_CHANGED`, récapitulatif à revoir ; conditions différentes : 409 `TERMS_CHANGED` ; offre incomplète : 409 `OFFER_NOT_READY`.

`OrderView` sépare orderStatus PREPARED/EXPIRED/CANCELLED, paymentStatus NOT_STARTED et fulfillmentStatus NOT_STARTED, snapshot, acceptation et dates. Tag `"order-{id}-r{revision}"`. TTL de préparation par défaut 30 min, borné de 1 min à 24 h. Même clé/corps retrouve la même commande, même clé/autre corps 409 CONFLICT ; deux clés pour une même intention active retrouvent aussi la même commande. Une nouvelle acceptation explicite d’une autre révision/langue/conditions ne remplace que PREPARED sans paiement ni activation commencés : l’ancienne devient CANCELLED et son snapshot reste intact. Un paiement ambigu/commencé ne doit jamais être annulé automatiquement ; 409 `ACTIVE_ORDER_EXISTS`. Le Checkout, la confirmation financière et l’attribution sont réservés à P12.

## Stripe, rapprochement et droits — P12 en cours, contrôles locaux réussis

La production refuse Stripe activé pendant ce lot réservé au test ; TEST en staging et Stripe désactivé en production restent admis. Après une recherche complète vide au-delà de l’échéance de Checkout, une opération toujours sans session et au paiement UNKNOWN devient un incident NEEDS_REVIEW/DEAD (`SESSION_NOT_FOUND_AFTER_EXPIRY`). Aucun échec financier, droit ou nouveau débit n’est déduit de cette absence. La reprise de rapprochement reste possible ; OPEN/PROCESSING connus restent des attentes normales.

Le SDK serveur figé est `stripe-java 34.1.0`, API stable `2026-10-28.endive` ; aucune API preview ni mode live activé. Le backend est vérifié localement : global de 182 tests, puis ciblés de 23 et 16 tests après les correctifs ultérieurs, sans addition de leurs décomptes. Dans les recettes locales, le transport Stripe est explicitement doublé ; signature SDK, HTTP et PostgreSQL sont réels. Les nouveaux diagnostics croisés réussissent 6/6 avec 72 GET concurrents ; la dernière suite complète réussit 8/8 avec 24 GET croisés et nettoyage confirmé, sans changement de source API/JAR. Les deux refus antérieurs 403/PROTECTED n'ont pas été reproduits ; leur cause reste inconnue. P12 reste en cours, sans clôture ni démarrage de P13. [Chronologie et limites](evidence/P12.md), [release officielle](https://github.com/stripe/stripe-java/releases/tag/v34.1.0), [version d'API du tag](https://raw.githubusercontent.com/stripe/stripe-java/v34.1.0/src/main/java/com/stripe/ApiVersion.java).

La préparation Stripe externe a réellement effectué `GET https://api.stripe.com/v1/account` avec une clé TEST privée et vérifié la concordance du compte configuré. Stripe CLI 1.55.8 est installé après contrôle du SHA256 de l'archive et du manifeste. Spring réel charge maintenant `enabled=true` et `webhookConfigured=true` : ces valeurs confirment la présence de configuration, pas la validité du secret. Trois récupérations CLI, par défaut puis avec les options d'écoute et en répétition, renvoient le même secret que le cache privé ; le champ renseigné dans `.env.local` en diffère. Le refus `LISTENER_SECRET_MISMATCH` est donc correct ; aucun défaut de parseur ou de variation liée aux options n'est reproduit. Aucune valeur sensible n'est publiée et le listener n'est pas prêt. Aucun Checkout ou paiement fournisseur n'est exécuté.

La commande explicite `stripe:sync-secret` est disponible comme alternative à la copie manuelle. Elle remplace seulement le champ webhook, crée une sauvegarde privée, préserve les autres paramètres/commentaires/fins de ligne et refuse doublons ou édition concurrente détectée. La comparaison avant remplacement ne verrouille pas les éditeurs externes ; fermer le fichier pendant la commande. Ses tests sur configurations fictives réussissent ; elle n'a pas été exécutée sur la configuration réelle, conformément à la préférence de copie manuelle. La synchronisation du secret reste à effectuer avant validation du listener. Les dernières vérifications Docker/Compose et du démarrage FR/EN/proxy sont techniques ; elles ne rejouent pas le parcours métier ni une recette Checkout externe.

| Méthode et route | Entrée ou résultat |
| --- | --- |
| `POST /me/orders/{orderId}/checkout` | `{acceptedTermsVersion}`, If-Match, Idempotency-Key UUID, CSRF et X-Account-Context ; propriétaire et `commerce.orders.write` ; `CheckoutAccess` 200/202 |
| `GET /me/orders/{orderId}/payment-status` | `OrderPaymentStatus`, propriétaire et `commerce.orders.read` ; état courant sans URL bearer ni ETag composite |
| `POST /webhooks/stripe` | JSON UTF8 brut borné à 64 KiB et Stripe-Signature borné à 8192 caractères ; `WebhookReceipt{received:true}` après commit, sans session utilisateur |
| `GET /admin/payment-events?state&page&pageSize` | `PaymentEventPage`, `payments.events.read`, métadonnées expurgées uniquement |
| `POST /admin/payment-events/{id}/retry` | `{reason:PROVIDER_RECOVERED\|MANUAL_RECONCILIATION}`, CSRF et compte attendu, `payments.events.retry` ; replanifie un rapprochement existant |
| `GET /me/resources/{resourceId}/versions/{versionId}?locale` | `MemberResourceDetail`, `learning.read` ; projection publiée privée autorisée par les origines courantes, sans réponses/corrigés |
| `GET /me/project-templates/{activityId}/versions/{versionId}?locale` | `MemberProjectTemplate`, `projects.read` ; préparation privée selon les droits courants |

Toutes les lectures personnelles et administratives restent `private, no-store`. Les routes publiques P06 conservent leur projection sans corps PROTECTED ; les nouveaux DTO membres sont distincts et ne transforment pas une réponse publique en réponse personnalisée mise en cache.

L’intégration cible un marchand unique : avant la première opération réseau, `GET /v1/account` vérifie l’identité de la clé, sans en-tête Connect. Un ID différent de `STRIPE_ACCOUNT_ID` est refusé avant toute création de session ; la vérification positive est conservée pour cette instance SDK immuable. L’URL Checkout est bornée à 4096 caractères dans l’adaptateur et le contrat ; son fragment éventuel est conservé, comme dans l’[exemple officiel de session](https://docs.stripe.com/api/checkout/sessions/object).

`CheckoutAccess={orderId,operationId,state,url,expiresAt,retryAfterSeconds,unavailableReason}` distingue PREPARED/CALLING/OPEN/UNKNOWN/COMPLETE/EXPIRED/FAILED/NEEDS_REVIEW ; une URL n'est fournie que pour une session OPEN connue. `OrderPaymentStatus` contient orderId/orderRevision, les trois états de commande/paiement/activation, checkoutState (NONE sans opération), disponibilité/motif Checkout, sessionExpiresAt, canRetry et notificationStatus NONE/PENDING/SENT/ISSUE. SENT reste l'acquittement SMTP observé. La commande conserve son snapshot, ses conditions et son tag fort ; ses enums s'étendent à AWAITING_PAYMENT/CONFIRMED/NEEDS_REVIEW, aux paiements REQUIRES_PAYMENT/PROCESSING/PAID/FAILED/EXPIRED/UNKNOWN et aux activations PENDING/READY/RETRYING/NEEDS_REVIEW.

La création vérifie compte, propriétaire, permission après attente, révision, offre courante, couverture, conditions acceptées, montant/devise du snapshot. Le périmètre applicatif retient EUR/USD/GBP et des minima explicites ; son plafond de `99_999_999` unités mineures est une borne conservatrice de cette application, pas une limite universelle de toutes les devises Stripe. Zéro n'est pas une fausse transaction payée.

Une seule `checkout_operations` existe par commande. Paramètres JSON, empreinte, clé fournisseur et échéances sont persistés avant réseau. L'expiration de session est fixée à création d'opération + 1 h ; les replays gardent exactement ces paramètres. Reprise de création bornée à 10 min par défaut, même clé/paramètres ; au-delà, rapprochement GET uniquement. Le worker ne crée jamais de Checkout. Les préparations P11 possédant une opération ne sont plus expirées ou remplacées comme un simple panier. Un timeout ambigu ne libère pas l'intention active. [Idempotence Stripe v1](https://docs.stripe.com/api/idempotent_requests).

Seul le POST exact `/api/v1/webhooks/stripe` est exempt de CSRF ; le SDK vérifie le corps inchangé et la signature avec tolérance 300 s, puis mode TEST, compte et API version. L'inbox conserve uniquement identité/type/objet/compte/mode/version/date/empreinte canonique, sans payload brut, carte, client ou signature. Événements employés : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Une signature valide enregistre durablement avant 2xx ; elle ne suffit pas à attribuer des droits. L'ordre `event.created` n'est jamais utilisé comme autorité de progression. [Webhooks officiels](https://docs.stripe.com/webhooks).

Le worker prend un bail court SKIP LOCKED puis commit avant les GET fournisseur. Il rapproche références Session/opération/commande/PaymentIntent, compte/mode/API, quantité, produit et montant/devise exacts. Completed seul laisse PROCESSING quand le paiement est différé. Une première transaction conserve PAID/PENDING ; une seconde crée origines ORDER_LINE et notification stable `access:activated:{orderId}`, puis READY, atomiquement. Une panne d'activation conserve PAID et reste reprenable ; l'échec d'email n'enlève aucun accès. Les origines déjà révoquées et le marqueur de remboursement connu ne sont jamais réactivés par un vieil événement. [Fulfillment Checkout](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page).

L'exploitation affiche `PaymentEventSummary` avec kind STRIPE_EVENT ou RECONCILIATION_JOB ; eventId/type/objectId sont nuls pour un job, operationId/orderId restent nuls avant rattachement d'un événement. États : PENDING/PROCESSING/RETRY/WAITING/PROCESSED/IGNORED/DEAD. `attempts` compte les échecs consécutifs, pas les polls normaux ; une attente OPEN/PROCESSING se replanifie après 30 s sans épuiser le budget. Erreurs : cinq essais par défaut, délai 5 s..5 min. Bail 75 s avec validation croisée des délais réseau. Une reprise opérateur ne fournit ni destinataire, ni payload, ni statut financier souhaité, et ne recrée aucune session.

L'activation effective PostgreSQL donne starts_at ; les durées FIXED et périodes d'actualisation viennent du snapshot, UNLIMITED doit être explicite. Cet ancrage technique doit être reflété dans les conditions commerciales réelles avant vente. Les origines indépendantes couvrent le parcours et ses descendants épinglés, dans les langues/périodes promises ; retrait, traduction indisponible et révocation restent contrôlés. La page E08 interroge l'API propriétaire avec attente bornée ; les paramètres success/cancel ne changent aucun droit.

## Remboursements et compte — suites P13–P14

`GET /me/entitlements`, les demandes/décisions/exécutions de remboursement et leur résumé financier complet restent prévus. Aucun endpoint ne permet de marquer une commande payée ou de choisir les effets d'un remboursement. Le marqueur de remboursement connu P12 est une garde de non-réactivation, pas une implémentation du flux P13.

## Administration commerciale et exploitation — P11/P12 présents, suites P13–P15 prévues

Les routes `/admin/**` exigent des permissions précises. Les permissions affichées au client facilitent l’interface ; elles ne dispensent pas des contrôles Spring sur chaque opération. Offres/readiness/activation P11 et traitements de paiement P12 sont implémentés comme décrit ci-dessus ; les autres opérations ci-dessous restent prévues pour leurs lots.

| Groupe de routes | Opérations |
| --- | --- |
| `/admin/offers` et `/{id}/readiness` | P11 implémenté : offres, prix, inclusions, conditions et bloqueurs commerciaux |
| `/admin/offers/{id}/activate` / `deactivate` | P11 implémenté : offre active distincte de publication ; audit et révision |
| `/admin/payment-events` et `/{id}/retry` | P12 implémenté : métadonnées STRIPE_EVENT/RECONCILIATION_JOB, reprise de rapprochement sans création de paiement |
| `/admin/orders/{id}` | Consultation opérationnelle et origine des droits |
| `/admin/orders/{id}/reconciliation-requests` | Reprise du rapprochement réel, pas bouton « marquer payé » |
| `/admin/refund-requests/{id}/decision` | Décision explicite : montant, lignes, effet d’accès et motif |
| `/admin/refunds` | Exécution autorisée d’une décision, idempotence et rapprochement fournisseur |
| `/admin/incidents` et `/{id}/retry` | Emails, événements et traitements échoués, reprise contrôlée |
| `/admin/support-tickets` | Statut, contexte, réponses et permissions limitées |
| `/admin/audit` / `/admin/metrics` | Événements minimisés, filtres, définitions et agrégations |

Une réponse de `readiness` contient `{ ready, blockingIssues, warnings, checkedRevision }`. Chaque problème indique un `code`, le champ ou la ressource et une action de correction. Le serveur revérifie les conditions lors de la publication/activation ; la réponse précédente ne vaut pas permission permanente.

## Contrat et tests

P03 livre le contrat machine et les commandes de validation/génération avec des outils compatibles avec TypeScript 6 ; P04 à P08 les étendent aux routes réelles d’identité, CMS, catalogue public, méthodes et apprentissage. La CI est configurée pour ces commandes ; une exécution GitHub n’est pas présumée. Les DTO exposés ne sont jamais des entités JPA brutes. Les modèles et FK actuels/futurs sont précisés dans [DATA_MODEL.md](DATA_MODEL.md), les résultats réellement observés dans les preuves [P03](evidence/P03.md), [P04](evidence/P04.md), [P05](evidence/P05.md), [P06](evidence/P06.md), [P07](evidence/P07.md) et [P08](evidence/P08.md).

Chaque lot qui ajoute une route fournit des tests sur le backend réel pour ses invariants, puis met à jour le client et les écrans. Les états de facture, remboursement ou autorisation ne sont jamais inventés uniquement pour faire passer un test d’interface.

Références de sécurité et de paiement : consulter les liens officiels de `docs/ARCHITECTURE.md` pour la version utilisée. `docs/ACCEPTANCE.md` relie les contrats aux scénarios T01–T20 et complète les preuves au fil de leur exécution.
