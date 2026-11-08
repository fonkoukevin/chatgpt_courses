# Modèle relationnel — socle P03

Les migrations sont la définition exécutable du schéma. Ce document distingue les tables livrées par P03 des extensions à créer dans les lots métier. Aucun diagramme ne constitue une API ou un parcours déjà intégré.

## Identité et contenu présents

V001 conserve les deux tables officielles de Spring Session JDBC 4.1.1. V002 ajoute douze tables, sans données de démonstration et sans mécanisme concurrent de création automatique.

| Table | Identité et relations | Invariants |
| --- | --- | --- |
| `user_accounts` | UUID, email normalisé unique, empreinte de mot de passe, statut | Aucune inscription/API active en P03 ; statut anonymisé sans identifiants de connexion ; ni hash ni entité retournés au navigateur |
| `user_preferences` | UUID, FK utilisateur unique | Locale FR/EN, fuseau explicite ; ressource révisable distincte du compte |
| `roles`, `permissions` | UUID et code stable unique | Autorisations éditoriales et financières séparables ; aucun rôle fourni par un navigateur ne fait autorité |
| `user_roles`, `role_permissions` | UUID par attribution, FK explicites, révocation | Unicité des attributions actives, historique conservé ; révoquer ne réécrit ni ne supprime l’origine |
| `learning_resources` | UUID stable, type COURSE/MODULE/ACTIVITY | L’identité et le type ne changent pas avec le titre, la langue ou le slug ; archivage distinct de suppression |
| `pedagogical_versions` | UUID, FK ressource, numéro unique par ressource | Objectifs et définition d’évaluation ; gel irréversible après construction ; changement pédagogique ⇒ nouvelle version UUID |
| `version_compositions` | UUID, FK version parent/enfant, position | COURSE→MODULE→ACTIVITY ; enfant et position uniques par parent ; composition conservée pour chaque version |
| `resource_slugs` | UUID, FK composite ressource/type, langue, slug | Unique `(type, locale, slug)` et `(resource, locale)` ; slug canonique de l’identité, indépendant de la version |
| `content_translations` | UUID, FK version pédagogique, locale | Unique `(version, locale)` ; état éditorial et pointeurs de révision courante/publiée révisables |
| `editorial_revisions` | UUID, FK traduction, numéro, auteur éventuel | Instantané append-only ; numéro unique par traduction ; aucun UPDATE/DELETE d’une révision historique |

Les guides et modèles de méthodes n’appartiennent pas encore à l’enum COURSE/MODULE/ACTIVITY ; leur lot ajoutera leurs structures et contraintes. Aucun faux catalogue public n’est activé par ces tables.

```mermaid
erDiagram
  user_accounts ||--o| user_preferences : preferences
  user_accounts ||--o{ user_roles : attributions
  roles ||--o{ user_roles : role
  roles ||--o{ role_permissions : autorise
  permissions ||--o{ role_permissions : permission
  learning_resources ||--o{ resource_slugs : langues
  learning_resources ||--o{ pedagogical_versions : versions
  pedagogical_versions ||--o{ version_compositions : parent
  pedagogical_versions ||--o{ version_compositions : enfant
  pedagogical_versions ||--o{ content_translations : traductions
  content_translations ||--o{ editorial_revisions : historique
```

## Versions, corrections et publication

Une version pédagogique fixe objectifs, évaluation et composition. Elle peut être construite tant qu’elle n’est pas gelée ; les versions enfants doivent être gelées avant leur parent. Le verrou de ligne du parent protège aussi les modifications concurrentes de sa composition. Après gel, ajout, modification, suppression de composition et modification de version sont refusés en base.

Une correction de texte ajoute une révision éditoriale sous **la même traduction et la même version pédagogique**. Une évolution d’objectif/évaluation crée une nouvelle version pédagogique ; les anciennes versions restent adressables pour les futures tentatives, productions et attestations. Les contenus traduits de versions équivalentes conservent les mêmes identifiants pédagogiques ; les révisions de texte restent propres à leur langue.

Les FK composites des pointeurs courants/publiés empêchent de publier une révision appartenant à une autre traduction ou version. La publication exige une pédagogie gelée. Le workflow complet, la revue de traduction et les permissions de publication seront réalisés en P05 ; un statut stocké ne remplace pas ces contrôles serveur.

Les slugs sont canoniques par type/langue. Les routes imbriquées d’activité vérifieront également l’appartenance au programme de la version du parcours. Changer un slug ne change pas la ressource ni ses acquis ; alias/redirections seront ajoutés avec le routage public, sans déduire un identifiant d’un titre.

## Types, concurrence et suppression

