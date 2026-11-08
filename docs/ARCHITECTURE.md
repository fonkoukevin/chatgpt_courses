# Architecture de ChatGPT Courses

Ce document fixe les responsabilités techniques de la V1 et les invariants à conserver pendant les lots P00 à P23. Il décrit une application à développer, pas une application déjà construite ou testée. Les règles du produit et du cahier fonctionnel priment sur les exemples de noms de classes. Les versions exactes sont vérifiées et proposées en P00 dans `VERSIONS.md`, puis installées et verrouillées en P01.

## Socle retenu

| Partie | Décision |
| --- | --- |
| Dépôt | Monorepo avec `apps/web`, `apps/api`, `infra`, `docs`, `prompts` |
| Frontend | Next.js App Router, TypeScript strict, Tailwind CSS, shadcn/ui et Radix UI |
| Backend | Spring Boot modulaire, Java 21, Maven Wrapper, Spring Security, Bean Validation |
| Données | PostgreSQL, Spring Data JPA/Hibernate, Flyway ; schéma géré par migrations |
| Identité | Session Spring côté serveur, persistée par Spring Session JDBC dans PostgreSQL |
| Contrat | OpenAPI versionné ; DTO et client TypeScript issus du même contrat |
| Paiement | Stripe Checkout hébergé, paiements uniques de parcours ou packs ; webhooks signés |
| Fichiers | Adaptateur S3 ; stockage privé pour les productions et ressources premium |
| Vidéo | Adaptateur vers un fournisseur de streaming, avec autorisation de lecture côté serveur |
| Emails | Port métier et adaptateur transactionnel ; Mailpit en développement |
| Exploitation | Docker Compose, reverse proxy Caddy, GitHub Actions, sauvegardes et monitoring |
| Cache | Cache public Next.js quand utile ; aucune obligation Redis dans la V1 |

Aucune migration automatique vers Supabase, Firebase, une autre identité ou des microservices. Les fonctionnalités externes ne sont activées que lorsque leurs paramètres réels sont configurés. Les exemples utilisent des données fictives et des clés de test.

## Une origine et deux applications

Le navigateur appelle une seule origine HTTPS. Le reverse proxy dirige `/api/v1/**` vers Spring et les autres routes vers Next.js, sans retirer le préfixe attendu par Spring. Les médias peuvent provenir du fournisseur autorisé après délivrance d’un accès temporaire.

En développement, un proxy local reproduit ce découpage. Éviter de transformer une mauvaise configuration de proxy en autorisation CORS universelle. PostgreSQL, les endpoints de gestion internes et les consoles de développement restent hors de l’exposition publique.

État P04 : le Route Handler Next relaie GET/HEAD et les mutations de `/api/v1` vers l’origine interne validée, sans retirer le préfixe, sans suivre les redirections et en ne transmettant que le cookie `SESSION` nécessaire. Il préserve ETag, les erreurs structurées et les en-têtes CSRF/If-Match autorisés ; mutations limitées à 64 KiB avec contrôle d’origine. Le login passe par les filtres Spring, la session JDBC et CSRF réels. Le contrat OpenAPI et le SDK/types/transport TypeScript sont générés et vérifiables ; les wrappers valident les réponses réseau à l’exécution. Résultats dans [P04](evidence/P04.md).

Next.js peut lire l’API sur une adresse interne configurée côté serveur. Il transmet seulement le cookie de session requis et les en-têtes explicitement nécessaires à cette API de confiance. Il ne relaie pas tous les cookies ou en-têtes vers une URL libre. Le navigateur utilise des URL relatives de même origine.

## Authentification et autorisation

Spring est la source d’autorité pour les comptes, sessions et permissions. Next.js n’a ni base d’utilisateurs parallèle, ni secret de session indépendant, ni JWT d’authentification dans `localStorage`.

Le cookie de session est `HttpOnly`, `Secure` en HTTPS de recette/production, `SameSite=Lax`, sans domaine partagé inutile et avec `Path=/` pour permettre les lectures serveur Next.js. La configuration HTTP locale est explicitement distincte. Le client ne lit pas le contenu du cookie.

Utiliser les filtres Spring pour la connexion par email/mot de passe : `POST /api/v1/auth/login`, corps `application/x-www-form-urlencoded` avec `email` et `password`, réponse JSON de succès ou erreur adaptée. Ce choix évite de recréer manuellement la rotation de session, la stratégie d’authentification et la persistance du contexte. Vérifier la configuration correspondant à la version Spring réellement retenue.

