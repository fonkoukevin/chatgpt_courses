# ChatGPT Courses

Plateforme de formation pratique à l’IA : choisir une tâche, apprendre, produire un livrable, le vérifier et conserver une méthode personnelle. Le périmètre comprend un site public, un espace apprenant et une administration, avec une structure français/anglais.

## État réel

P01 fournit les fondations locales ; P02 ajoute le système visuel et trois structures d’interface. P03 pose le schéma identité/contenu et le contrat généré. P04 raccorde l’identité aux sessions Spring/PostgreSQL. P05 ajoute le CMS et la publication ; P06 raccorde le site public aux publications réelles. P07 ajoute le générateur sans IA et la bibliothèque personnelle ; P08 raccorde apprentissage, quiz et notes. P09 ajoute productions personnelles, autoévaluation et corrigé contrôlé. P10 apporte stockage, vidéo locale de test et notifications durables ; P11 les offres et commandes ; P12 raccorde Checkout et l’attribution des droits ; P13 ajoute les remboursements et leurs effets par origine. P14 raccorde le compte, l’aide, les demandes relatives aux données et les attestations privées de participation. Le niveau de validation de chaque lot est dans [STATUS](docs/STATUS.md). Aucun ancien prototype repris ni déploiement externe annoncé.

La validation P01 couvre FR/EN, clavier, formats étroits, erreur 404 et panne/reprise réelle de Spring. P02 ajoute 14 tests et 54 captures examinées pour les interfaces ; les sept scénarios P01 passent à nouveau après ces changements. La validation reste locale, avec le Chromium de test autorisé.

Lire [AGENTS.md](AGENTS.md), puis [docs/STATUS.md](docs/STATUS.md). Vérifications et limites : [P09](docs/evidence/P09.md), [P08](docs/evidence/P08.md), [P07](docs/evidence/P07.md), [P06](docs/evidence/P06.md), [P05](docs/evidence/P05.md), [P04](docs/evidence/P04.md), [P03](docs/evidence/P03.md), [P02](docs/evidence/P02.md), [P01](docs/evidence/P01.md) ; audit initial : [P00](docs/evidence/P00.md).

## Structure retenue

Preuves récentes : [P14 compte, aide et attestations](docs/evidence/P14.md), [P13 remboursements](docs/evidence/P13.md), [P12 paiement TEST](docs/evidence/P12.md). Les paramètres commerciaux et de conservation encore absents restent des conditions d’activation explicites.

| Chemin | Rôle | État P01 |
| --- | --- | --- |
| `apps/web` | Next App Router, TypeScript strict, Tailwind, dictionnaires FR/EN et client API | UI Radix adaptée, galerie et trois structures locales ; fondation API conservée |
| `apps/api` | Java 21, Spring Boot, Security, sessions JDBC, JPA et Flyway | Sonde, schéma identité/contenu et conventions ; aucune route métier simulée |
| `infra/compose` | PostgreSQL, Mailpit, profil S3 local | Images exactes avec digests ; production ultérieure |
| `scripts` | Outils, configuration, démarrage et vérification | Commandes ci-dessous |
| `docs` | Contrat produit, décisions, suivi et preuves | Présent |
| `prompts` | Lots P00–P23 et prompts de reprise | Présent |
| `references` | Tokens utilisés par Tailwind et les composants | Intégré en P02 |

Une seule origine publique ; `/api/v1` est servi par Spring. Spring reste l’autorité pour l’identité, les permissions, les achats, les droits et la progression. Sessions JDBC, CSRF et absence de cache partagé pour les données privées sont obligatoires. Le générateur prépare du texte sans API IA payante.

## Démarrer sous Windows

Mode vérifié : PowerShell 5.1, Node et Java natifs Windows, services Linux dans Docker Desktop. Démarrer Docker Desktop avant les services/tests. Le lanceur conserve le chemin natif Windows avec une seule variable `PATH` et cherche aussi le binaire Docker installé dans son répertoire standard si le terminal ne le connaît pas. Aucun changement du PATH système. Les outils portables du projet préservent les installations globales. Aucune modification de politique PowerShell ni commande Bash n’est nécessaire.

Depuis la racine :

```powershell
node scripts/bootstrap.mjs
.\scripts\courses.cmd ci
.\scripts\courses.cmd run setup:local
.\scripts\courses.cmd run dev
```

Le bootstrap cible Windows x64 : Node **24.22.2 / npm 11.19.1** et Temurin **21.0.13+9**, archives officielles contrôlées par SHA-256 dans `.tools`. Il nécessite le Node déjà installé pour sa première exécution et `tar.exe` fourni par Windows. `courses.cmd` sélectionne ensuite ces outils et évite le lanceur `npm.ps1` bloqué. Maven **3.10.0** est téléchargé et vérifié par le Wrapper.

`setup:local` crée `.env.local` avec des secrets aléatoires et `infra/secrets/s3.local.json`, sans les afficher ni écraser les fichiers existants. Les deux sont ignorés par Git. Les scripts chargent ce fichier racine ; aucune copie de secret dans Next ou dans le navigateur.

`dev` démarre PostgreSQL/Mailpit, Spring puis Next. Ouvrir **http://localhost:3000/fr** ou **http://localhost:3000/en** pour le site public. Le diagnostic technique P01 est conservé dans `/fr/dev/foundations` et `/en/dev/foundations` : « Vérifier la connexion » appelle Spring et « Tester une erreur API » une route réellement absente. Les journaux locaux sont dans `.runtime/api.log` et `.runtime/web.log` ; leur contenu ne doit pas être publié automatiquement.

Dans un autre terminal :

```powershell
.\scripts\courses.cmd run stop
```

L’arrêt vise les processus enregistrés de ce projet et arrête ses services Compose. Il conserve les volumes et les données. Ne pas utiliser `down -v` pour réparer un démarrage.

## Vérifier et construire

```powershell
.\scripts\courses.cmd run lint
.\scripts\courses.cmd run typecheck
.\scripts\courses.cmd run build
.\scripts\courses.cmd run verify:api
.\scripts\courses.cmd run smoke
.\scripts\courses.cmd run verify:http
.\scripts\courses.cmd audit
```

`smoke` exige les applications démarrées ; les builds et tests API sont indépendants de ce démarrage. `verify:api` utilise le vrai moteur Docker et PostgreSQL Testcontainers isolé, sans H2. `build:api` est un alias de cette vérification complète et produit `apps/api/target/chatgpt-courses-api.jar`.

`verify:http` exige PostgreSQL déjà démarré et les ports 3000/8080 libres. Il lance les serveurs issus des builds, vérifie le proxy, arrête réellement l’API en maintenant Next, vérifie l’erreur puis la reprise, et nettoie uniquement ses processus. Il s’agit de tests HTTP, pas d’un test navigateur. Arrêter `dev` avant de le lancer.

