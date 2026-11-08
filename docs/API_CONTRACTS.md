# Contrats d’API de référence

Le contrat machine des opérations disponibles est [api/openapi.yaml](api/openapi.yaml), versionné en P03. Le reste de ce document distingue conventions préparées et routes planifiées : une route citée dans une section planifiée n’est pas disponible. Chaque lot complète ensemble OpenAPI, DTO, client, tests et cette référence au moment de son implémentation.

## Conventions communes

- Préfixe `/api/v1`, noms de champs JSON en `camelCase`, enum stables en anglais ; traduction des libellés par le frontend.
- JSON pour requêtes/réponses, sauf connexion `application/x-www-form-urlencoded`, webhook au corps brut et transferts de fichiers documentés.
- UUID transmis comme chaînes ; dates ISO 8601 UTC avec suffixe `Z` ; montants entiers `{ amountMinor, currency }`. Aucune valeur de prix par défaut. Révisions et unités mineures JSON sont bornées à `0..9007199254740991` pour rester exactes en JavaScript ; devise explicite, syntaxe de trois lettres majuscules et liste autorisée vérifiée dans le futur service commercial.
- Valeurs facultatives et `null` définis dans OpenAPI ; éviter les champs dont l’absence change silencieusement une permission.
- Listes paginées `{ items, page, pageSize, total }` ; taille maximale, filtres et tris autorisés bornés côté serveur. Recherche et tris ne deviennent jamais du SQL concaténé.
- Ressources privées obtenues depuis l’utilisateur authentifié ; un `userId` envoyé par le client ne détermine pas le propriétaire.
- `401` pour identité requise/expirée, `403` pour permission insuffisante, `404` pour objet absent ou non divulguable, selon politique cohérente documentée. Ces codes ne servent pas à révéler les dossiers d’autrui.
- Erreurs `application/problem+json` : `type`, `title`, `status`, `detail`, `instance`, `code`, `traceId` et éventuellement `fieldErrors`. Les codes pilotent les traductions ; `detail` ne contient ni stack trace, secret, mot de passe, jeton ou donnée privée d’un autre utilisateur.
- Erreurs de validation `400`, conflit métier `409`, révision ancienne `412`, précondition requise `428`, limitation `429` avec indication utile de reprise. `503` exprime un fournisseur indisponible ; aucun remplacement automatique par des données de démo.
- Création `201` avec `Location` lorsque pertinent ; suppression idempotente selon contrat ; mutation `200` avec nouvelle représentation/révision ou `204` lorsque convenu.

## Opérations réellement implémentées — P01/P03

`GET /api/v1/system/health` est public et retourne uniquement `{ "status": "UP" }` après une vraie requête PostgreSQL. Une indisponibilité de la base retourne 503 `application/problem+json`, sans exception ou URL JDBC. La réponse n’est pas mise en cache et ne crée pas de session anonyme.

Une route système absente retourne un vrai 404 Problem. Les erreurs contiennent notamment `status`, `code`, `traceId`, `detail` et `instance`. Le proxy préserve les erreurs de Spring ; sa propre erreur de connexion devient 502/504 `API_UNAVAILABLE`, sans données de remplacement. Aucun autre endpoint métier de ce document n’est annoncé implémenté par P01. Les routes privées sont refusées et CSRF reste actif.

P03 conserve le payload de la sonde et le produit avec un DTO explicite. L’OpenAPI ne décrit que `GET /system/health`, sous le serveur de même origine `/api/v1`. `system/unknown` est volontairement absent : c’est une requête de diagnostic vers une route manquante, pas une nouvelle opération. Aucun endpoint CRUD métier ni contrôleur de test n’est livré en production.

Les composants partagés `Problem`, `FieldError`, UUID, Locale, UtcInstant, Revision, Money et la convention ETag sont définis sans inventer de routes pour les utiliser. Les erreurs utilisent `type: about:blank`, un `traceId` UUID et `Cache-Control: private, no-store`. `fieldErrors`, présent pour une erreur de validation, est une liste `{ field, code, message }`, sans valeur rejetée ni message dynamique contenant une donnée saisie. `code` reste stable pour la traduction ; les détails SQL, exceptions, secrets et graphes JPA restent hors réponse.