Le CSRF reste actif sur les mutations utilisant la session, y compris connexion et déconnexion. `GET /api/v1/auth/csrf` expose le jeton fourni par Spring et son nom d’en-tête. Le frontend le conserve en mémoire, l’envoie sur les mutations, puis le renouvelle après connexion, déconnexion ou expiration. Cette réponse est privée et non mise en cache. L’exception CSRF est limitée exactement à `POST /api/v1/webhooks/stripe`, protégé par la signature Stripe sur le corps brut. Aucun `.csrf().disable()` global.

Rôles de base : `LEARNER`, `ADMIN`. Les permissions de contenu, commerce et support sont distinctes. Un profil `EDITOR` limité peut être activé dans les tests d’autorisation et l’administration sans accéder automatiquement aux paiements. L’inscription publique ne reçoit jamais de rôle choisi par le client. La création initiale d’un administrateur utilise une procédure explicite et un secret fourni hors du dépôt ; aucun compte connu livré en production.

Réalisation P05 : V004 ajoute le rôle de référence EDITOR et les seules permissions `content.read`, `content.write`, `content.review`, `content.publish`, `content.archive`. Aucune attribution utilisateur ou permission commerciale n’est créée. Le filtre contrôle la route ; `EditorialService` contrôle à nouveau la permission en base, y compris après l’attente du verrou d’écriture. Le rôle ou l’acteur envoyé par un navigateur ne fait jamais autorité.

Chaque action privée vérifie identité, permission et propriété de l’objet. Les contrôles incluent téléchargement, export, présignature S3, création d’accès vidéo et lecture d’une révision. Les UUID limitent les collisions ; ils ne sont pas une autorisation. L’interface peut masquer une action, mais le serveur la refuse aussi lorsqu’elle est appelée directement.

## Modules du monolithe Spring

| Module | Responsabilité et objets |
| --- | --- |
| `identity` | Utilisateur, préférences, session, permissions, récupération d’accès |
| `catalog` | Parcours, modules, activités, guides, objectifs, recherche et projections publiques |
| `editorial` | Versions pédagogiques, révisions, traductions, publication, dépendances, validation |
| `learning` | Inscription à un parcours, progression, position par média, quiz et tentatives |
| `projects` | Production privée, révisions, grille versionnée, autoévaluation, revue optionnelle |
| `methods` | Modèle source, copie personnelle, catégories, notes et origine |
| `commerce` | Produits, offres, packs, conditions, commandes et instantanés achetés |
| `payments` | Adaptateur Stripe, événements entrants, paiement, remboursement et rapprochement |
| `access` | Attributions par origine et décision d’accès effective à une ressource/version |
| `assets` | Métadonnées de fichiers, propriété, autorisation et accès temporaires |
| `notifications` | Emails, outbox, tentatives, erreurs et reprise |
| `support` | Demandes d’aide, signalements et contexte de contenu |
| `operations` | Journal d’audit, incidents et indicateurs définis |

Organiser les packages par domaine avec contrôleur, service, modèle et dépôt selon leur besoin. Les services métier exposent des opérations explicites ; un contrôleur ne contourne pas les invariants en modifiant des dépôts de plusieurs modules. Éviter les abstractions génériques qui cachent les règles de paiement ou d’accès. Les transactions sont définies au niveau d’un cas d’utilisation.

## Données stables et versions

Identifiants techniques UUID, dates en UTC (`Instant`/`timestamptz`), langue de contenu explicite et montants en unités mineures entières avec devise. Les totaux utilisent une arithmétique exacte ; aucun `float` pour les prix. Vérifier les particularités des devises admises par l’offre, plutôt que de supposer deux décimales partout.

Un parcours ou une activité possède une identité stable, distincte du titre et du slug localisé. Une version pédagogique rassemble objectifs et évaluations. Une révision éditoriale corrige ou actualise son contenu. Une traduction référence une version et un état de revue. Les publications FR et EN équivalentes partagent les acquis ; elles ne créent pas deux achats.

Un quiz conserve la version des questions et la langue d’une tentative. Une évaluation conserve production soumise, révision, grille, méthode de vérification, date et provenance. Une attestation référence les preuves qui existaient lors de son émission. Une mise à jour ne réécrit pas une ancienne attestation.

Une méthode personnelle contient son propre texte et garde l’identifiant/version de sa source. La publication d’un nouveau modèle ou l’archivage de sa source ne remplace pas cette copie.

Les migrations sont incrémentales. Après utilisation dans un environnement partagé, ne pas réécrire une migration déjà exécutée. `ddl-auto=validate` dans les environnements intégrés ; pas de création/réinitialisation silencieuse de schéma. Les tables Spring Session sont également versionnées via Flyway pour la version installée. Les données de démonstration appartiennent à un profil/import séparé et désactivé en production.