La [recette navigateur](tests/browser/README.md) utilise les builds web/API et PostgreSQL déjà démarré :

```powershell
.\scripts\courses.cmd run browser:install
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run verify:browser
```

Playwright **1.65.0** est verrouillé ; son Chromium dédié reste dans `.tools/playwright`. Le test utilise par défaut les ports libres **3101/8181**, sans contrôler les onglets personnels. Rapports et captures se trouvent dans [docs/evidence/P01-browser](docs/evidence/P01-browser/README.md). Le focus des contrôles est conservé pendant les requêtes et restauré après une reprise.

Pour tester les serveurs issus des builds, lancer dans deux terminaux, après `services:up` :

```powershell
.\scripts\courses.cmd run services:up
.\scripts\courses.cmd run start:api
```

```powershell
.\scripts\courses.cmd run start:web
```

Ces lancements séparés se terminent par Ctrl+C dans leurs terminaux ; `stop` ne revendique pas leur gestion. Avec Next maintenu en marche et l’API arrêtée, `run smoke -- --expect-api-unavailable` vérifie l’erreur de connexion sans faux contenu.

Autres opérations locales :

| Commande après `.\scripts\courses.cmd` | Effet |
| --- | --- |
| `run services:up` | PostgreSQL et Mailpit, attente de leur état sain |
| `run services:s3` | Ajoute le profil S3 SeaweedFS local, sans fournisseur externe |
| `run services:status` | État des services |
| `run services:stop` | Arrêt des services, volumes conservés |
| `run verify:persistence` | Redémarre PostgreSQL et vérifie une donnée de preuve unique, puis enlève uniquement sa table de test |

Le test de persistance interrompt brièvement PostgreSQL : le lancer sans travail en cours. Les ports publiés sont exclusivement locaux : API `8080`, PostgreSQL `5432`, Mailpit `8025` et SMTP `1025`, S3 facultatif `8333`. Mailpit est consultable sur http://localhost:8025.

La CI Linux utilise les mêmes versions, le lockfile npm et le Wrapper, avec des actions épinglées à leurs SHA. Son fichier a été contrôlé localement ; aucune exécution GitHub n’est présumée. WSL n’a pas été utilisé pour la recette locale.

## Configuration et suite

[VERSIONS.md](docs/VERSIONS.md) distingue versions résolues et CLI shadcn non exécuté. [CONFIGURATION.md](docs/CONFIGURATION.md) précise le chargement, les profils et les secrets ; [SCREENS.md](docs/SCREENS.md) centralise les routes FR/EN.

Les pages de fondation et de démonstration sont non indexables et limitées à `APP_ENV=local|test`. Le profil de production exige une origine publique HTTPS et des cookies sécurisés ; cela ne constitue pas un déploiement. Prix, conditions, médias et accès fournisseurs restent ouverts, sans bloquer le modèle de données P03.

## Examiner les interfaces P02

Le frontend seul suffit pour la vitrine, sans démarrer PostgreSQL ou Spring :

```powershell
.\scripts\courses.cmd ci
.\scripts\courses.cmd run dev:web
```

Arrêter ce lancement avec **Ctrl+C dans son terminal**. Sur http://localhost:3000 :

| Vue locale | Français | Anglais |
| --- | --- | --- |
| Galerie et états | `/fr/dev/components` | `/en/dev/components` |
| Accueil | `/fr/dev/public` | `/en/dev/public` |
| Leçon et atelier | `/fr/dev/learning` | `/en/dev/learning` |
| Administration | `/fr/dev/admin` | `/en/dev/admin` |

Les fixtures sont signalées et séparées. Génération de prompt, saisie, autoévaluation et filtres travaillent dans la page ; aucun enregistrement serveur, rôle administrateur, publication ou achat n’est simulé comme acquis. Recharger/quitter efface le travail local. Les rubriques futures portent « En développement ». Cette vitrine reste distincte du site public P06, dont `/fr` et `/en` lisent les publications réelles de Spring. Le diagnostic P01 reste accessible dans `/{locale}/dev/foundations`.

Recette du build avec le Chromium de test déjà autorisé et installé (fermer d’abord les instances utilisant les ports 3101/8181) :

```powershell
.\scripts\courses.cmd run lint
.\scripts\courses.cmd run typecheck
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run build
.\scripts\courses.cmd run verify:contrast
.\scripts\courses.cmd run verify:design
```

Si Chromium n’est pas installé, `run browser:install` installe la version verrouillée dans `.tools/playwright`. `verify:design` ne télécharge rien : il réserve ses propres serveurs, teste les interfaces, enregistre captures/rapport dans `docs/evidence/P02-browser`, puis vérifie les refus HTTP 404 en modes staging/production et arrête tous ses processus. Cela reste une recette locale du build, sans déploiement. `run verify:browser` conserve les sept scénarios API P01 et nécessite PostgreSQL démarré ainsi que le build API.

## Schéma et contrat P03

[DATA_MODEL.md](docs/DATA_MODEL.md) explique les douze tables ajoutées par **V002**, les identités UUID, les versions gelées, les traductions et les relations futures. **V001 est inchangée**. Hibernate valide le schéma ; Flyway est le seul mécanisme d’évolution. Aucune commande de reset ou suppression de volume n’est nécessaire.

Le contrat machine [openapi.yaml](docs/api/openapi.yaml) décrit la sonde, l’identité P04, les opérations éditoriales P05, les lectures publiques P06, les méthodes P07 et l’apprentissage P08 réellement implémentés. Les autres routes métier restent planifiées dans [API_CONTRACTS.md](docs/API_CONTRACTS.md). Après modification du contrat :

```powershell
.\scripts\courses.cmd run api:validate
.\scripts\courses.cmd run api:generate
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run lint
.\scripts\courses.cmd run typecheck
.\scripts\courses.cmd run build
.\scripts\courses.cmd run verify:api
```

`api:generate` reconstruit uniquement `apps/web/src/lib/api/generated` avec les versions verrouillées. `api:check` régénère en temporaire et échoue sur une divergence ; ne pas éditer ces fichiers à la main. Le wrapper voisin `client.ts` décode aussi les réponses à l’exécution. `verify:client` compile et teste le client avec un fetch simulé ; `verify:api` exécute les tests Spring/PostgreSQL Testcontainers et construit le JAR. La CI inclut ces contrôles ; aucune exécution GitHub n’est présumée.

Pour charger un dossier pédagogique **fictif, en brouillon**, démarrer d’abord la stack locale avec `run dev` afin que Flyway migre la base existante. Dans un autre terminal :