| Situation préparée | HTTP | Code |
| --- | --- | --- |
| Validation de DTO/paramètre | 400 | `VALIDATION_FAILED` |
| JSON/type de requête invalide | 400 | `INVALID_REQUEST` |
| Syntaxe If-Match invalide ou limites dépassées | 400 | `INVALID_IF_MATCH` |
| Contrainte/conflit métier | 409 | `CONFLICT` |
| ETag dépassé ou conflit optimiste JPA | 412 | `REVISION_CONFLICT` |
| Précondition de révision absente | 428 | `PRECONDITION_REQUIRED` |

Ces mappings sont testés avec des contrôleurs **uniquement dans les sources de test** ; ils ne sont pas des écritures métier déjà disponibles.

Génération reproductible : `npm run api:generate` reconstruit types, SDK et transport dans `apps/web/src/lib/api/generated`. `api:validate` vérifie OpenAPI 3.1 ; `api:check` régénère en temporaire et refuse toute différence, fichier supplémentaire ou empreinte de contrat divergente ; `verify:client` compile puis exécute les tests du wrapper et du SDK. Les commandes Windows exactes sont dans le README. La CI appelle `api:check` et `verify:client` avant la compilation web.

Le wrapper manuscrit `lib/api/client.ts` utilise le SDK généré puis valide les réponses à l’exécution : les types TypeScript seuls ne prouvent pas la validité d’un JSON réseau. Réponse invalide, erreur HTTP structurée et API inaccessible restent distinctes. Le transport reste de même origine, sans cache et sans jeton d’authentification dans le stockage navigateur. L’adaptation stricte des annotations du transport généré est bornée et vérifiée par le script de génération ; les sources générées ne s’éditent pas à la main.

## Révisions et idempotence

Un objet modifiable expose `revision` et `ETag`. Exemple conceptuel : `ETag: "project-<uuid>-r7"`. La modification/suppression utilise `If-Match` avec le tag reçu. La précondition est vérifiée atomiquement avec l’écriture. Un 412 conserve la saisie dans le navigateur et permet de récupérer la version courante ; il n’entraîne pas une nouvelle tentative écrasante. Le frontend associe chaque réponse à sa requête et sa saisie : une réponse ancienne ne remplace pas une révision plus récente et ne marque pas enregistrées des modifications encore locales.

Socle P03 : `EntityTags` construit un tag fort `"{kind}-{uuid}-r{revision}"` ; `kind` doit distinguer les représentations si plusieurs langues/projections ont des octets différents pour la même révision. `RevisionPreconditions` s’utilise **après autorisation et lecture, dans la transaction d’écriture**, avec `@Version`/UPDATE conditionnel au moment de la persistance. Le helper seul n’est pas un verrou.

Les listes If-Match utilisent une comparaison forte et un OU entre tags ; un tag faible ne correspond jamais. La syntaxe entière est vérifiée avant acceptation, même après un tag correspondant. Limites : 4096 caractères et 64 éléments. Header absent/vide ⇒ 428 ; tag valide dépassé/faible ⇒ 412 ; syntaxe invalide ⇒ 400. `*` seul est valide en HTTP pour l’existence, mais ne fournit pas la révision explicite exigée par notre politique d’édition : il reçoit 428. Un mélange `*`/tags est invalide. Les lots d’écriture devront tester le chemin complet transactionnel et la conservation de saisie, sans retry écrasant.

Les créations risquant un doublon, notamment commandes, Checkout et demandes de remboursement, utilisent `Idempotency-Key`. Sa portée comprend utilisateur/opération et empreinte du corps. La même clé/corps retrouve le même résultat ; un autre corps reçoit 409. La base maintient les contraintes durables et la transaction correspondantes. La politique de rétention est documentée. La clé locale ne remplace ni celle du fournisseur ni l’unicité des attributions métier.

## Identité et session — planifié P04

| Méthode et route | Entrée ou résultat | Règle |
| --- | --- | --- |
| `GET /auth/csrf` | `{ token, headerName, parameterName }` | Public, token Spring, `no-store`, en-tête à reprendre sur les mutations |
| `POST /auth/register` | `{ email, password, displayName?, locale }` | Compte apprenant uniquement, validations, réponse sans mot de passe ; retour vers connexion sans auto-login artisanal |
| `POST /auth/login` | Formulaire `email`, `password` | Filtres Spring, CSRF requis ; 200 avec résumé de session ou 401 contrôlé |
| `POST /auth/logout` | Aucun corps | CSRF requis, session invalidée et cookie expiré ; 204 |
| `GET /auth/me` | Utilisateur, langue, permissions minimales | 200 connecté ou 401 ; aucune clé de session dans le corps |
| `POST /auth/password-reset-requests` | `{ email, locale }` | Réponse neutre 202 ; limitation d’abus et traitement d’email |
| `POST /auth/password-resets` | `{ token, newPassword }` | Jeton opaque à usage unique, expirant, empreinte en base ; invalidation des sessions selon politique documentée |
| `GET/PATCH /me/preferences` | Préférences et révision | Propriétaire ; `If-Match` sur PATCH |