Réalisation P03 : V001 Spring Session est conservée, comparée au schéma de l’artefact JDBC 4.1.1 installé ; V002 ajoute les douze tables du socle identité/contenu. Les instants passent par `Instant`/`timestamptz`, JDBC et Hibernate en UTC ; `spring.sql.init.mode=never` et l’initialisation Spring Session désactivée laissent Flyway seul responsable. UUID, `@Version`, FK RESTRICT, pointeurs éditoriaux composites et versions gelées sont détaillés dans [DATA_MODEL.md](DATA_MODEL.md). Les tables des autres modules seront ajoutées par leurs migrations, sans CRUD factices en P03.

Réalisation P05 : V004 est additive et conserve V001 à V003. L’identité stable admet COURSE, MODULE, ACTIVITY, GUIDE et METHOD_TEMPLATE ; guide et modèle sont des feuilles. Les documents du CMS sont des traductions d’une version, distinctes de l’identité `resourceId` et de la version `versionId`. Les révisions contiennent un document JSONB structuré append-only, auteur, date, motif et relation de remplacement. Les origines de duplication/version et les pointeurs de source sont protégés par FK et triggers. Un journal d’actions et les références vers les ressources complètent cet historique ; [DATA_MODEL.md](DATA_MODEL.md) décrit les clés et bornes exactes.

`EditorialService` porte les transactions JDBC explicites de création, correction, duplication, nouvelle version, traduction, composition, revue, publication et archivage. Les modèles JPA existants conservent la validation Hibernate du schéma ; les contrôleurs ne modifient pas directement les tables. P07 ajoute les copies personnelles avec leurs FK d’origine, décrites ci-dessous ; projets et attestations restent leurs lots, sans table factice en P05.

## Cycle éditorial et publication

Le cycle principal est DRAFT → TO_REVIEW → READY → PUBLISHED. READY résulte d’une action de vérification de la révision courante, avec `verified_at` et révision source examinée ; un déploiement ne remet jamais cette date à l’heure courante. Une correction ajoute une révision puis revient DRAFT, en gardant la publication précédente. STALE signale une actualisation nécessaire ; ARCHIVED retire la traduction de l’accès public tout en conservant son histoire. Aucun endpoint de suppression physique n’est exposé.

La version pédagogique gèle objectifs, évaluation et composition. Une publication de parent exige ses enfants gelés et publiés dans la même langue ; les triggers PostgreSQL refusent ensuite les modifications de composition. Une correction sous version gelée conserve par prudence les champs objectif localisé, exercice/corrigé, quiz et grille de sa langue : modifier un de ces champs exige une nouvelle version pédagogique. Une traduction initiale peut être rédigée avant sa première publication ; sa revue compare clés et structure du barème avec la source, avec des textes localisés propres. La revue humaine enregistrée reste nécessaire pour juger l’équivalence de sens.

FR/EN utilisent la même identité et la même version pour une pédagogie équivalente. La traduction conserve sa source initiale et la révision source effectivement examinée. Quand cette source est corrigée, marquée STALE ou archivée, ses traductions examinées deviennent STALE sans réécriture de leurs textes. Le graphe des compositions et références est consultable avant archivage avec ses conséquences ; P05 ne marque pas automatiquement tous les guides/parcours citants comme STALE et ne réécrit aucun historique de futur apprenant.

La readiness contrôle objectif, résultat, contenu, exercice/corrigé/grille requis pour une activité, langue, accès et dépendances. Le document JSON sérialisé est borné à 48 KiB UTF-8, avec des listes et champs eux-mêmes bornés. Les médias sont référencés par UUID, type et caractère obligatoire, sans URL arbitraire ni disponibilité fournie par le client. Une référence obligatoire non vérifiée bloque ; une référence facultative avertit. Le registre et le stockage réel seront livrés en P10. Une durée non mesurée peut rester absente avec un avertissement.

Publier exige `content.publish`, If-Match, un `revisionId` explicite, READY et une revue toujours applicable. Le service recontrôle la permission après les verrous et refait la readiness dans la transaction, puis gèle la pédagogie si nécessaire et déplace le pointeur publié. Une réponse readiness antérieure ne constitue pas une autorisation durable. La publication n’attribue ni prix ni droit payant ; l’offre achetable reste P11.