```powershell
.\scripts\courses.cmd run seed:local
```

Commande réservée à `APP_ENV=local` et au service PostgreSQL Compose de ce dépôt. La même fixture est chargée explicitement par les tests Testcontainers ; elle n’est pas incluse dans le JAR de production. Chargement transactionnel, réexécutable sans écrasement ; collision d’identifiants réservés ⇒ refus. Aucun compte, rôle attribué, prix, offre active ou droit créé. Ces données ne constituent pas un catalogue publié et les pages P02 restent des démonstrations séparées.

## Identité P04 — validée localement

Avec la stack locale démarrée par `run dev`, les pages E06 utilisent la vraie API Spring :

| Fonction | Français | Anglais |
| --- | --- | --- |
| Connexion | `/fr/connexion` | `/en/sign-in` |
| Inscription apprenant | `/fr/inscription` | `/en/sign-up` |
| Demande de récupération | `/fr/recuperation` | `/en/reset` |
| Réinitialisation depuis l’email | `/fr/reinitialisation` | `/en/reset-password` |
| Identité et préférence de langue | `/fr/compte` | `/en/account` |

Créer un compte avec une adresse de test que l’on contrôle localement ; aucun compte connu n’est fourni. Après inscription, se connecter normalement. Mot de passe : 12 à 128 points de code Unicode, au plus 1024 octets UTF-8. L’email est normalisé en minuscules et sans espaces de bord, sans modifier points ou suffixes. Un formulaire ne choisit ni rôle ni propriétaire.

Les emails de récupération arrivent dans **Mailpit local** sur http://localhost:8025 ; le lien expire après 30 minutes et ne s’utilise qu’une fois. Trois demandes par email sur quinze minutes au plus ; la réponse reste neutre même pour un compte absent ou un quota dépassé. Ne pas copier de lien de récupération complet dans un ticket ou un journal. L’envoi SMTP local et sa reprise durable par outbox sont vérifiés en P10, sans service email externe présumé.

Le cookie `SESSION` est HttpOnly, SameSite=Lax et `Path=/`, expirant après 30 minutes d’inactivité côté serveur. CSRF framework actif sur toutes les mutations de session, login compris ; le client le conserve en mémoire et le renouvelle après les transitions, sans retry de mutation automatique. Les préférences sont privées, protégées par propriétaire, permission et ETag ; les données ne sont pas mises en cache partagé.

L’ancien brouillon de démonstration peut être restauré dans l’atelier local `/fr/dev/learning` ou `/en/dev/learning` ; il ne se convertit pas en projet personnel. P07 et P09 ont leurs brouillons spécifiques, non sensibles, à UUID et durée de deux heures. Après identification, leur import exige une action volontaire dans le compte affiché ; les productions authentifiées ne sont pas placées dans le stockage local ou de session.

La procédure du premier administrateur est conservée **hors dépôt**, sur le poste actuel dans `C:\Users\kevin\.codex\private-runbooks\chatgpt-courses-admin-initial.md` ; elle a été préparée et n’a pas été exécutée. Aucun administrateur caché ni identifiant réel n’a été ajouté au dépôt.

Recette locale dédiée, avec les builds web/API, PostgreSQL et Mailpit démarrés, et les ports de test 3101/8181 libres :

```powershell
.\scripts\courses.cmd run verify:identity
```

Cette commande a réussi : **13 scénarios Chromium**, FR/EN à 1440/768/390/320 px, comptes réels, SMTP Mailpit, rotation, panne et redémarrage de l’API avec session conservée. Les défauts observés et corrigés, les 37 tests Java et les limites sont détaillés dans [P04](docs/evidence/P04.md). Prochain lot : [P05_CMS_PUBLICATION.txt](prompts/P05_CMS_PUBLICATION.txt).

## CMS P05 — validé localement

Avec une session disposant des permissions de contenu, la stack `run dev` expose :

| Fonction | Français | Anglais |
| --- | --- | --- |
| Catalogue administratif | `/fr/admin/content` | `/en/admin/content` |
| Édition d’un document | `/fr/admin/content/{id}/edit` | `/en/admin/content/{id}/edit` |
| Aperçu privé | `/fr/admin/content/{id}/preview` | `/en/admin/content/{id}/preview` |

`id` désigne une traduction/version, distincte de l’identité pédagogique stable. Inscription publique = apprenant, sans accès CMS automatique. Le rôle EDITOR de référence porte `content.read`, `content.write`, `content.review`, `content.publish`, `content.archive`, sans permission commerciale ni compte connu livré. Un refus 401/403 sans session autorisée est attendu ; la procédure privée du premier administrateur reste hors dépôt.

Le backend persiste recherches, versions, traductions, instantanés, revues et publications. Une sauvegarde conserve l’historique et exige un ETag ; une publication recontrôle la révision et ses bloqueurs. Le contenu protégé et les brouillons ne sont pas livrés par la projection publique. Les textes P03 restent accessibles en privé pour conversion explicite, sans être déclarés prêts automatiquement.

Les exemples issus de [CONTENT_REFERENCE.md](docs/CONTENT_REFERENCE.md) et des fixtures sont fictifs et isolés. Ils ne constituent ni le parcours P18 terminé, ni des fichiers/vidéos produits, ni une offre achetable. Une référence média requise encore non vérifiée bloque la publication ; aucun clic ne la transforme en preuve de disponibilité.

Commande de recette dédiée, avec Docker, les builds web/API et les ports 3101/8181 libres :

```powershell
.\scripts\courses.cmd run verify:editorial
```

Cette commande a réussi : **5/5 scénarios en 44,8 s**, création/publication FR/EN, ordre clavier, réponse retardée, panne réelle de Spring, conflit entre onglets, aperçu privé et projection protégée. Elle réserve PostgreSQL 18.6 en tmpfs et attribue EDITOR uniquement à ses comptes synthétiques ; tous ses processus sont arrêtés ensuite. Les comptes et contenus Compose sont conservés. Les **52 tests Java**, **25 tests du client**, builds, captures examinées et limites sont dans [P05](docs/evidence/P05.md). Prochain lot autorisé : [P06_SITE_PUBLIC_CATALOGUE.txt](prompts/P06_SITE_PUBLIC_CATALOGUE.txt).

## Site public P06

Le site lit exclusivement les publications de Spring. Une base sans publication affiche un état vide ; la fixture P03 reste en brouillon. Un contenu protégé expose sa description, sans son corps ni les solutions des exercices. Les langues et versions pédagogiques gardent leurs identifiants.