Après inscription, la connexion normale réutilise les filtres Spring et la destination locale validée. Le paramètre `returnTo` est une route interne autorisée, pas une URL libre. Un formulaire existant conserve sa saisie non sensible pendant ces transitions. Les mots de passe ne sont jamais mis dans l’URL, les logs, les événements de mesure ou le stockage navigateur.

Le frontend charge le jeton CSRF au moment nécessaire puis le recharge après login/logout. Le client connaît `headerName` via la réponse ; il ne recopie pas une valeur de token fixe. Cookies avec credentials de même origine. Le cookie de session a `Path=/` pour les lectures SSR ; seul le backend établit l’identité.

## Catalogue public et lecture — planifié P05/P06

| Méthode et route | Fonction |
| --- | --- |
| `GET /catalog` | Recherche transversale : `q`, `type`, `goal`, `level`, `locale`, `access`, `page`, `pageSize`, `sort` |
| `GET /courses/{courseId}` | Métadonnées publiques, version publiée, modules/activités de programme, prérequis, langues, offres pertinentes |
| `GET /courses/by-slug/{slug}?locale=fr` | Résolution du slug localisé vers l’identité stable et sa représentation publique |
| `GET /guides/{guideId}?locale=fr` | Guide publié, blocs rendus de manière sûre, exercice associé, révision et références |
| `GET /method-templates/{templateId}?locale=fr` | Méthode publique ou ressource autorisée, champs du générateur et version source |
| `GET /activities/{activityId}?locale=fr` | Activité publiée autorisée, contenu, média, ressources, objectifs et version |
| `GET /courses/{courseId}/access` | Décision privée pour le compte courant : accès, motif, langues/versions couvertes, prochaines actions |

Le catalogue public ne varie pas secrètement selon le cookie et ne contient pas les notes ou droits individuels. Les cartes peuvent présenter un tarif public configuré ; « Déjà acquis » provient de l’endpoint privé. Une activité verrouillée retourne une description d’accès, jamais son texte premium complet.

Motifs d’accès stables : `AUTH_REQUIRED`, `OFFER_REQUIRED`, `ACCESS_EXPIRED`, `ACCESS_SUSPENDED`, `ACCESS_REVOKED`, `CONTENT_UNPUBLISHED`, `CONTENT_UNAVAILABLE`, `TRANSLATION_UNAVAILABLE`. Ils sont distingués du code HTTP. Les traductions absentes indiquent les langues réellement disponibles et les liens équivalents, sans substitution silencieuse.

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

## Administration — planifié P05/P15

Les routes `/admin/**` exigent des permissions précises. Les permissions affichées au client facilitent l’interface ; elles ne dispensent pas des contrôles Spring sur chaque opération.

| Groupe de routes | Opérations |
| --- | --- |
| `/admin/contents` | Recherche, création, édition typée et dépendances des contenus |
| `/admin/contents/{id}/revisions` | Brouillons et historique avec préconditions de révision |
| `/admin/contents/{id}/translations/{locale}` | Traduction reliée à la bonne version source et état de revue |
| `/admin/contents/{id}/readiness` | Blocages pédagogiques, médias, traduction et accès |
| `/admin/contents/{id}/publish` / `archive` | Transition explicite, permission, motif et audit |
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

P03 livre le contrat machine et les commandes de validation/génération avec des outils compatibles avec TypeScript 6. La CI est configurée pour ces commandes ; une exécution GitHub n’est pas présumée. Les DTO exposés ne sont jamais des entités JPA brutes. Les modèles et FK actuels/futurs sont précisés dans [DATA_MODEL.md](DATA_MODEL.md), les résultats réellement observés dans [evidence/P03.md](evidence/P03.md).

Chaque lot qui ajoute une route fournit des tests sur le backend réel pour ses invariants, puis met à jour le client et les écrans. Les états de facture, remboursement ou autorisation ne sont jamais inventés uniquement pour faire passer un test d’interface.

Références de sécurité et de paiement : consulter les liens officiels de `docs/ARCHITECTURE.md` pour la version utilisée. `docs/ACCEPTANCE.md` relie les contrats aux scénarios T01–T20 et complète les preuves au fil de leur exécution.
