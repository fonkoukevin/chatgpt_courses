# ChatGPT Courses

Plateforme de formation pratique à l’IA : choisir une tâche, apprendre, produire un livrable, le vérifier et conserver une méthode personnelle. Le périmètre comprend un site public, un espace apprenant et une administration, avec une structure français/anglais.

## État réel

P01 fournit les fondations locales ; P02 ajoute le système visuel et trois structures d’interface. P03 pose le schéma identité/contenu et le contrat généré. P04 raccorde l’identité aux sessions Spring/PostgreSQL. P05 ajoute le CMS et la publication ; P06 raccorde le site public aux publications réelles. P07 ajoute le générateur sans IA et la bibliothèque personnelle ; P08 raccorde apprentissage, quiz et notes. Projets et paiements seront raccordés dans leurs lots. Aucun ancien prototype repris ni déploiement externe annoncé.

La validation P01 couvre FR/EN, clavier, formats étroits, erreur 404 et panne/reprise réelle de Spring. P02 ajoute 14 tests et 54 captures examinées pour les interfaces ; les sept scénarios P01 passent à nouveau après ces changements. La validation reste locale, avec le Chromium de test autorisé.

Lire [AGENTS.md](AGENTS.md), puis [docs/STATUS.md](docs/STATUS.md). Vérifications et limites : [P08](docs/evidence/P08.md), [P07](docs/evidence/P07.md), [P06](docs/evidence/P06.md), [P05](docs/evidence/P05.md), [P04](docs/evidence/P04.md), [P03](docs/evidence/P03.md), [P02](docs/evidence/P02.md), [P01](docs/evidence/P01.md) ; audit initial : [P00](docs/evidence/P00.md).

## Structure retenue

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

Mode vérifié : PowerShell 5.1, Node et Java natifs Windows, services Linux dans Docker Desktop. Démarrer Docker Desktop avant les services/tests. Les outils portables du projet préservent les installations globales. Aucune modification de politique PowerShell ni commande Bash n’est nécessaire.

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

Les emails de récupération arrivent dans **Mailpit local** sur http://localhost:8025 ; le lien expire après 30 minutes et ne s’utilise qu’une fois. Trois demandes par email sur quinze minutes au plus ; la réponse reste neutre même pour un compte absent ou un quota dépassé. Ne pas copier de lien de récupération complet dans un ticket ou un journal. L’envoi SMTP local est testé ; la livraison durable et la reprise par outbox arrivent en P10, sans service email externe présumé.

Le cookie `SESSION` est HttpOnly, SameSite=Lax et `Path=/`, expirant après 30 minutes d’inactivité côté serveur. CSRF framework actif sur toutes les mutations de session, login compris ; le client le conserve en mémoire et le renouvelle après les transitions, sans retry de mutation automatique. Les préférences sont privées, protégées par propriétaire, permission et ETag ; les données ne sont pas mises en cache partagé. Un essai anonyme non sensible peut être gardé deux heures dans l’onglet, puis restauré volontairement ; son import dans de futurs projets n’est pas encore disponible.

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

L’éditeur CMS possède un panneau de métadonnées publiques : tâches, niveau, public, outils, sources, description de l’évaluation et FAQ. Leur sauvegarde crée une révision éditoriale ; leur affichage public exige revue puis publication. Les lectures publiques sont rendues sur le serveur, sans cookie et sans cache partagé. Le site reste non indexable en attendant la préparation SEO P16. Aucun prix ni achat opérationnel n’est annoncé avant P11/P12 ; les méthodes personnelles P07 et l’apprentissage P08 utilisent leurs lectures privées séparées. Les projets restent P09.

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

Les activités conservent les paramètres de version des liens P06. Une inscription est un suivi privé, sans achat ni droit premium ; son programme et son dénominateur sont figés. Lecture déclarée, activité déclarée terminée et résultat de quiz restent séparés. Les projets arrivent en P09.

Le quiz gratuit utilise une correction réelle de Spring, sans résultat durable avant inscription au parcours. Les tentatives enregistrées gardent leur barème, leurs réponses et leur langue ; aucun score fourni par le navigateur ne fait autorité. Le CMS définit le seuil et une éventuelle limite de tentatives durables. Sans règle explicite, le défaut annoncé est 100 % et tentatives illimitées.

Les notes sont privées, révisées et conservées dans leur langue de création. Les conflits proposent comparaison et choix explicites. Le détail « Travail conservé » permet de retrouver notes et tentatives des versions exactes après retrait d’un module ou parcours, sans ouvrir de contenu premium. Vidéos, positions persistées et fichiers sécurisés restent P10 ; aucun lecteur vide n’est ajouté.

Recette dédiée après les builds, avec Docker et les ports 3101/8181 libres :

```powershell
.\scripts\courses.cmd run api:check
.\scripts\courses.cmd run verify:client
.\scripts\courses.cmd run typecheck:browser
.\scripts\courses.cmd run verify:learning
```

Elle utilise PostgreSQL en tmpfs et des comptes/contenus BR01 fictifs, conservant le volume Compose. Résultats : **95 tests Java**, **51 tests client**, builds réussis, **10/10 scénarios Chromium en 72,87 s** et **33 captures finales examinées**. Régressions : P06 **6/6**, P07 **7/7** ; nettoyage confirmé. Détails et limites : [P08](docs/evidence/P08.md). Prochain lot autorisé : [P09_PROJETS_EVALUATION.txt](prompts/P09_PROJETS_EVALUATION.txt).