| Fonction | Français | Anglais |
| --- | --- | --- |
| Accueil | `/fr` | `/en` |
| Catalogue et filtres | `/fr/catalogue` | `/en/catalog` |
| Parcours publié | `/fr/parcours/{slug}` | `/en/courses/{slug}` |
| Guide publié | `/fr/guides/{slug}` | `/en/guides/{slug}` |
| Méthode en lecture | `/fr/methodes/{slug}` | `/en/methods/{slug}` |
| Activité du programme | `/fr/apprendre/{parcours}/{activite}` | `/en/learn/{course}/{activity}` |

Les liens transmettent la version sélectionnée ; ceux d’activité du programme transmettent aussi l’identité et la version du parcours. Une activité autonome s’ouvre dans le catalogue par `?activity={resourceId}&version={versionId}`, sans inventer de parcours parent. Les filtres `q`, `type`, `goal`, `level`, `locale`, `access`, `page`, `pageSize`, `sort` sont partageables et le retour conserve leur URL.

L’éditeur CMS possède un panneau de métadonnées publiques : tâches, niveau, public, outils, sources, description de l’évaluation et FAQ. Leur sauvegarde crée une révision éditoriale ; leur affichage public exige revue puis publication. Les lectures publiques sont rendues sur le serveur, sans cookie et sans cache partagé. Le site reste non indexable en attendant la préparation SEO P16. Aucun prix ni achat opérationnel n’est annoncé avant P11/P12 ; méthodes P07, apprentissage P08 et projets P09 utilisent leurs lectures privées séparées.

Recette dédiée, après builds, avec Docker et les ports 3101/8181 libres :

```powershell
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run verify:public
```

Le superviseur crée un PostgreSQL isolé en tmpfs pour les publications fictives de recette. Il conserve le volume Compose et nettoie ses seuls processus. Résultats observés et limites : [P06](docs/evidence/P06.md).

## Méthodes et générateur P07

Une méthode publiée possède une définition éditoriale FR/EN : entrées, étapes, instruction, exemple, contrôles et limites. Le générateur assemble sept champs localement ; aucun appel IA ni instruction exécutée automatiquement. Le texte final reste modifiable indépendamment des paramètres ; reconstruction et réinitialisation demandent confirmation.

| Fonction | Français | Anglais |
| --- | --- | --- |
| Source et générateur | `/fr/methodes/{slug}` | `/en/methods/{slug}` |
| Bibliothèque privée | `/fr/espace/methodes` | `/en/my/methods` |
| Nouvelle méthode | `/fr/espace/methodes/nouvelle` | `/en/my/methods/new` |
| Méthode personnelle | `/fr/espace/methodes/{id}` | `/en/my/methods/{id}` |

La sauvegarde exige une vraie session et une confirmation Spring. Texte, paramètres, notes, langue et origine sont conservés ; une modification ou un retrait de source ne réécrit jamais la copie. Recherche, duplication, suppression confirmée et conflits de révision utilisent la même API propriétaire. Le changement d’interface ne traduit pas les notes. Le contexte de compte attendu empêche une ancienne page de sauvegarder sous un compte différent.

Avant connexion, seul un brouillon explicitement déclaré non sensible peut rester deux heures dans l’onglet. Après connexion, un écran présente le compte courant et demande son import volontaire ; rien n’est enregistré automatiquement. Les saisies privées ne sont pas placées dans le stockage navigateur.

Recette dédiée, après builds, avec Docker et les ports 3101/8181 libres :

```powershell
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run verify:methods
```

Résultats : **78 tests Java**, **42 tests client**, builds réussis et **7/7 scénarios Chromium en 46,1 s** ; **24 captures finales examinées**. La régression publique passe également, **6/6 en 54,9 s**. PostgreSQL de recette isolé en tmpfs, nettoyage confirmé ; aucune publication GitHub ou production. Détails et limites : [P07](docs/evidence/P07.md). Le prochain lot est [P08_APPRENTISSAGE_QUIZ.txt](prompts/P08_APPRENTISSAGE_QUIZ.txt).

## Apprentissage P08 — validé localement

| Fonction | Français | Anglais |
| --- | --- | --- |
| Reprise et parcours commencés | `/fr/espace/apprentissage` | `/en/my/learning` |
| Travail conservé d’une inscription | `/fr/espace/apprentissage/{enrollmentId}` | `/en/my/learning/{enrollmentId}` |
| Activité du programme | `/fr/apprendre/{parcours}/{activite}` | `/en/learn/{course}/{activity}` |

Les activités conservent les paramètres de version des liens P06. Une inscription est un suivi privé, sans achat ni droit premium ; son programme et son dénominateur sont figés. Lecture déclarée, activité déclarée terminée et résultat de quiz restent séparés. Les productions P09 ont leurs statuts déclaratifs propres, sans taux de compétence agrégé.

Le quiz gratuit utilise une correction réelle de Spring, sans résultat durable avant inscription au parcours. Les tentatives enregistrées gardent leur barème, leurs réponses et leur langue ; aucun score fourni par le navigateur ne fait autorité. Le CMS définit le seuil et une éventuelle limite de tentatives durables. Sans règle explicite, le défaut annoncé est 100 % et tentatives illimitées.

Les notes sont privées, révisées et conservées dans leur langue de création. Les conflits proposent comparaison et choix explicites. Le détail « Travail conservé » permet de retrouver notes et tentatives des versions exactes après retrait d’un module ou parcours, sans ouvrir de contenu premium. Vidéos, positions persistées et fichiers sécurisés restent P10 ; aucun lecteur vide n’est ajouté.

Recette dédiée après les builds, avec Docker et les ports 3101/8181 libres :

```powershell
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run verify:learning
```

Elle utilise PostgreSQL en tmpfs et des comptes/contenus BR01 fictifs, conservant le volume Compose. Résultats P08 : **95 tests Java**, **51 tests client**, builds réussis, **10/10 scénarios Chromium en 72,87 s** et **33 captures finales examinées**. Régressions : P06 **6/6**, P07 **7/7** ; nettoyage confirmé. Détails et limites : [P08](docs/evidence/P08.md). Lot actuel : [P09_PROJETS_EVALUATION.txt](prompts/P09_PROJETS_EVALUATION.txt).

## Projets P09 — périmètre technique validé localement

La liste et les productions privées sont disponibles sous `/fr/espace/projets` et `/en/my/projects`, puis `/{projectId}`. L’atelier d’une activité gratuite publiée et configurée est accessible avant compte depuis sa page d’activité. Il sépare brief, rédaction, vérification et consultation volontaire du corrigé. Un compte est nécessaire pour conserver une production et ses autoévaluations.