Les révisions P03 restent intactes avec `document=null`. Leur texte historique est exposé uniquement en privé via `legacyBody`, dans la vue et l’historique ; l’interface le rend comme texte échappé et permet sa conversion explicite. `STRUCTURED_DOCUMENT_REQUIRED` bloque la publication tant qu’un vrai document n’a pas été soumis. La migration ne transforme pas une ancienne fixture en contenu validé.

`AccessPolicy` est une abstraction interne avec contextes typés issus du serveur. Un contexte absent/inconnu, un compte inactif, un droit pédagogique non confirmé, une propriété différente ou une permission manquante conduisent au refus. Le rôle ADMIN seul ne suffit pas. Les productions personnelles restent évaluées par propriétaire séparément du droit pédagogique. Cette politique ne remplace ni les filtres Spring existants, ni les futurs contrôles de cas d’utilisation ; ses snapshots ne doivent jamais être acceptés tels quels depuis un corps HTTP.

## Sauvegarde et concurrence

Les objets modifiables portent une révision numérique. L’API expose un `ETag` fort et exige `If-Match` sur les modifications/suppressions concernées. Une précondition manquante produit 428, une révision dépassée 412. L’application conserve la saisie et permet de comparer, recharger ou recopier ; elle n’écrase pas la nouvelle version avec l’ancienne.

Pour le CMS P05, les mutations verrouillent d’abord l’identité stable puis ses versions/traductions dans un ordre déterminé. La révision est rechargée et If-Match comparé après l’attente ; la permission est recontrôlée à ce moment. Toutes les révisions de la famille sont augmentées lorsqu’une mutation change les langues liées ou le gel inclus dans les vues, afin que leur ETag fort reste cohérent. Les lectures composées utilisent une transaction REPEATABLE_READ : texte, enfants et états de traduction proviennent du même instantané. Ces compteurs ne remplacent pas les dates de revue.

Le message « Enregistré » suit une confirmation persistée du serveur correspondant à la saisie concernée. Une ancienne réponse réseau ne remet pas à zéro des modifications plus récentes et ne remplace pas leur révision. Un brouillon anonyme temporaire peut être gardé dans `sessionStorage`, avec un avertissement de durée et un contexte borné. P07 utilise un UUID de brouillon de méthode, une durée de deux heures et un import volontaire après identification ; les futurs imports d’activité/projet suivront leurs propres services. Le propriétaire reste celui de la session, jamais un `userId` fourni dans le brouillon.

## Contenu et mise en cache

Séparer la projection publique de catalogue des contenus de leçon protégés. Un écran verrouillé ne suffit pas si le texte premium est déjà sérialisé dans le HTML, le JSON de navigation, le bundle ou une réponse de cache publique.

Les réponses personnelles, commandes, jetons CSRF, états d’accès et prévisualisations utilisent `Cache-Control: private, no-store` ; les lectures privées Next.js ne sont pas placées dans un cache partagé. Une page publique peut être mise en cache selon langue et version publiée ; sa personnalisation passe par une lecture privée séparée. Une erreur d’API affiche une erreur explicite, sans basculer en données fictives en production.

Rendre des blocs éditoriaux structurés ou du Markdown assaini. Ni HTML utilisateur exécuté, ni URL de média arbitraire téléchargée côté serveur. Les liens, médias et champs riches suivent une politique de validation documentée.

P05 fournit une projection minimale `/api/v1/contents/{resourceId}?locale=fr`, séparée de l’aperçu authentifié. Elle choisit la dernière version ayant une publication, toutes langues confondues, puis exige la langue demandée : aucune ancienne version EN n’est utilisée silencieusement parce que seule FR existe sur la nouvelle version. Un document manquant ou archivé produit 404 ; une traduction dépassée expose les seules métadonnées publiées et l’état STALE. L’archivage de la dernière publication ne réaffiche pas une publication plus ancienne. La lecture historique selon une version achetée reste à ajouter avec les droits correspondants.

Le corps public FREE utilise un DTO dédié sans `correction`, `correctOption` ni explication des réponses au quiz. Les politiques de révélation du corrigé et de tentative seront traitées en P08. PROTECTED et STALE ont `document=null` ; aucun texte premium, brouillon, historique privé ou `legacyBody` ne traverse cette projection. Les blocs restent du texte rendu sans exécution HTML/MDX. Les URL de lien sont limitées à HTTPS sans identifiants ou à un chemin interne simple.

## Catalogue public et métadonnées — P06

V005 ajoute `editorial_public_metadata`, un instantané JSONB par révision éditoriale protégé contre UPDATE/DELETE, et deux colonnes de publication sur la traduction : `published_verified_at` et `published_source_revision_id`. V001 à V004 restent intactes. Les métadonnées publiques couvrent tâches, niveau, public, outils, sources, FAQ et modalités d’évaluation, sans prix ni offre. Les tâches et niveaux sont choisis explicitement dans une taxonomie stable issue du dossier de référence ; l’absence de valeur reste vide/NULL.

