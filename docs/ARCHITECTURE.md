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

État P03 : le Route Handler Next relaie les lectures GET/HEAD de `/api/v1` vers l’origine interne validée, sans retirer le préfixe, sans suivre les redirections et en ne transmettant que le cookie `SESSION` nécessaire. Il préserve ETag et les erreurs structurées. Les mutations et leurs en-têtes CSRF seront raccordés en P04 ; aucun login simulé n’est livré. Le contrat OpenAPI et le SDK/types/transport TypeScript sont générés et vérifiables ; le wrapper de sonde conserve une validation des réponses réseau à l’exécution.

Next.js peut lire l’API sur une adresse interne configurée côté serveur. Il transmet seulement le cookie de session requis et les en-têtes explicitement nécessaires à cette API de confiance. Il ne relaie pas tous les cookies ou en-têtes vers une URL libre. Le navigateur utilise des URL relatives de même origine.

## Authentification et autorisation

Spring est la source d’autorité pour les comptes, sessions et permissions. Next.js n’a ni base d’utilisateurs parallèle, ni secret de session indépendant, ni JWT d’authentification dans `localStorage`.

Le cookie de session est `HttpOnly`, `Secure` en HTTPS de recette/production, `SameSite=Lax`, sans domaine partagé inutile et avec `Path=/` pour permettre les lectures serveur Next.js. La configuration HTTP locale est explicitement distincte. Le client ne lit pas le contenu du cookie.

Utiliser les filtres Spring pour la connexion par email/mot de passe : `POST /api/v1/auth/login`, corps `application/x-www-form-urlencoded` avec `email` et `password`, réponse JSON de succès ou erreur adaptée. Ce choix évite de recréer manuellement la rotation de session, la stratégie d’authentification et la persistance du contexte. Vérifier la configuration correspondant à la version Spring réellement retenue.

Le CSRF reste actif sur les mutations utilisant la session, y compris connexion et déconnexion. `GET /api/v1/auth/csrf` expose le jeton fourni par Spring et son nom d’en-tête. Le frontend le conserve en mémoire, l’envoie sur les mutations, puis le renouvelle après connexion, déconnexion ou expiration. Cette réponse est privée et non mise en cache. L’exception CSRF est limitée exactement à `POST /api/v1/webhooks/stripe`, protégé par la signature Stripe sur le corps brut. Aucun `.csrf().disable()` global.

Rôles de base : `LEARNER`, `ADMIN`. Les permissions de contenu, commerce et support sont distinctes. Un profil `EDITOR` limité peut être activé dans les tests d’autorisation et l’administration sans accéder automatiquement aux paiements. L’inscription publique ne reçoit jamais de rôle choisi par le client. La création initiale d’un administrateur utilise une procédure explicite et un secret fourni hors du dépôt ; aucun compte connu livré en production.

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

`AccessPolicy` est une abstraction interne avec contextes typés issus du serveur. Un contexte absent/inconnu, un compte inactif, un droit pédagogique non confirmé, une propriété différente ou une permission manquante conduisent au refus. Le rôle ADMIN seul ne suffit pas. Les productions personnelles restent évaluées par propriétaire séparément du droit pédagogique. Cette politique ne remplace ni les filtres Spring existants, ni les futurs contrôles de cas d’utilisation ; ses snapshots ne doivent jamais être acceptés tels quels depuis un corps HTTP.

## Sauvegarde et concurrence

Les objets modifiables portent une révision numérique. L’API expose un `ETag` fort et exige `If-Match` sur les modifications/suppressions concernées. Une précondition manquante produit 428, une révision dépassée 412. L’application conserve la saisie et permet de comparer, recharger ou recopier ; elle n’écrase pas la nouvelle version avec l’ancienne.

Le message « Enregistré » suit une confirmation persistée du serveur correspondant à la saisie concernée. Une ancienne réponse réseau ne remet pas à zéro des modifications plus récentes et ne remplace pas leur révision. Un brouillon anonyme temporaire peut être gardé dans `sessionStorage`, avec un avertissement de durée et une clé par activité/langue. Après identification, l’import vérifie à nouveau l’activité, les champs, le propriétaire et la révision ; il ne fait pas confiance à un `userId` fourni dans le brouillon.

## Contenu et mise en cache

Séparer la projection publique de catalogue des contenus de leçon protégés. Un écran verrouillé ne suffit pas si le texte premium est déjà sérialisé dans le HTML, le JSON de navigation, le bundle ou une réponse de cache publique.

Les réponses personnelles, commandes, jetons CSRF, états d’accès et prévisualisations utilisent `Cache-Control: private, no-store` ; les lectures privées Next.js ne sont pas placées dans un cache partagé. Une page publique peut être mise en cache selon langue et version publiée ; sa personnalisation passe par une lecture privée séparée. Une erreur d’API affiche une erreur explicite, sans basculer en données fictives en production.

Rendre des blocs éditoriaux structurés ou du Markdown assaini. Ni HTML utilisateur exécuté, ni URL de média arbitraire téléchargée côté serveur. Les liens, médias et champs riches suivent une politique de validation documentée.

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