Le CMS charge explicitement les préparations BR01/BR02 FR/EN depuis une route administrateur protégée ; remplacer une grille exige confirmation. Cette préparation ne publie aucun contenu. Les vingt critères à un point et les quatre déclarations d’erreurs produisent un **score déclaré**, avec seuil éditorial configurable, sans vérification automatique de la vérité du texte ni revue humaine. Les anciennes révisions et évaluations restent intactes après édition. Le corrigé est réautorisé à chaque livraison et ne valide jamais le projet.

Un anonyme peut conserver volontairement un brouillon **non sensible**, deux heures en session navigateur, puis l’importer explicitement dans le compte affiché. Les productions authentifiées sont privées, en mémoire/serveur, sans stockage navigateur persistant de leur contenu. Un changement de compte bloque la reprise implicite. Retrait d’une source n’efface pas productions et preuves personnelles ; fichiers sécurisés P10 et revue humaine restent désactivés.

Commandes disponibles :

```powershell
.\scripts\courses.cmd run api:generate
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run verify:projects
```

`api:generate` reconstruit les artefacts du contrat ; `api:check` vérifie leur reproductibilité. La recette `verify:projects` nécessite les builds web/API, Docker, Chromium installé et les ports 3101/8181 libres. Elle utilise une base PostgreSQL temporaire en tmpfs, des comptes et dossiers fictifs isolés, sans réinitialiser le volume Compose. Résultats locaux : **112 tests Java**, **58 tests client**, lint/types/builds/OpenAPI réussis, upgrade préservant les lignes de **25 tables** et chaîne HTTP réelle réussis. Recette P09 complète sans instrumentation : **8/8 en 59,9 s** ; régression P08 : **10/10**. Preuves et limites : [evidence/P09.md](docs/evidence/P09.md). Aucun fournisseur externe ni déploiement de production n’est ainsi validé.

Un refus d’accusé de sauvegarde observé dans un passage intermédiaire n’a pas été reproduit sur seize répétitions du parcours FR, puis sur la recette complète finale. Sa cause reste indéterminée ; observations, traces et limites sont conservées dans [la preuve P09](docs/evidence/P09.md).

## Médias, fichiers et emails P10 — validés localement

Le stockage local utilise deux buckets privés distincts, même pour les fichiers éditoriaux destinés à une publication gratuite. Le serveur autorise le dépôt, contrôle les octets transférés, puis conserve une nouvelle clé immuable pour le fichier validé. Un transfert seul n’est pas un fichier prêt. TXT UTF‑8 est disponible pour les projets ; TXT et PNG/JPEG réencodés pour le CMS. PDF reste indisponible faute de validateur adapté. Le contrôle de format ne constitue pas une analyse antivirus.

Commandes Windows natives, après installation des dépendances verrouillées :

```powershell
.\scripts\courses.cmd run setup:local
.\scripts\courses.cmd run services:s3
.\scripts\courses.cmd run build:api
.\scripts\courses.cmd run storage:setup
.\scripts\courses.cmd run dev
```

`storage:setup` prépare uniquement les buckets locaux absents et leur CORS pour l’origine publique locale configurée, puis active le stockage dans `.env.local`. Il préserve les objets et autres paramètres existants. Les endpoints interne/externe sont explicites ; le navigateur reçoit une adresse de boucle locale signée et transfère sans cookie de session. Les limites et formats réels apparaissent avant dépôt. Valeurs par défaut : TXT 5 MiB, image 10 MiB, dix fichiers/20 MiB par projet ; autorisation de transfert 300 s, téléchargement 60 s. Une révocation bloque les nouveaux liens ; un lien déjà émis peut rester valide jusqu’à son expiration. Le nettoyage ne vise que les clés de transfert expirées enregistrées, jamais les objets prêts ni un volume.

La clé `NOTIFICATION_OUTBOX_KEY` est générée localement par `setup:local` sans affichage. Conserver cette clé avec les sauvegardes privées : les redémarrages doivent pouvoir déchiffrer les événements en attente. Les notifications FR/EN passent par une outbox PostgreSQL durable et Mailpit ; les reprises ont un délai borné et les résultats SMTP ambigus exigent un rapprochement explicite. L’écran `/fr/admin/notifications` ou `/en/admin/notifications` exige `notifications.read`, et la reprise `notifications.manage` ; aucun compte opérateur n’est créé automatiquement. Ni destinataire ni contenu d’email n’y sont exposés. Les événements réels d’activation P12 et de réponse d’aide P14 réutilisent ces ports métier ; demande enregistrée et email pris en charge restent distincts.

Le fournisseur vidéo `local-test` reste désactivé par défaut. `VIDEO_LOCAL_ROOT` désigne un répertoire privé absolu, hors des fichiers publics ; `video:import -- chemin/manifest.json` réalise un import local explicite après création du contenu par un éditeur autorisé. Ce mécanisme ne désigne aucun fournisseur de streaming de production ni aucune vidéo de formation déjà produite. En l’absence de média, le texte et les consignes restent utilisables.

```powershell
.\scripts\courses.cmd run verify:media
.\scripts\courses.cmd run stop
.\scripts\courses.cmd run services:stop
```

`verify:media` nécessite les builds web/API, Docker et Chromium déjà installé. Il prépare PostgreSQL, SeaweedFS et Mailpit temporaires en tmpfs, vérifie leur propriété et les arrête en fin de recette ; aucun volume partagé n’est réinitialisé. Les douze scénarios Chromium passent, après correction d’une capacité SeaweedFS insuffisante lors du flush du journal. Le global API passe 138 tests et le client 71 ; résultats, échecs intermédiaires et limites sont consignés dans [P10](docs/evidence/P10.md). Aucun fournisseur de production ni envoi externe n’est déduit de ces vérifications.

Pour diagnostiquer un scénario, le superviseur accepte `--grep` et `--repeat-each 1..20`, avec la même isolation et sans retry automatique :

```powershell
.\scripts\courses.cmd run verify:projects -- --grep "fr · T02" --repeat-each 8
```

Un tel passage reste ciblé ; `session.json` enregistre la sélection. La validation du lot utilise aussi la commande complète sans filtre.

## Offres et commandes P11 — validées localement

Offres publiques : `/fr/offres`, `/en/offers`, puis `/{offerId}`. Commandes du propriétaire : `/fr/commandes` ou `/en/orders`, puis `/{orderId}/recapitulatif` ou `/{orderId}/summary`. Spring calcule les montants, ressources, langues et conditions ; une commande préparée ne confirme aucun paiement ni nouvel accès. Le Checkout était désactivé dans la recette P11 ; son raccordement P12 reste soumis à la configuration serveur et à une offre complète.