L’édition des métadonnées est un cas d’utilisation autorisé `content.write`, sous CSRF et If-Match. Elle crée une nouvelle révision avec le même document puis repasse DRAFT ; la publication précédente garde ses métadonnées. Une correction ordinaire les conserve, duplication/nouvelle version en recopient l’instantané en brouillon et une traduction initiale démarre avec des textes de description vides. Les données anciennes n’acquièrent aucune audience, source ou estimation fictive par la migration.

Au moment de publier, le service capture la date de revue et la révision source examinée avec le pointeur publié. Une nouvelle revue READY ne déplace donc pas la date visible de l’ancienne publication et ne remet pas seule en ligne une traduction dépassée. Le backfill V005 reprend les valeurs de l’état PUBLISHED ; pour une publication ancienne dans un autre état, il ne récupère qu’une date READY prouvée par le journal avant PUBLISH. Date et source non reconstituables restent NULL. Une traduction dont la source publiée examinée est inconnue reste publiquement STALE jusqu’à revue/publication explicites, avec ses données historiques conservées.

`PublicCatalogueService` fournit recherche/facettes et détail par identité, slug strict type/langue ou UUID de version exacte. La recherche PostgreSQL est paramétrée, paginée et déterministe ; elle combine texte, type, tâche, niveau, langue et accès. Elle exclut les brouillons sans publication, retraits et traductions dépassées/manquantes côté serveur. TITLE trie par titre normalisé puis UUID ; RECENT utilise le véritable événement PUBLISH de la révision publiée, avec les dates inconnues en dernier, puis UUID. Les facettes ne proposent que des valeurs réellement présentes dans des publications disponibles.

Le catalogue courant sélectionne la version publiée la plus récente de chaque identité, toutes langues confondues, puis vérifie sa langue demandée. Il ne remplace ni une traduction manquante par une autre activité, ni une version retirée par une ancienne publication. Les détails distinguent MISSING_TRANSLATION, STALE et WITHDRAWN et exposent les langues équivalentes de cette même identité/version. Une identité jamais publiée reste 404.

Le programme public charge les métadonnées COURSE→MODULE→ACTIVITY dans l’ordre des compositions. Chaque enfant conserve exactement `child_version_id`, même si son identité possède une version ultérieure publiée. Un enfant retiré reste indiqué WITHDRAWN à cet endroit. La lecture publique d’une version précise sert ce contexte et peut aussi ouvrir une ancienne version FREE encore publiée et non retirée ; elle ne constitue pas la future politique privée de version achetée. Les contrôles de droits et acquis des prochains lots devront conserver cette distinction.

Les objectifs, résultats, prérequis et durées de description sont publics ; une durée inconnue reste NULL. FREE utilise la projection sans solutions. PROTECTED garde `document=null`, sans blocs, exercice, quiz, grille ni corrigé, et ses modalités publiques sont un champ éditorial distinct de la définition canonique d’évaluation. Les lectures P06 sont `Cache-Control:no-store` et REPEATABLE_READ pour conserver un instantané cohérent, sans copie publique périmée après publication/retrait. P06 ne revendique aucune invalidation de cache partagée ; une éventuelle optimisation devra préserver langue, version et retrait effectif. La personnalisation, la reprise, les prix et la vente restent séparés et seront reliés seulement à leurs services réels.

## Méthodes personnelles et générateur — P07

Le module `methods` fournit `MethodService`, contrats `MethodTypes`, validation métier et DTO HTTP explicites. V006 crée `personal_methods` et les permissions `methods.read`/`methods.write` du rôle LEARNER, sans compte ni contenu seedé. Les huit opérations propriétaires `/me/methods` et la lecture publique de modèle versionné sont décrites dans [API_CONTRACTS.md](API_CONTRACTS.md). Aucun endpoint de test ou service IA ne remplace cette intégration.

`MethodDefinition` est un champ nullable de `ContentDocument`, dans le JSONB append-only de la révision éditoriale. Il porte cas d’usage, entrées, étapes, instruction initiale, exemple, vérifications, limites et sept paramètres par défaut ; SaveRevision P05 reste l’unique édition de ce document. Une définition incomplète est admise en brouillon mais bloque une nouvelle publication METHOD_TEMPLATE avec `METHOD_DEFINITION_REQUIRED`. Les anciens JSON sans ce champ restent lisibles avec null ; les articles P06 déjà publiés annoncent `MISSING_DEFINITION` pour le générateur. Le corps `PublicDocument` ne livre la définition que dans une publication FREE ; aucune définition PROTECTED ou traduction indisponible n’est exposée. Il n’existe ni table éditoriale annexe ni extraction supposée fiable depuis des paragraphes.