- UUID pour les identifiants et FK métier. Les identifiants de session historiques gardent le format officiel Spring Session de V001.
- Instants `Instant`/`timestamptz`, connexions JDBC et Hibernate en UTC. PostgreSQL conserve un instant ; le fuseau de préférence sert à l’affichage. Dates non finies et chronologies incohérentes refusées par contraintes.
- Révision numérique optimiste `@Version` sur les ressources modifiables ; les révisions éditoriales immuables ont leur numéro historique propre. Un ETag fort référence type, UUID et révision ; la précondition HTTP doit être associée au contrôle atomique Hibernate dans la transaction du futur cas d’utilisation.
- Montants futurs en `BIGINT` unités mineures avec devise explicite ; transport JSON limité aux entiers exacts JavaScript. Pas de `float`, pas d’hypothèse universelle de deux décimales. `Money`/OpenAPI vérifient syntaxe et bornes ; la liste des devises réellement autorisées appartiendra à la configuration commerciale serveur.
- Les FK métier sont `ON DELETE RESTRICT`. Les instantanés éditoriaux et attributions historiques sont protégés. L’anonymisation du compte est distincte de la suppression physique ; rétention et procédure d’effacement seront précisées dans les lots concernés. Seule la suppression des attributs de session suit le CASCADE officiel V001.
- Les liens JPA sont des UUID explicites, sans graphes sérialisés ni cascades implicites. Les DTO publics sont construits par mapping ; les entités ne sont pas des réponses HTTP.

## Relations réservées aux lots suivants — non migrées en P03

Les noms suivants expriment les clés et règles attendues. Ils seront concrétisés par migrations additionnelles avec leur fonctionnalité et ses tests, sans CRUD anticipé.

| Lot | Relations/contraintes à introduire | Conservation obligatoire |
| --- | --- | --- |
| P04 identité | Jetons à empreinte, expiration, usage unique ; utilisateur FK ; permissions côté serveur | Aucun administrateur connu, mot de passe en clair ou rôle client ; rotation/expiration des sessions Spring |
| P07 méthodes | Copie personnelle UUID, propriétaire FK, texte/paramètres/langue propres, révision optimiste ; origine vers modèle/version/révision source | Nouvelle source ou archivage ne met jamais à jour le texte de la copie ; supprimer un droit n’efface pas la copie |
| P08 apprentissage | Inscription unique `(user, course)` ; acquis référencés par identité/version équivalente ; tentative quiz → utilisateur, activité/version, version des questions, locale | Historique des tentatives et barème conservés ; position média unique par utilisateur/média, distincte des acquis FR/EN |
| P09 productions | Projet → propriétaire, activité et version pédagogique ; révision de projet append-only ; autoévaluation → révision soumise, grille versionnée, provenance déclarative | Corrigé consulté, autoévaluation et revue humaine restent des preuves distinctes ; aucune cascade depuis achat/droit |
| P10 fichiers | Métadonnées UUID, propriétaire, clé objet serveur, statut ; FK au projet/révision si nécessaire | Vérification d’accès à chaque nouvel accès temporaire, aucune URL libre choisie par le navigateur |
| P11 commandes | Commande → propriétaire ; lignes → snapshot offre/révision ; ressources promises → UUID ressource, version/politique et langues ; montant/devise/conditions figés | Ni changement de pack ni nouvelle offre ne modifie les lignes achetées ; aucun total autoritaire reçu du navigateur |
| P12 paiements | Opération fournisseur → commande, mode/compte fournisseur, montant/devise ; événements entrants uniques par fournisseur/compte/mode/identifiant ; clés d’idempotence liées à utilisateur/opération/empreinte | Réception durable et effet métier uniques séparément ; paiement réussi et activation en attente peuvent coexister |
| P12 droits | Attribution UUID → utilisateur, ressource/version/politique, origine **FK vérifiable** (ligne-ressource achetée ou origine manuelle explicite), périodes/langues | Unicité par origine et ressource, jamais seulement `(user, course)` ; chaque achat individuel et pack conserve sa propre attribution |
| P13 remboursements | Remboursement → paiement, allocations de lignes et décision d’accès explicite ; réservation des montants en cours et idempotence | Réussite financière distincte de demande ; retrait des seules origines concernées après confirmation, jamais des productions/progrès |
| P14 attestations | Attestation → utilisateur, version pédagogique et références exactes de preuves/révisions émises | Une nouvelle version ne réécrit pas l’attestation ; aucune certification ou correction humaine déduite d’une autoévaluation |

L’origine d’un droit ne sera pas un simple couple texte/UUID sans intégrité : les migrations concernées définiront des FK vers l’origine réelle et une contrainte d’exclusivité entre types d’origine. Une attribution révoquée garde son historique ; une ancienne notification de paiement ne pourra pas la réactiver. Si A a été acheté seul puis dans A+B, le remboursement du pack retire uniquement ses origines ; A reste couvert par l’achat individuel.

Les suppressions physiques et opérations financières nécessiteront des cas d’utilisation explicites. Aucun remboursement ne déclenchera une cascade vers notes, projets, méthodes, tentatives ou attestations.

## Données locales et preuves

Les migrations structurelles ne contiennent aucune fixture ni prix. Le chargement explicite local et les fixtures Testcontainers sont séparés, identifiés comme fictifs, réexécutables et interdits en production. Le suivi des commandes et résultats réellement exécutés est dans [evidence/P03.md](evidence/P03.md).

Références techniques consultées : [contraintes PostgreSQL 18](https://www.postgresql.org/docs/18/ddl-constraints.html), [instants PostgreSQL 18](https://www.postgresql.org/docs/18/datatype-datetime.html), [Spring Boot SQL](https://docs.spring.io/spring-boot/reference/data/sql.html), [Hibernate ORM 7.4](https://docs.hibernate.org/orm/7.4/userguide/html_single/). Les règles commerciales restent celles de [PRODUCT.md](PRODUCT.md) et [DECISIONS.md](DECISIONS.md).