Le commerce reste désactivé par défaut : `COMMERCE_ENABLED=false`, `COMMERCE_ALLOWED_CURRENCIES=`. Les devises supportées par ce premier socle sont EUR/USD/GBP, chacune à deux décimales, avec une liste autorisée explicite côté serveur. Un prix, une durée ou des conditions absents restent non renseignés et bloquent la préparation. Aucun tarif ou texte juridique réel n’est livré. Les offres fictives sont créées explicitement par les tests sur une base temporaire ; ni Flyway ni `seed:local` n’en crée dans la base partagée.

Les opérations administratives exigent les permissions `commerce.offers.read/write/activate`, distinctes de `EDITOR`. Aucun compte commercial n’est créé. L’API d’administration est décrite dans [OpenAPI](docs/api/openapi.yaml) ; la console commerciale complète sera étendue par les lots suivants.

Le consentement porte explicitement sur la version des conditions affichée. `Idempotency-Key` est un UUID : même clé/corps retrouve la même commande, même clé/autre corps est refusé. La préparation expire après `COMMERCE_ORDER_TTL=30m` (borne1minute–24heures), sans supprimer l’historique. Une nouvelle révision explicitement acceptée remplace seulement une préparation dont le paiement n’a pas commencé. Un achat en état ambigu doit être rapproché avant toute autre tentative.

```powershell
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run verify:api
.\scripts\courses.cmd run build:web
.\scripts\courses.cmd run verify:commerce
```

`verify:commerce` utilise les builds et Chromium installés, avec PostgreSQL tmpfs isolé et commerce fictif explicitement activé dans ce seul processus de recette. Stripe reste désactivé, ses clés sont retirées de cet environnement. Huit scénarios passent et vingt captures FR/EN ont été examinées. Global Java155 puis ciblé final HTTP10, client77, builds et chaîne HTTP réussis ; chronologie exacte et limites dans [P11](docs/evidence/P11.md).

## P12 — Checkout et attribution durable

Ce lot reste réservé au mode test. Stripe activé avec `APP_ENV=production` est refusé au démarrage ; un déploiement commercial exigera le raccord LIVE et sa recette dans les lots de livraison. TEST en staging et Stripe désactivé en production restent des configurations admises.

Le récapitulatif propose un consentement explicite avant Checkout hébergé. Le serveur persiste une opération et ses paramètres avant le réseau ; double clic ou timeout ne créent pas une seconde session. Les retours `/fr/commandes/{id}/statut` et `/en/orders/{id}/status` interrogent le propriétaire côté Spring : `checkout=success` ou `checkout=cancel` ne confirme rien. L’attente automatique s’arrête après douze lectures espacées de deux secondes ; l’actualisation reste volontaire. Paiement confirmé, activation des droits et email sont trois résultats distincts.

Le proxy utilise désormais un budget par défaut de 30 s (`API_TIMEOUT_MS=30000`), sous le délai client de 35 s. Si un ancien fichier d’environnement impose encore 5 s, adapter ce seul paramètre avant la recette Checkout. Les exemples sont alignés ; aucun secret existant n’est remplacé.

Spring reçoit les octets bruts de `POST /api/v1/webhooks/stripe`, vérifie la signature SDK puis acquitte une inbox PostgreSQL durable. Le worker rapproche les faits courants et crée les origines `ORDER_LINE` et l’intention d’email atomiquement, sans doublon métier. Une panne email conserve les accès. Les contenus privés des leçons, projets et fichiers utilisent ces droits, leurs versions, langues et périodes ; l’historique personnel reste conservé après révocation. Les routes publiques ne livrent pas les corps réservés, même avec une session acheteur.

```powershell
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run lint
.\scripts\courses.cmd run typecheck
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run build:api
.\scripts\courses.cmd run build:web
.\scripts\courses.cmd run verify:payments
```

`verify:payments` réserve ses propres PostgreSQL, S3 et Mailpit en tmpfs. Il contrôle uniquement le transport réseau Stripe avec le SDK réel ; les signatures, l’API, les transactions, le worker et les droits sont réellement exécutés localement. Les URL Checkout restent strictement HTTPS sur `checkout.stripe.com`, y compris dans ce test. **Ce scénario ne contacte pas Stripe et ne prouve pas un paiement fournisseur.** Résultats réellement obtenus et limites : [preuve P12](docs/evidence/P12.md).

**P12 validé localement**, avec intégration Stripe TEST effectivement exécutée. Dernier passage contrôlé : **8/8 en 152,320 s, sortie 0**, 24 GET membre croisés et 27 captures FR/EN examinées. Nouveau ciblé PostgreSQL : **5/5**, dont 16 GET parallèles après attribution fraîche sans antidatage. Parcours externe : **1/1 en 100,933 s, sortie 0**, vrai Checkout TEST, réception durable avant worker, reprise PAID/READY, contenu privé accessible et deux rejeux fournisseur sans doublon de droit ni d’intention email. [Preuves et références](docs/evidence/P12.md). Les deux anciens refus restent de cause inconnue, non reproduits ; leur [suivi obligatoire P17/P19](docs/evidence/P12-access-follow-up.md) reste ouvert. P13 a ensuite été demandé explicitement ; aucun mode LIVE ou déploiement.

### Configuration privée et Stripe CLI — Windows natif

Le fichier privé est **`.env.local` à la racine du dépôt**. La clé TEST déjà saisie a été conservée ; `STRIPE_ACCOUNT_ID` est renseigné et vérifié par une lecture réelle de `/v1/account`. Le secret obtenu par la CLI est dans **`.runtime/stripe-webhook-secret.txt`**. Les deux chemins sont effectivement ignorés par Git ; aucun secret n’est affiché par les commandes ci-dessous.

La configuration locale contient `STRIPE_ENABLED=true` et un secret webhook ; leur chargement par Spring est confirmé. **La différence initiale avec le secret CLI est résolue** : l’utilisateur a exécuté `stripe:sync-secret`, puis le listener a annoncé TEST prêt avec l’API attendue. La comparaison locale confirme maintenant l’égalité fichier/cache ; les pages FR/EN et la sonde Spring via proxy répondent HTTP200. Garder **`STRIPE_MODE=TEST`** et `STRIPE_API_BASE=https://api.stripe.com`. Le commerce et les conditions de l’offre restent des configurations distinctes ; aucune offre fictive n’est activée par migration.

Si le secret du listener doit être resynchronisé, lancer explicitement :

```powershell
.\scripts\courses.cmd run stripe:sync-secret
```