La copie personnelle contient texte, paramètres, dernier jeu assemblé facultatif, notes, catégorie et langue du texte. Son origine resource/version/traduction/révision est capturée par le serveur, complète ou absente et protégée par FK/trigger ; elle ne devient jamais une synchronisation de contenu. Une mise à jour ou un retrait de source préserve la copie, qui reste modifiable et duplicable par son propriétaire. Créer une nouvelle copie depuis un modèle vérifie au contraire le snapshot exact encore publié, FREE, disponible et défini ; un rôle EDITOR ne contourne pas cette politique avant la future attribution de droits pédagogiques.

Le service réévalue compte actif et permission, sélectionne la copie par `(id, owner_id)`, puis verrouille sa ligne pour modifier, supprimer ou dupliquer. Après attente, il recontrôle l’acteur et compare If-Match ; la mise à jour de révision est atomique. Le détail n’inclut aucun statut dynamique de source : son tag fort `personal-method-{id}-r{revision}` décrit un instantané personnel stable. `source-update`, lecture séparée sans ce tag, examine la publication courante de la même identité/langue et annonce NONE/CURRENT/UPDATE_AVAILABLE/UNAVAILABLE ; elle ne revient pas silencieusement à une ancienne version disponible dans une autre langue. Les lectures composées sont REPEATABLE_READ, privées et sans cache partagé.

Toutes les mutations de méthodes demandent `X-Account-Context`, UUID du compte attendu par l’interface. Le service le compare à l’acteur authentifié dans la transaction : ce header est une **précondition**, jamais une autorité de propriété. Son absence reçoit 428 ; un autre compte reçoit 409 `ACCOUNT_CONTEXT_CHANGED`. Le CSRF Spring reste requis. Cette combinaison empêche qu’un ancien formulaire A soit enregistré sous B après changement de session ; aucune répétition automatique du POST ne décide d’un import pour l’utilisateur.

Le générateur assemble localement les sept paramètres ; objectif, données disponibles et format sont requis, contexte facultatif. Le texte final et le marqueur `generatedFrom` restent indépendants des modifications ultérieures des champs. Reconstruction et réinitialisation demandent une action explicite, copie et sélection manuelle ne prétendent pas exécuter l’instruction. Seul un essai anonyme volontaire, annoncé non sensible, peut être conservé deux heures ; l’éditeur privé conserve sa saisie en mémoire et propose sa copie. L’import après identification est explicite sous le compte affiché ; logout/réinitialisation purge les clés personnelles ciblées. La navigation FR/EN traduit les routes E12 et conserve la langue/les notes du texte personnel.

Le global PostgreSQL/Java compte **78 tests réussis** ; les **42 tests client** incluent des doubles réseau/stockage clairement identifiés. Cela couvre notamment propriété, comptes successifs, concurrence, snapshot malgré retrait et limites de transport. Build web, cycle HTTP réel, recette Chromium et revue visuelle ont ensuite été vérifiés localement ; résultats dans [evidence/P07.md](evidence/P07.md). La reprise reliée à une production et le contenu définitif restent P08/P18, sans extension IA annoncée terminée.

## Apprentissage, notes et quiz — P08

Le module `learning` fournit `LearningService`, DTO explicites, `LearningValidation` et cinq tables additives V007. Les routes réelles et préconditions sont dans [API_CONTRACTS.md](API_CONTRACTS.md), les vérifications dans [evidence/P08.md](evidence/P08.md). L’inscription est un **suivi**, jamais un droit acheté : un programme publié peut contenir une première activité FREE et des activités PROTECTED encore refusées. ACTIVE/PROTECTED/UNAVAILABLE décrivent les accès réellement disponibles ; expiration et révocation commerciales attendent leurs services.

L’inscription unique propriétaire/version de parcours capture l’ordre et les versions pédagogiques du programme. Son dénominateur compte les versions d’activité distinctes, sans varier avec langue, correction ou version plus récente. La même identité peut apparaître avec deux versions ; les lectures d’activité/progrès exigent ce couple exact. Le service vérifie aussi la chaîne parcours/module/activité : un parent retiré ou une traduction indisponible neutralise le corps enfant, même si cet enfant reste FREE ailleurs. Les prérequis textuels sont présentés ; ni temps de visionnage ni score ne bloque arbitrairement la navigation.