Cette commande vérifie le compte TEST, récupère le secret de l’écoute puis remplace uniquement `STRIPE_WEBHOOK_SECRET` dans `.env.local`. Elle conserve les autres valeurs, commentaires et fins de ligne ; elle refuse les champs dupliqués et une modification du fichier détectée pendant l’opération. Fermer le fichier pendant la commande : la comparaison ne verrouille pas les éditeurs externes. L’ancienne valeur est sauvegardée dans `.runtime/stripe-webhook-secret.before-sync-<identifiant>.txt`, ignoré par Git. La clé API reste intacte. Alternative manuelle : copier la valeur du fichier privé `.runtime/stripe-webhook-secret.txt` dans ce seul champ. La synchronisation réelle a été effectuée explicitement par l’utilisateur ; son reçu non sensible est conservé dans les preuves P12.

Commandes depuis la racine :

```powershell
.\scripts\courses.cmd run stripe:install
.\scripts\courses.cmd run stripe:check
.\scripts\courses.cmd run stripe:secret
.\scripts\courses.cmd run stripe:plan
.\scripts\courses.cmd run stripe:bindings
.\scripts\courses.cmd run verify:stripe-config
```

`stripe:install` prépare le binaire portable **1.55.8** dans `.tools/stripe/1.55.8`, après contrôle SHA-256 de l’archive et du manifeste officiels épinglés dans `infra/tools/stripe-cli.windows.json`. `stripe:check` vérifie le compte de la clé TEST. `stripe:secret` obtient le secret du listener et le place dans le fichier privé de copie, sans remplir le champ à la place de l’utilisateur. `stripe:plan` affiche les options non sensibles sans démarrer l’écoute. Le lanceur utilise la même clé TEST, uniquement dans l’environnement privé du processus CLI (`STRIPE_API_KEY`), sans argument contenant la clé ni en-tête Connect.

`verify:stripe-config` exécute cinq tests sur des fichiers synthétiques isolés : préservation des autres champs, commentaires et fins de ligne, sauvegarde, champ vide, fichier modifié, champ absent/dupliqué et valeur multiligne refusée. Il ne lit ni ne modifie la configuration privée réelle et ne contacte pas Stripe.

`scripts/lib/runtime.mjs` charge `.env.local` ; `scripts/api.mjs` transmet cet environnement à Spring, qui le lie à `courses.stripe` dans `application.yml`. **`stripe:bindings` démarre réellement Spring depuis le JAR construit**, sur un port de boucle locale éphémère, compare les valeurs du bean en mémoire, puis ferme le contexte. Il exige le JDK, le JAR et PostgreSQL local ; workers désactivés, aucun appel Stripe, sorties brutes écartées et seuls des booléens publiés. La dernière sonde confirme clé, compte, secret renseigné et activation ; elle prouve le chargement, pas la concordance du secret avec la CLI. Relancer cette commande après modification. Pour le démarrage habituel, `run dev` charge aussi le fichier privé.

Après saisie du secret, démarrer l’application dans un terminal :

```powershell
.\scripts\courses.cmd run dev
```

Dans un second terminal, lancer l’écoute avec la sortie protégée :

```powershell
.\scripts\courses.cmd run stripe:listen
```

Le lanceur est configuré pour exécuter cette commande Stripe avec le binaire portable et la clé injectée en privé :

```powershell
stripe listen --latest --events-from "@self" --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to http://localhost:3000/api/v1/webhooks/stripe --skip-update
```

**La destination réelle est le proxy Next sur le port 3000**, qui préserve `/api/v1/webhooks/stripe` vers Spring 8080. Le lanceur la lit dans `APP_PUBLIC_ORIGIN` et exige une origine locale. Ctrl+C arrête son processus CLI. Une modification de `.env.local` exige le redémarrage de Spring pour être prise en compte.

Les livraisons doivent être des snapshots **2026-10-28.endive**. `listen` 1.55.8 propose la version du compte ou `--latest`, sans épinglage explicite. Le lanceur utilise ce dernier choix mais exige une version Ready exactement égale au pin de l’application et le même secret que la configuration ; il arrête sur divergence. Spring recontrôle indépendamment chaque événement. Aucun changement de version du compte ni assouplissement du contrat. Le GET d’un Event conserve sa version historique, ici **2022-11-15** ; Stripe rend la livraison selon la destination CLI, ici **2026-10-28.endive**, contrôlée dans l’inbox avant et après rejeu. [Options officielles](https://docs.stripe.com/cli/listen), [Event immuable](https://docs.stripe.com/api/events/object), [version de destination](https://docs.stripe.com/webhooks/versioning).

La recette externe reproductible utilise Docker, Chromium et les builds existants, avec la clé TEST privée configurée. **Arrêter d’abord les autres listeners Stripe de ce dépôt** dans leur terminal ; le lanceur les détecte et refuse l’essai avant tout appel Stripe, sans arrêter lui-même un processus existant. Cela évite que les événements fictifs soient aussi transmis à la base de développement.

```powershell
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run verify:stripe-test
```

Cette commande réserve `http://127.0.0.1:3101` et l’API interne8181, PostgreSQL/S3/Mailpit temporaires étiquetés, ainsi qu’un listener TEST propre. Elle crée via API un cours et une offre explicitement fictifs de **100 centimes EUR**, accepte les conditions et remplit uniquement le Checkout hébergé avec la carte de test officielle. Aucun tarif commercial n’est ainsi choisi. Elle relie commande/opération/session/PaymentIntent/événement, arrête initialement le worker, vérifie la reprise, les contenus privés et deux `stripe events resend` réels acquittés en2xx. Les fichiers publics ne conservent ni URL Checkout complète, ni secret, ni données de carte ; les secrets Stripe sont absents du processus Playwright.

Les sessions TEST ouvertes et impayées identifiées sont expirées ; les sessions payées restent dans Stripe TEST comme preuves. Les processus et conteneurs propres sont arrêtés, sans volume partagé supprimé. Les résultats sont dans `docs/evidence/P12_EXTERNAL-browser/` et leur [index](docs/evidence/P12-stripe-external-checks.json). Le parcours externe vérifié est FR/carte immédiate ; le différé, FR/EN et les pannes ont leurs tests locaux distincts. Un challenge humain ou un refus de Stripe reste un échec, jamais un succès simulé. [Tests Stripe](https://docs.stripe.com/testing), [rejeu CLI](https://docs.stripe.com/cli/events/resend).

Après la recette P12 du 8 novembre, le développement3000 est resté démarré et son listener a été rétabli **en arrière-plan**, Ready TEST ; son état local historique est dans `.runtime/p12-development-listener-transition.json`. P13 les a suspendus pour ses builds puis rétablis, avec contrôle HTTP et écoute TEST vérifiés séparément. La configuration `.env.local` et ses valeurs secrètes sont préservées.

## P13 — Remboursements et origines d’accès

L’apprenant consulte `/fr/commandes/{id}/remboursements` ou `/en/orders/{id}/refunds` et dépose seulement un motif sur sa propre commande. Les origines restent visibles dans `/fr/compte/acces` et `/en/account/access`. Demande, décision, résultat financier et effet sur les accès sont présentés séparément. Le contenu protégé dépend des droits actuels ; les notes, productions, méthodes et tentatives personnelles sont conservées.

L’opérateur possédant les permissions `refunds.*` utilise `/fr/admin/operations/refunds` ou sa variante EN. Le rôle de référence `REFUND_OPERATOR` n’est attribué à aucun compte par migration. Il prévisualise montant, lignes et effet, confirme la décision, puis confirme séparément l’exécution. Approuver réserve le montant sans transmettre de remboursement. Refuser une demande et annuler une exécution jamais transmise ne sont pas des échecs Stripe. La création fournisseur garde la même clé et les mêmes paramètres ; une réponse perdue reste UNKNOWN et se rapproche par GET.

Une allocation partielle porte un montant explicite et KEEP/REVOKE pour chaque ligne choisie. Aucun prix par cours n’est déduit du prix du pack. Un remboursement intégral retire toutes les origines de cette commande ; un achat indépendant reste valable. Un remboursement partiel découvert chez le fournisseur sans décision d’accès est à examiner. Le rapprochement ne crée aucune nouvelle opération financière. Un email en échec ne change pas le remboursement.

```powershell
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run lint
.\scripts\courses.cmd run typecheck
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run build:api
.\scripts\courses.cmd run build:web
.\scripts\courses.cmd run verify:refunds
```

`verify:refunds` utilise les builds et Chromium installés, PostgreSQL/S3/Mailpit isolés en tmpfs et un transport Stripe HTTP contrôlé avec le véritable SDK. Aucun appel Stripe, fonds réels ou effacement de volume partagé. Les 3101/8181 doivent être libres ; la commande nettoie seulement ses propres ressources. Les preuves précisent les résultats réellement exécutés dans [P13](docs/evidence/P13.md). Les preuves Stripe TEST externes de P12 ne valent pas preuve d’un remboursement fournisseur.

`build:api` et `verify:api` utilisent le profil test sans charger `.env.local`, retirent les paramètres Stripe hérités et arrêtent les schedulers financiers par défaut. Les tests d’intégration fournissent leurs propres réglages et transports contrôlés. La commande `stripe:bindings -- P13` vérifie séparément les valeurs privées réellement liées par Spring, en ne produisant que des booléens ; son serveur temporaire garde tous les workers arrêtés et ne contacte pas Stripe.

Pour recevoir les mises à jour dans le développement TEST, régler **`REFUND_WORKER_ENABLED=true`** dans le fichier privé ignoré `.env.local`, puis redémarrer Spring avec `dev`. La session P13 a activé ce seul indicateur dans le fichier privé, sauvegarde locale conservée ; les secrets et autres paramètres restent inchangés. Les exemples gardent false. Valeurs par défaut : `REFUND_POLL_DELAY=2s`, `REFUND_LEASE_DURATION=120s`, `REFUND_RETRY_DELAY=10s`, `REFUND_MAX_ATTEMPTS=5`. Le worker lit les faits courants, avec tentatives bornées et état à examiner ; il ne transmet aucun POST de remboursement. `stripe:listen` écoute les quatre événements Checkout ainsi que `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded`, toujours vers l’unique origine `/api/v1/webhooks/stripe`.

Les nouveaux liens média privés sont refusés lorsque la dernière origine autorisant ce contenu est retirée. Un lien S3 déjà délivré reste valable jusqu’à son expiration configurée (`ASSET_DOWNLOAD_TTL_SECONDS`, défaut60s) ; un fichier déjà téléchargé ne peut pas être rappelé. Aucune politique de délai, d’éligibilité, de frais ou de garantie de remboursement n’est inventée. Les conditions commerciales et légales restent à fournir par le porteur avant lancement.


## P14 — compte, aide et attestations

Compte : `/fr/compte` et `/en/account`. Sections privées : `attestations`, `aide`/`help`, `donnees`/`data`, sous ces mêmes racines. Le profil déclaré, la préférence de langue et la sécurité réutilisent l’identité P04. Les commandes et origines d’accès restent les services P11–P13. Un changement de langue d’interface ne traduit ni notes, méthodes, productions ou messages.

Les demandes d’aide enregistrent messages, contexte choisi, pièces existantes READY sélectionnées et historique. Une réponse opérateur réelle utilise l’outbox P10 ; un incident email conserve la conversation et les droits. Aucun horaire ou délai de réponse n’est promis. Le rôle SUPPORT_OPERATOR est livré sans compte assigné ; l’interface d’exploitation étendue reste P15.

L’attestation proposée est un **document HTML autonome imprimable de participation déclarée**. Son émission exige un nom déclaré et des faits serveur sur l’inscription/version exacte : activité déclarée terminée, quiz durable ou autoévaluation de la révision courante. Lecture, vidéo et note seules ne suffisent pas. Les preuves distinguent quiz automatique et autoévaluation ; aucun diplôme, compétence certifiée, identité vérifiée ou examen humain n’est annoncé. Octets, SHA256, date et instantané sont conservés ; une nouvelle édition ou un remboursement ne les réécrit pas. Le téléchargement reste propriétaire et privé.

Les demandes d’export/effacement/fermeture sont réellement traçables en WAITING_POLICY et annulables. Aucun export prêt ou traitement irréversible n’est activé tant que la conservation et le circuit ne sont pas validés. Aucun justificatif commercial vérifié n’est publié à ce stade : le récapitulatif ne devient pas une facture, et la plateforme ne prétend pas avoir interrogé les reçus Stripe.

Préparer les builds avant la recette Chromium isolée :

```powershell
.\scripts\courses.cmd run api:generate
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run lint
.\scripts\courses.cmd run typecheck
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run build:api
.\scripts\courses.cmd run build:web
.\scripts\courses.cmd run verify:account
```

Arrêter les applications de développement avec `.\scripts\courses.cmd run stop` avant compilation ; les services et volumes Docker sont conservés. `verify:account` réserve les ports3101/8181 et crée PostgreSQL/S3/Mailpit temporaires en boucle locale, sans Stripe, seed de production ou destinataire réel. Il ne prend pas les onglets personnels. Les résultats, captures et limites effectivement observés figurent dans [la preuve P14](docs/evidence/P14.md). Relancer ensuite `.\scripts\courses.cmd run dev`, et le listener TEST existant si nécessaire avec `.\scripts\courses.cmd run stripe:listen` dans un terminal séparé. Le listener n’est pas requis par la recette P14.