Progrès précréé à zéro, visite de reprise, lecture déclarée, activité déclarée terminée et réussite du quiz sont des faits séparés. Une visite ne touche pas l’ETag de progrès. La note privée est unique par propriétaire/version d’activité et conserve sa langue originale ; retrait et changements d’accès ne suppriment pas son texte ni les tentatives historiques. Notes et progrès ont des révisions/ETags individuels, séparés des enveloppes dynamiques. Écritures sous permission, propriétaire, CSRF, contexte de compte attendu et If-Match lorsque requis, recontrôlés dans la transaction. Le tableau de bord retrouve uniquement des activités encore accessibles et des résumés de méthodes autorisés ; aucun état projet n’est créé avant P09.

`quizPolicy`, nullable dans le document éditorial immuable, définit seuil 1..100 et nombre de tentatives nullable/1..50. Absence historique : politique effective 100 % et tentatives illimitées. Cette forme effective est comparée au gel et à l’équivalence de traduction ; un même défaut explicité n’est pas une nouvelle pédagogie, un seuil différent l’est. La lecture initiale reste sans solutions. Le serveur valide toutes les clés/options reçues et corrige à partir de la publication exacte ; le client ne choisit aucun score.

Une correction formative publique exige CSRF et une publication FREE exacte, mais ne crée aucune donnée pédagogique durable ; elle reste distincte de la session CSRF anonyme du framework. La tentative authentifiée capture questions/options/correction/barème/politique, révision, version, langue et réponses dans un snapshot append-only. La limite est commune FR/EN par propriétaire/version. `submissionId` et empreinte du corps rendent une soumission idempotente sous verrou de compte : même requête retrouve le résultat, corps différent est refusé. Un replay historique après retrait ne crée pas une nouvelle correction. Aucun de ces résultats ne valide un projet ou une compétence.

Les lectures privées utilisent REPEATABLE_READ/no-store. Le client vérifie tags, identités/versions et cohérence des résultats ; sauvegardes lentes, conflits et changement de compte suivent les garanties P07, avec saisie conservée et aucune répétition écrasante. Le raccordement média est limité à `LearningMediaPort`, résolution autorisée par mediaId et durée serveur, position finie propre au média/langue/version. Aucun lecteur ou endpoint de position n’est annoncé disponible avant P10 ; le texte pédagogique reste l’outil réel. Le diagnostic facultatif n’est pas activé. Les validations globales/web sont consignées dans la preuve au moment de leur exécution.

## Offres et commande

Le contenu publiable et l’offre achetable ont deux états distincts. Les prix, devise, fiscalité applicable, langues vendues, durée d’accès, actualisations et support proviennent de paramètres explicites. Une configuration incomplète bloque la vente, sans inventer une durée illimitée ou un prix.

Le navigateur fournit un identifiant d’offre et la révision qu’il a consultée. Le serveur calcule le récapitulatif et enregistre un instantané : offre/version, lignes, ressources, langues, montants, conditions et engagement d’actualisation. Les ressources d’un pack sont figées pour cette commande. Une modification de l’offre exige un nouveau récapitulatif accepté. La création du Checkout enregistre l’acceptation explicite de la version des conditions présentée ; la simple lecture d’une page ne vaut pas acceptation.

Une commande préparée n’est ni un paiement réussi ni un droit. Une même intention de création possède une clé d’idempotence liée à l’utilisateur, à l’opération et au corps de la requête. Une réutilisation avec un corps différent est refusée. Le double clic est traité aussi côté serveur. Un parcours déjà couvert est présenté comme accessible ; l’achat d’un pack contenant un élément déjà détenu doit rendre le chevauchement visible, sans inventer de réduction.

## Paiement et reprise durable

Le navigateur quitte le site pour Stripe Checkout puis revient vers l’état de sa commande. Le paramètre de retour ne confirme rien. L’API propriétaire renvoie séparément paiement, accès et incident éventuel. Le Checkout ne peut être créé qu’après vérification du compte, du récapitulatif, des conditions et de la configuration du mode test/live.

Le webhook vérifie la signature sur le corps brut, le mode et les identifiants attendus, puis enregistre durablement l’événement avant l’accusé de réception. Une boîte d’entrée persistée conserve identité de l’événement, type, objet externe, état de traitement et tentatives. Réduire les données conservées aux informations nécessaires et protéger les éventuelles charges utiles soumises à rétention.

Un traitement reprenable rapproche les objets Stripe et la commande, les montants/devise, le compte fournisseur et les lignes. Il ne s’appuie ni sur la seule présence de `checkout.session.completed`, ni sur une simple comparaison chronologique d’événements. Les moyens différés ont un état d’attente explicite.

Unicité de l’événement entrant et unicité de chaque attribution métier sont deux protections distinctes. Sous transaction/verrouillage approprié, créer les droits manquants et les notifications à envoyer. Une panne entre réception et attribution laisse un travail repris par le worker. Les erreurs de livraison d’email sont indépendantes des droits acquis.

Les appels externes et les transactions PostgreSQL ne forment pas une transaction atomique commune. Préparer une opération persistée, appeler Stripe avec une clé d’idempotence stable, puis rapprocher le résultat. Après un timeout ambigu, retrouver l’opération existante avant d’en créer une nouvelle. Un worker simple avec état, prise de bail/verrou et reprises bornées suffit ; aucune file distribuée obligatoire.

## Droits par origine et remboursement

Chaque attribution relie utilisateur, ressource, origine d’achat/ligne, période, langues et politique de version achetée. L’accès effectif existe si au moins une origine active couvre la ressource et la version demandées. Les règles d’inclusion des nouvelles versions ne deviennent pas « toutes les futures versions » par défaut.

Conserver paiement, remboursement, droit et progression comme dimensions séparées. Un paiement historiquement réussi reste identifiable après remboursement. Une demande de remboursement ou un échec de remboursement ne devient pas une confirmation.

Exemple obligatoire : achat individuel A, puis pack A+B. Après remboursement intégral confirmé du pack, retirer les attributions provenant du pack. A reste accessible via l’achat individuel ; B cesse d’être accessible si aucune autre origine ne le couvre.

Pour un remboursement partiel, conserver montant, allocations de lignes, décision d’accès et motif. La décision précise les attributions retirées, ou le geste commercial qui conserve les accès. Elle est présentée avant confirmation. Une réussite financière confirmée applique cette décision exactement une fois. Une ancienne notification de paiement ne peut réactiver une attribution déjà retirée pour remboursement.

Réserver les montants des remboursements en cours pour empêcher deux opérations concurrentes de dépasser le montant encore remboursable. Toute opération d’état inconnu est rapprochée avant une nouvelle tentative. Les modifications de droits sont journalisées sans supprimer productions, notes, tentatives ou preuves.

## Qualité et preuves

JUnit et tests d’intégration PostgreSQL via Testcontainers couvrent transactions, contraintes, doublons et concurrence. Les tests de sécurité passent par les vrais filtres et services Spring. Les tests frontend couvrent les transitions à risque ; les essais navigateur utilisent une API réelle pour les parcours intégrés.

Les scénarios T04–T13 et T19 ne sont pas validés par des mocks d’interface. Les tests d’intégration locaux peuvent doubler le réseau externe de Stripe, mais doivent exécuter les contrôles de signature, persistance, droits et reprise de l’application. Les essais Stripe de bout en bout en mode test sont consignés séparément. Si une clé, Docker ou un environnement manque, marquer le test bloqué et conserver la commande de reprise.

## Sources techniques

Sources officielles consultées le 7 novembre 2026 ; vérifier les pages de la version réellement installée avant de reprendre une API d’exemple.

- [Spring Security — CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) : jeton par endpoint, renouvellement après authentification/déconnexion, protection des mutations.
- [Spring Security — Form Login](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/form.html) : chaîne d’authentification, stratégies de session et handlers.
- [Spring Session — JDBC avec Spring Boot](https://docs.spring.io/spring-session/reference/guides/boot-jdbc.html) : session persistée en base relationnelle ; adapter le schéma à PostgreSQL et Flyway.
- [Stripe — Fulfill orders](https://docs.stripe.com/checkout/fulfillment) : confirmation indépendante de la page de retour et paiements différés.
- [Stripe — Webhooks](https://docs.stripe.com/webhooks) : signature, événements répétés et ordre non garanti.
- [Stripe — Idempotent requests](https://docs.stripe.com/api/idempotent_requests) : clés de réessai des opérations externes, distinctes des contraintes métier locales.
- [Stripe — Refunds](https://docs.stripe.com/refunds) : remboursements complets/partiels et états qui nécessitent un suivi.

Complément P05 consulté le 8 novembre 2026 : [PostgreSQL 18 — isolation des transactions](https://www.postgresql.org/docs/18/transaction-iso.html) et [Spring — `@Transactional`](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html). La page Spring flottante affichait 7.0.10 ; les versions installées restent celles de VERSIONS.md et du BOM, sans changement de dépendance induit par cette lecture.
