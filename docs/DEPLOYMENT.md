# Déploiement et exploitation de ChatGPT Courses

Document de référence pour P01, P10 et P17 à P23. Les réalisations locales P20 et leurs limites sont identifiées ci-dessous ; les autres règles restent des critères de livraison. Elles ne prouvent pas l’existence d’un serveur distant, d’un fournisseur autorisé ou d’une copie de sauvegarde hors hôte.

## Périmètre et décisions de départ

Le produit est un monolithe modulaire Spring Boot accompagné d’un frontend Next.js. La cible initiale proposée est un serveur Linux existant ou explicitement autorisé, avec Docker Compose et Caddy. L’objectif est une exploitation compréhensible par un développeur seul. Une évolution vers une base managée ou plusieurs instances reste possible après mesure ; Kubernetes, microservices et Redis ne sont pas requis pour la V1.

Le budget initial de 100 à 500 € évoqué pour le projet concerne les dépenses de lancement. Ce n’est ni un budget mensuel d’hébergement confirmé, ni une estimation du temps de développement et de production pédagogique. Les coûts de stockage, vidéo, trafic, emails, suivi d’erreurs et sauvegardes sont à estimer avec les tarifs réellement consultés au moment du choix.

Les versions exactes sont vérifiées et proposées en P00 dans `VERSIONS.md`, puis installées et verrouillées en P01. Les images des lots suivants sont vérifiées lors de leur introduction. Utiliser les documentations des versions retenues : Node LTS compatible avec Next.js, Java 21, Spring Boot maintenu, PostgreSQL maintenu, Maven Wrapper et images Docker précises. Une version « latest » ou un nom de modèle connu ne constitue pas une vérification de compatibilité.

## Trois environnements distincts

| Environnement | Données et services | Objet |
| --- | --- | --- |
| Local | Données fictives, PostgreSQL local, Mailpit, S3 compatible local ; Stripe test ou adaptateur contrôlé. | Développer et vérifier sans effet commercial. |
| Recette | Base, bucket, sessions et secrets distincts ; Stripe test ; emails capturés ou limités à des destinataires de test autorisés. | Vérifier une version déployable et les intégrations. |
| Production | Comptes réels, services configurés, données et sauvegardes privées, offres explicitement prêtes. | Exploiter la version validée. |

La recette peut utiliser le même hôte pour limiter les dépenses, avec isolation explicite des réseaux, volumes, comptes et noms Compose. Elle partage alors le risque d’indisponibilité de l’hôte : ce n’est pas de la haute disponibilité. Ne jamais restaurer ou copier automatiquement des données clients en recette.

## Arborescence technique attendue

Les noms exacts peuvent s’adapter à un dépôt existant sans restructuration gratuite :

- apps/web : Next.js App Router et composants d’interface.
- apps/api : Spring Boot, modules métier et migrations Flyway.
- infra/compose : définitions de développement, recette et production.
- infra/caddy : routage et politiques de l’entrée HTTPS.
- scripts : commandes de démarrage, vérification, sauvegarde, restauration et déploiement documentées.
- .github/workflows : CI puis publication d’images et déploiement contrôlé.
- docs/runbooks : procédures opérationnelles générées pendant les lots.
- docs/evidence/Pxx.md : preuves datées et limites du lot.

Les fichiers d’environnement réels sont exclus du dépôt. Les exemples listent les noms, le caractère obligatoire et la source attendue des valeurs, sans secret réel.

P21 impose des paquets GHCR `/web` et `/api` préexistants et positivement privés avant toute publication applicative : métadonnées, propriétaire, lien source et refus anonyme sont contrôlés avant nettoyage optionnel, credentials Docker, build ou push, puis après chaque push. L’absence d’un paquet ne prouve pas sa future confidentialité et bloque le contrôleur. Le provisionnement initial reste une opération distincte à résoudre après l’incident de visibilité, selon le [runbook de livraison](runbooks/deploy.md).

## Exécution locale

Le frontend peut fonctionner directement dans l’environnement de développement choisi en P00, notamment WSL2 si c’est le mode retenu sur Windows. Les dépendances locales tournent dans Compose. Préserver la cohérence entre chemins, exécutables, Docker et réseau ; ne pas mélanger involontairement installations Windows et WSL.

P01 utilise ici Node et Java portables natifs Windows, PowerShell 5.1 et Docker Desktop avec moteur Linux. `scripts/courses.cmd` sélectionne les outils et le lanceur npm fonctionnel ; le Maven Wrapper est présent dans `apps/api`. Aucun changement de politique système ni déplacement du dossier OneDrive n’a été effectué. Voir le README pour les commandes exactes, `CONFIGURATION.md` pour le chargement des valeurs et `evidence/P01.md` pour les preuves et limites.

Le navigateur utilise une seule origine. En développement, le proxy Next.js relaie `/api/v1` vers Spring. La chaîne de déploiement P20 est **Caddy → Next.js → Spring** : Caddy transmet aussi l’API à Next, qui conserve ses contrôles Basic de recette, d’origine et de CSRF. Le préfixe est conservé à chaque étape ; une réécriture accidentelle casse les contrats et les webhooks.

PostgreSQL possède un volume nommé. Les interfaces d’administration locales et Mailpit sont liées à la boucle locale lorsque leur accès depuis l’hôte est nécessaire. Le port SMTP de Mailpit peut rester interne aux conteneurs. Aucun relais externe n’est activé par défaut. [S1, S2]

L’API étant native Windows dans ce mode, SMTP est publié sur `127.0.0.1:1025`. Le réseau Compose local est un bridge dédié : l’essai `internal:true` empêchait la publication effective des ports sur le moteur observé. La correction conserve les volumes et les bindings exclusivement en boucle locale ; elle ne décide pas du réseau de production.

P10 a retenu SeaweedFS 4.52 en mode mono-nœud pour l’adaptateur S3 local, avec image verrouillée et tests réels. P20 réemploie ce fournisseur uniquement sur des cibles isolées d’export/restauration. Cet usage ne décide pas du fournisseur S3 de production. [S3]

## Production sur une origine

Seul Caddy expose les ports nécessaires au site. Next.js, Spring et PostgreSQL utilisent des réseaux internes ; PostgreSQL et les endpoints de gestion détaillés ne sont pas publiés. Les volumes PostgreSQL et Caddy sont persistants. Les règles d’accès SSH restent celles de la cible autorisée, avec une méthode de récupération qui ne risque pas de verrouiller le propriétaire.

Caddy gère HTTPS avec une configuration adaptée au domaine et au mode DNS retenus. Vérifier les enregistrements A et AAAA, les ports requis, le stockage persistant des certificats et les contraintes de l’environnement avant d’annoncer HTTPS opérationnel. Si Cloudflare est utilisé, conserver une connexion TLS vérifiée jusqu’à l’origine et n’accorder confiance qu’aux proxys réellement attendus. Un CDN ne remplace pas les autorisations de l’application. [S4, S5]

Les cookies de session Spring couvrent Path=/ pour permettre le rendu authentifié Next.js ; ils sont HttpOnly et Secure en HTTPS de recette et de production, avec SameSite=Lax selon le contrat retenu. Le contrat CSRF est défini dans API_CONTRACTS.md : jeton obtenu depuis l’API et renouvelé aux transitions d’identité. Le proxy transmet les en-têtes nécessaires sans contourner CSRF.

Les données privées ne doivent être mises en cache ni par Next.js dans un cache partagé, ni par Caddy, ni par le CDN. Les réponses authentifiées, commandes, productions et bibliothèques utilisent les politiques privées/no-store appropriées. Un cache public doit être réservé à une réponse explicitement publique, correctement segmentée par langue et version. Le frontend ne transfère les cookies de session qu’à son API interne autorisée. [S6]

Les pages de recette sont non indexables et protégées par Basic dans Next. Une directive noindex ne constitue pas une protection d’accès. Seul `POST /api/v1/webhooks/stripe` est exempté de Basic et de CSRF pour permettre la vérification de signature par Spring lorsque Stripe est activé ; aucune autre route, variante de chemin ou méthode n’est ouverte. Dans le smoke P20, Stripe reste désactivé : le webhook exact répond 503 `PAYMENT_NOT_CONFIGURED`, les chemins voisins restent refusés et aucune vérification HMAC n’est annoncée.

## Configuration et secrets

| Groupe | Valeurs à renseigner au moment du déploiement |
| --- | --- |
| Identité du service | Domaine, origine publique, environnement, langue de publication, coordonnées réelles. |
| Base et sessions | Hôte interne, base, utilisateur limité, secret, paramètres de connexion, durée de session. |
| Stripe | Mode test/live, clé serveur, secret du webhook de cet environnement, correspondances produits/prix. |
| Stockage | Endpoint, région, buckets privés/publics distincts, identifiants limités, durée de lien, quotas. |
| Vidéo | Fournisseur retenu, identifiants de médias, jetons serveur, règles de lecture et langues réellement disponibles. |
| Emails | Expéditeur validé, SMTP/API, authentification, URLs de retour, destinataires de test autorisés. |
| Exploitation | Canal d’alerte autorisé, suivi d’erreurs, sauvegarde hors hôte, rétention, objectifs RPO/RTO. |

Chaque secret n’est accessible qu’au service qui en a besoin. Les secrets Compose montés comme fichiers peuvent être utilisés ; protéger aussi leurs fichiers sources sur l’hôte. Ils ne constituent pas un coffre magique et ne doivent pas entrer dans une image, un argument de commande journalisé, un rapport ou une variable NEXT_PUBLIC. Ne jamais afficher un fichier .env résolu pour « prouver » sa présence. [S7]

P20 fournit ces montages et leur validation dans [Compose](../infra/compose/compose.deployment.yml) et [config.mjs](../scripts/deployment/config.mjs), avec configuration de recette distincte. Les mots de passe bootstrap PostgreSQL, propriétaire de migrations et application sont séparés ; l’outbox conserve sa clé persistante pour déchiffrement après restauration. Les points d’entrée lisent les fichiers explicitement montés. Les origines et langues publiées sont lues à l’exécution, sans secret navigateur ni `.env.local` du développeur embarqué dans les images.

Prévoir une validation de configuration : un serveur peut fonctionner avec des contenus gratuits alors que les paiements sont désactivés ; une offre incomplète ou sans intégration requise ne devient pas achetable. En production, le mode démo et les utilisateurs de démonstration doivent être désactivés.

P11 conserve `COMMERCE_ENABLED=false` et `COMMERCE_ALLOWED_CURRENCIES=` par défaut. Pour une installation réellement destinée à la vente, configurer explicitement la liste autorisée parmi EUR/USD/GBP et les paramètres de chaque offre ; une liste vide bloque la préparation. Les trois devises supportées ont chacune une échelle de deux décimales, sans généralisation aux autres devises. `COMMERCE_ORDER_TTL=30m` borne une préparation sans paiement (1 minute à 24 heures) ; il n’expire pas une opération financière ambiguë. `summaryReady` contrôle les données d’offre et publications, `checkoutAvailable` contrôle aussi l’état actif et le fournisseur. En P11 aucun adaptateur de paiement n’est configuré. Les fixtures de `verify:commerce` sont créées uniquement dans PostgreSQL tmpfs étiqueté de recette, jamais par une migration de production.

## Médias et emails

Un fichier premium reste dans un bucket privé. L’API vérifie publication, propriétaire, droit et état du fichier avant de délivrer un accès temporaire. Prévoir une clé d’objet opaque, un MIME contrôlé, une taille maximale, une règle de téléchargement et une vérification après upload. Une clé fournie par le navigateur n’est pas une autorisation.

Les liens présignés donnent accès pendant une période limitée et peuvent rester utilisables jusqu’à leur expiration. Leur délivrance doit être bloquée après révocation, sans promettre l’effacement des fichiers téléchargés. Éviter la journalisation des signatures et des URLs complètes. Pour un fournisseur S3 compatible, vérifier ses différences effectives avec S3. [S8]

Pour la vidéo, utiliser un fournisseur adapté au streaming, avec contrôle d’accès et lecture signée si le contenu est premium. Ne pas construire une chaîne de transcodage maison dans la V1. En l’absence d’un média fourni et validé, proposer un contenu textuel exploitable et maintenir l’offre cohérente avec ce qui existe réellement.

Les événements métier qui doivent déclencher un email sont persistés de manière durable, avec statut et reprise. Une panne d’email ne retire pas un droit payé. Utiliser une clé métier de déduplication et l’idempotence du fournisseur quand elle existe ; l’envoi SMTP ne permet pas d’affirmer une livraison exactement une fois après toutes les coupures possibles. Conserver un état indéterminé et une procédure de rapprochement si l’accusé du fournisseur manque.

### Paramètres et exploitation locale P10

Les commandes sont détaillées dans [README](../README.md). `services:s3` démarre les trois services ; `storage:setup`, après le build API, utilise le SDK verrouillé sans lancer Spring ou un seed. Il crée les buckets locaux manquants, conserve les objets et configure une règle CORS pour l’origine publique locale exacte. Les signatures utilisent `S3_EXTERNAL_ENDPOINT`, les appels serveur `S3_ENDPOINT` : aucune réécriture de l’hôte après signature. Un hôte de conteneur `s3` ne convient pas à l’endpoint externe. Hors local/test, l’endpoint externe activé doit être HTTPS.

Le profil mono-nœud, Testcontainers et la recette gardent **24 slots**, une limite de **64 MiB par volume**, sans préallocation. Les deux buckets et le journal périodique du filer ont trois collections distinctes ; la croissance locale par défaut de sept volumes par collection occupe 21 slots et laisse une réserve de trois. Le journal explique pourquoi huit slots suffisaient à deux PUT immédiats, puis échouaient lors du circuit complet après son flush. Les profils 8/16/24 ont été réellement comparés ([preuves](evidence/P10-storage-capacity.json)). Ce dimensionnement borné sert l’intégration locale, pas une production. En cas de saturation, traiter la capacité observée ; ne pas supprimer un volume pour faire réussir un dépôt.

| Paramètres | Fonction et défaut local |
| --- | --- |
| `STORAGE_ENABLED`, `S3_ENDPOINT`, `S3_EXTERNAL_ENDPOINT`, `S3_REGION`, `S3_PATH_STYLE` | Activation explicite ; endpoints, région et adressage path-style. Le script local renseigne la boucle locale et `us-east-1`, sans désigner un fournisseur réel. |
| `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Deux buckets **à ACL privées**, éditorial et personnel ; identifiants serveur. Les noms « public/private » décrivent l’usage et non une ACL anonyme. |
| `ASSET_MAX_FILE_BYTES`, `ASSET_MAX_IMAGE_BYTES` | 5 MiB TXT ; 10 MiB PNG/JPEG. Taille déclarée puis taille et octets effectivement reçus contrôlés. |
| `ASSET_MAX_FILES_PER_PROJECT`, `ASSET_MAX_BYTES_PER_PROJECT` | Dix fichiers, 20 MiB par projet, intentions non expirées incluses. |
| `ASSET_UPLOAD_TTL_SECONDS`, `ASSET_DOWNLOAD_TTL_SECONDS` | PUT 300 s ; GET 60 s. Les nouveaux liens sont réautorisés, les anciens suivent leur TTL. |
| `ASSET_MAX_IMAGE_PIXELS`, `ASSET_MAX_IMAGE_DIMENSION` | 16 millions de pixels et 4096 px ; décodage borné puis réencodage, suppression des octets ajoutés. |
| `ASSET_STAGING_CLEANUP_GRACE_SECONDS`, `ASSET_STAGING_CLEANUP_WORKER_ENABLED`, `ASSET_STAGING_CLEANUP_POLL_DELAY` | Marge 60 s après expiration, worker activé, cycle 60 s ; au plus 25 clés staging connues par cycle, réservation SQL et réseau séparés. Aucun listing global ni suppression READY/volume. Scheduler séparé de l’outbox. |
| `MAIL_MODE`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM`, `MAIL_USERNAME`, `MAIL_PASSWORD` | `local` envoie uniquement vers le Mailpit de boucle locale ; `smtp` exige un expéditeur configuré ; `disabled` n’annonce aucun envoi. Pas de relais externe dans la recette locale. |
| `MAIL_SMTP_AUTH`, `MAIL_SMTP_STARTTLS`, `MAIL_SMTP_STARTTLS_REQUIRED`, `MAIL_SMTP_SSL` | Options explicites d’authentification/TLS selon le fournisseur. Toutes fausses pour Mailpit ; vérification du nom de serveur TLS activée. Aucune désactivation de confiance TLS pour rendre un test vert. |
| `NOTIFICATION_OUTBOX_KEY` | Base64 de 32 octets, générée par `setup:local`, jamais côté navigateur. Conserver la clé pour redémarrage/restauration ; une nouvelle clé arbitraire ne déchiffre pas les anciens événements. |
| `NOTIFICATION_OUTBOX_ENABLED`, `NOTIFICATION_OUTBOX_POLL_DELAY`, `NOTIFICATION_OUTBOX_LEASE_DURATION` | Worker activé, cycle 1 s, réservation 30 s. SMTP hors transaction SQL et requête métier. |
| `NOTIFICATION_OUTBOX_MAX_ATTEMPTS`, `NOTIFICATION_OUTBOX_RETRY_BASE`, `NOTIFICATION_OUTBOX_RETRY_MAX`, `NOTIFICATION_OUTBOX_PAYLOAD_RETENTION` | Cinq essais par cycle, délai exponentiel de 5 s à 5 min ; payload au plus 24 h, limité par l’expiration du jeton pour un reset. |

Les fichiers prêts et l’historique de leurs productions ne sont pas automatiquement supprimés. Le ciphertext d’email est purgé après acceptation SMTP ou expiration ; les métadonnées et clés de déduplication restent conservées, sans purge périodique inventée. La politique de conservation d’exploitation sera complétée aux lots concernés. Un timeout SMTP après envoi ou une réservation abandonnée devient INDETERMINATE ; aucun nouvel envoi automatique. L’opérateur vérifie le transport, choisit le motif et reconnaît explicitement le risque de doublon avant reprise. Un événement SENT/purgé ou expiré ne se rejoue pas depuis cet écran.

Le contrôle `FORMAT_VERIFIED` vérifie le format, pas une absence de malware. TXT est servi en pièce jointe, PNG/JPEG sont réencodés, aucun HTML/SVG actif accepté. PDF reste fermé faute de validateur. L’ajout futur de formats complexes devra intégrer leur contrôle adapté et la décision d’antivirus ; aucune analyse antivirus actuellement exécutée n’est annoncée.

La vidéo locale de test utilise `VIDEO_ENABLED=false` par défaut, puis `VIDEO_PROVIDER=local-test`, `VIDEO_LOCAL_ROOT` privé absolu, `VIDEO_LINK_TTL_SECONDS=60` et `VIDEO_MAX_BYTES=20971520` pour un essai explicitement activé. L’import opérateur lit un manifeste après création du contenu et contrôle ses permissions ; aucune URL ou chemin arbitraire n’est fourni par le navigateur. La copie MP4 de test est distincte des médias de formation. Le streaming commercial reste à configurer avec un véritable fournisseur, ses médias, langues, droits, sous-titres et accès disponibles. L’absence de fournisseur laisse le contenu textuel lisible.

### Expéditeur réel et DNS — préparation, non appliquée

Le domaine et le fournisseur ne sont pas fournis. Aucun DNS modifié, expéditeur vérifié ou email Internet reçu n’est revendiqué. Avant activation du relais réel : relever le domaine autorisé et les valeurs exactes du fournisseur ; inventorier le SPF existant ; préparer sa mise à jour, les sélecteurs DKIM et la politique DMARC avec les destinataires de rapports décidés par le propriétaire. Aucun `include`, sélecteur, clé publique ou domaine de rapports fictif n’est généré ici.

Après autorisation des changements concrets sur ce domaine, appliquer les seuls enregistrements demandés, vérifier leur résolution et la validation du fournisseur, puis envoyer à un destinataire de recette autorisé. Conserver date, résultat fournisseur et authentification du message reçu ; une réception Mailpit ne valide ni SPF, ni DKIM, ni DMARC. Références primaires consultées le 8 novembre 2026 : [SPF, RFC 7208](https://www.rfc-editor.org/info/rfc7208/), [DKIM, RFC 6376 et mises à jour](https://www.rfc-editor.org/info/rfc6376/), [DMARC, RFC 9989](https://www.rfc-editor.org/info/rfc9989/).

## Livraison et CI

### Paiement P12 — configuration locale et reprise

P12 ferme explicitement l’activation Stripe en `APP_ENV=production` : le code ne sait encore traiter que TEST. Le mode LIVE et les invariants de mode des migrations devront être étendus et vérifiés avant livraison commerciale. Un simple ajout de clés ne constitue pas cette activation.

Une recherche fournisseur complète sans session peut rester en attente avant l’échéance immuable de Checkout. Après cette échéance, si aucune session n’a été liée entre-temps et que le paiement reste UNKNOWN, l’opération/commande passent en NEEDS_REVIEW et le job en DEAD avec `SESSION_NOT_FOUND_AFTER_EXPIRY`, dans une transaction sous verrou. L’état financier UNKNOWN et la clé d’intention active sont conservés. Un opérateur peut reprendre le rapprochement si des faits tardifs deviennent disponibles ; aucun nouvel appel de création n’est lancé. Les sessions connues OPEN/PROCESSING conservent leur attente normale.

Le SDK Stripe34.1.0 utilise l’API2026-10-28.endive et Checkout hébergé. P12 refuse LIVE ; aucune activation de production n’est autorisée par une réussite locale. `.env.local` ignoré porte `STRIPE_ENABLED`, `STRIPE_MODE=TEST`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ACCOUNT_ID`. L’endpoint normal reste `STRIPE_API_BASE=https://api.stripe.com` ; un serveur HTTP loopback contrôlé est accepté uniquement avec `APP_ENV=test`, jamais en recette/production. Le proxy transmet la signature uniquement pour le POST exact `webhooks/stripe`, sans cookie utilisateur et sans transformer son corps ; tous les autres contrôles CSRF restent actifs.

La création a des timeouts bornés : connexion 3 s, lecture 8 s par défaut. `STRIPE_RECOVERY_WINDOW=10m` borne les reprises à paramètres et clé identiques ; la session conserve son échéance fixe d’une heure. Un résultat ambigu au-delà de cette fenêtre exige un rapprochement GET ou une intervention, jamais une nouvelle session automatique. Les opérations et snapshots ne sont pas supprimés par le worker.

P12 porte le budget par défaut du proxy à `API_TIMEOUT_MS=30000`, sous la limite client de 35 s, pour couvrir la première vérification du compte et l’appel de création (deux appels réseau bornés à3s+8s chacun). Le premier essai navigateur a effectivement reçu504 avec l’ancien défaut 5 s lors d’une inscription à froid ; il reste classé échoué. Une absence d’API reste signalée explicitement. Les éventuelles surcharges d’environnement existantes sont à vérifier : un ancien `API_TIMEOUT_MS=5000` impose toujours sa valeur.

`PAYMENT_INBOX_ENABLED=true`, `PAYMENT_INBOX_POLL_DELAY=1s`, `PAYMENT_INBOX_LEASE_DURATION=75s`, `PAYMENT_INBOX_MAX_ATTEMPTS=5`, `PAYMENT_INBOX_RETRY_BASE=5s`, `PAYMENT_INBOX_RETRY_MAX=5m`, `PAYMENT_INBOX_WAITING_DELAY=30s` règlent l’inbox et les jobs de rapprochement. Les attentes OPEN/PROCESSING ne consomment pas le budget d’erreurs. Un bail abandonné se reprend ; un incident final reste DEAD et visible via l’API d’exploitation, réservée à `payments.events.read/retry`. Le rôle de référence PAYMENTS_OPERATOR ne crée aucun compte et n’est attribué à personne par migration. P15 complétera l’interface opérateur ; P12 offre les routes contrôlées, pas un faux tableau de bord.

Les origines de droits sont créées par ligne achetée ; leurs durées commencent à l’activation PostgreSQL effective, selon le snapshot FIXED/UNLIMITED et les conditions d’actualisation explicites. Les conditions commerciales réelles doivent confirmer cet ancrage avant vente. Un email indéterminé se reprend par le mécanisme indépendant P10 ; il ne doit déclencher aucun remboursement, retrait ou nouvel achat. Après restauration, rapprocher les opérations et inbox avec Stripe avant de rouvrir les ventes.

La procédure de recette fournisseur de test est dans le [README](../README.md#p12--checkout-et-attribution-durable). La recette locale `run verify:payments` emploie des conteneurs étiquetés propres et un transport Stripe contrôlé : elle ne valide ni compte Stripe, ni endpoint distant, ni encaissement fournisseur. Les clés absentes ou un endpoint de test non accessible restent des prérequis externes explicitement bloquants.

P12 est validé localement avec parcours Stripe TEST externe exécuté : vrai Checkout hébergé, événement durable avant worker, redémarrage PAID/READY, accès privé et deux rejeux réels sans duplication. `run verify:stripe-test` réserve ses propres services tmpfs/ports3101–8181 et refuse les autres listeners de ce dépôt avant réseau. Pendant la recette finale, l’écoute de développement seule a été arrêtée temporairement puis rétablie en arrière-plan, Ready TEST2026-10-28.endive vers Next3000 ; le site est resté démarré et les empreintes des49tables partagées hors sessions sont inchangées. Aucun volume ni secret de développement modifié. [Procédure](../README.md#configuration-privée-et-stripe-cli--windows-natif), [preuves fournisseur](evidence/P12-stripe-external-checks.json).

La source Event relue possède sa version historique2022-11-15 ; les livraisons Stripe rendues pour la destination CLI sont contrôlées en2026-10-28.endive dans Spring et l’inbox, avant/après rejeu. Aucun changement global du compte. Ce résultat ne configure aucun endpoint, secret ou accès LIVE de production. La configuration commerciale réelle demeure à renseigner ; les deux refus historiques non reproduits restent suivis pour P17/P19 avant livraison dans [la note d’incident](evidence/P12-access-follow-up.md).

Le refus `spawnSync docker ENOENT` du lanceur Windows a été corrigé : normalisation de `Path/PATH`, conservation du chemin natif, recherche du Docker standard après les exécutables hérités. Aucun PATH système modifié. Huit appels réels Docker/Compose et un démarrage `run dev` ont réussi : pages FR/EN et sonde Spring via proxy HTTP200, webhook non signé HTTP400. Seuls les processus de cette vérification ont été arrêtés ; services Compose partagés et volumes conservés. Ces sondes ne constituent pas la recette de paiement.

Les tests accompagnent chaque lot ; P19 consolide la recette, il ne constitue pas le début des tests. Vérifications minimales : compilation, TypeScript, lint configuré, tests des invariants métier et intégration sur PostgreSQL, puis parcours navigateur représentatifs avec l’API réelle.

La [recette P19](evidence/P19.md) identifie les builds réutilisés et les résultats réellement observés. La [CI](CI.md) transfère les mêmes builds entre jobs après contrôle de commit et de SHA-256, avec rapports filtrés et rétention de trois jours. Sa validation locale ne prouve pas une exécution GitHub. La sonde `verify:production-config` de P19 utilisait une origine HTTPS synthétique sans TLS déployé. P20 ajoute les images et une véritable chaîne TLS locale Caddy/Next/Spring, avec démarrage, migration, sauvegarde et restauration isolés. P21 devra encore observer la cible de recette autorisée ; les incidents [P12](evidence/P12-access-follow-up.md) et [P15](evidence/P15-access-follow-up.md) restent ouverts et la vente fermée.

Les workflows utilisent le minimum de permissions. Épingler les actions à un SHA vérifié et les dépendances à des versions verrouillées. Ne pas exposer les secrets de déploiement aux contributions non approuvées. Les traces et artefacts utilisent des comptes fictifs ; limiter leur rétention. GitHub documente les permissions du jeton, le risque du code non fiable et l’épinglage des actions. [S9]

Les images de production sont construites à partir d’un commit identifiable, publiées avec digest, puis promues en recette et en production. Ne pas reconstruire silencieusement un autre état du dépôt pour la production. La configuration d’environnement reste séparée de l’image ; distinguer les valeurs publiques intégrées au build de celles lues à l’exécution. Pour permettre cette promotion, le navigateur utilise /api/v1 en relatif ; les valeurs publiques qui changent entre environnements doivent être fournies par une configuration serveur à l’exécution, sans secret et sans domaine de recette figé dans le JavaScript de production.

Le déploiement vérifie la configuration, la disponibilité des images, les dépendances, la migration et les sondes. Une sonde publique indique seulement la disponibilité générale. La disponibilité du processus et la capacité à servir des requêtes ne sont pas le même signal.

### Réalisation et frontières P20

Les Dockerfiles [web](../apps/web/Dockerfile) et [API](../apps/api/Dockerfile), les fichiers [Compose](../infra/compose/compose.deployment.yml) et [recette](../infra/compose/compose.staging.yml), ainsi que [Caddy](../infra/caddy/Caddyfile) sont présents. Les bases et images de service sont verrouillées par digest ; les versions et sources sont dans [VERSIONS.md](VERSIONS.md). Les applications tournent sous UID/GID 10001, avec fichiers en lecture seule et espaces temporaires bornés. Les limites de ressources et échantillons observés ne constituent pas une capacité de trafic garantie.

La [recette locale P20](evidence/P20-integration-checks.json) réussit ses 15 contrôles d’intégration, dont smoke HTTPS de recette 12/12 puis production 10/10 sur la même paire d’images, sans rebuild, et le CLI de surveillance avec alertes locales provoquées. L’origine et les langues sont bien fournies à l’exécution. La confiance TLS est vérifiée avec l’autorité locale du seul client de sonde ; un client sans cette autorité est refusé et la confiance système reste inchangée. Les IDs d’images locaux sont conservés ; leur `registryDigest` est nul puisqu’aucune publication n’a eu lieu. Dans le moteur Docker29.8 observé, ces IDs sont des digests d’index OCI locaux ; les manifestes linux/amd64 sont détaillés dans [l’inspection](evidence/P20-image-inspection.json).

La commande ponctuelle `migrate` de l’image API lance Flyway sans Spring, workers ou seed, avec `courses_owner` ; l’application normale utilise `courses_app`, Flyway désactivé et Hibernate en validation. La vérification PostgreSQL observe les 19 migrations et zéro compte métier sur base vide, sans privilège superutilisateur ou CREATE pour le rôle applicatif. Le workflow de déploiement ne démarre pas les écrivains avant la migration contrôlée et ne retire aucun volume.

Le [workflow manuel](../.github/workflows/deploy.yml) et les runbooks [déploiement](runbooks/deploy.md) et [retour de version](runbooks/rollback.md) sont préparés : permissions limitées, environnement GitHub préexistant, branche protégée, exclusion des exécutions concurrentes, commit CI validé et paire de digests conservée entre recette et production. Les reviewers restent facultatifs ; la règle est vérifiée si elle existe. Le contournement administrateur de l’UI n’est pas observable dans la réponse REST documentée et reste à vérifier en P21. Aucune publication de registre, connexion SSH, exécution GitHub ou déploiement distant n’a eu lieu ; aucune cible, dépense ou offre commerciale n’est inventée.

Les migrations Flyway appliquées ne sont pas réécrites. Une migration incompatible nécessite une stratégie explicite, par exemple extension puis transition et retrait ultérieur. Revenir à une image précédente ne revient pas automatiquement à un schéma précédent. Préparer une correction vers l’avant et documenter les conditions dans lesquelles l’ancienne image reste compatible.

## Sauvegarde et restauration

Définir RPO, RTO et rétention selon le risque accepté : le RPO est la perte de données maximale visée ; le RTO est le délai de reprise visé. Ces valeurs restent des décisions à confirmer, pas des garanties déduites d’un cron.

Sauvegarder la base, les objets nécessaires et la configuration de reprise, hors du serveur principal, avec chiffrement et contrôle d’accès. Un volume Docker et une copie sur le même disque ne suffisent pas comme sauvegarde hors hôte.

Choisir la méthode PostgreSQL en fonction du besoin : export logique pour les cas simples et transferts ; sauvegarde physique et archivage WAL/PITR si la perte acceptable exige une restauration plus fine. La documentation PostgreSQL distingue ces techniques et rappelle leurs contraintes. Un dump d’une base ne comprend pas automatiquement tous les rôles du cluster. [S10, S11]

La validation comprend une restauration dans une instance isolée, des contrôles de cohérence et le démarrage de l’application restaurée : utilisateurs fictifs, commandes, droits, versions et liens vers fichiers. Mesurer la durée et la date du point restauré. Après restauration, rapprocher les paiements et remboursements avec la source externe avant réouverture des achats ; éviter les doublons d’emails et d’attributions.

Le runbook doit distinguer sauvegarde avant migration, sauvegarde régulière, restauration d’exercice et restauration de production. Cette dernière peut effacer des écritures récentes : elle demande un choix explicite de cible et de point de reprise. Ne jamais automatiser une commande destructive sur une base déduite d’un nom ambigu.

P20 a réellement restauré un dump PostgreSQL vers une base isolée vide et redémarré la même image API en validation Hibernate, avec compte fictif/préférences conservés. Deux objets de buckets distincts ont aussi été exportés puis restaurés avec octets, empreintes et métadonnées identiques. Les cibles non vides sont refusées. Le bundle chiffré authentifié couvre dump, objets et clé outbox ; la preuve indique explicitement `offHostCopyObserved:false`. Ni copie hors hôte, ni PITR, ni rétention/RPO/RTO opérationnels, ni reprise de paiement ne sont validés par cet exercice. Voir [la preuve](evidence/P20-integration-checks.json) et [l’outil de sauvegarde](../scripts/deployment/backup.mjs).

## Observabilité et coûts

Suivre disponibilité HTTP, erreurs applicatives, latence, saturation disque/mémoire, âge de dernière sauvegarde, file d’événements, paiements en attente d’accès et échecs d’emails. Un moniteur placé seulement sur l’hôte de l’application ne suffit pas à signaler la perte de cet hôte : prévoir une vérification extérieure au domaine de panne.

Uptime Kuma et Sentry sont des options prévues, à configurer avec les accès disponibles. Les journaux utilisent des références techniques minimales ; exclure mots de passe, cookies, secrets, liens signés, prompts, notes et productions privées. Ne pas activer une capture de session ou des corps de requête sensibles par défaut.

Le suivi financier distingue encaissements, remboursements confirmés, frais de paiement, coûts variables, frais fixes et temps de support. Les périodes, devises et règles d’attribution sont explicites. Les revenus et la disponibilité ne sont jamais inventés pour remplir un tableau de bord.

## Définition d’une mise en ligne vérifiée

Une version est « déployée » quand la cible renvoie effectivement la version attendue et que les sondes et parcours autorisés aboutissent. Un build réussi signifie seulement que le build a réussi. Un test Stripe réussi signifie un test, pas une transaction réelle.

L’absence de clés, domaine, serveur autorisé, contenus ou prix réels doit être rapportée précisément. Continuer les parties locales et préparatoires autorisées. Ne pas acheter un service, accepter une nouvelle dépense ou contourner une restriction d’outil pour rendre un rapport vert.

## Sources officielles vérifiées le 7 novembre 2026

Les choix propres au projet restent des recommandations de conception ; les sources suivantes documentent les mécanismes techniques. Reconsulter la documentation de la version utilisée lors de l’exécution.

- [S1 Docker Compose en production](https://docs.docker.com/compose/how-tos/production/)
- [S2 Mailpit dans Docker](https://mailpit.axllent.org/docs/install/docker/) et [configuration SMTP](https://mailpit.axllent.org/docs/configuration/smtp/)
- [S3 Projet officiel SeaweedFS](https://github.com/seaweedfs/seaweedfs)
- [S4 Caddy HTTPS automatique](https://caddyserver.com/docs/automatic-https)
- [S5 Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [S6 Next.js auto-hébergement](https://nextjs.org/docs/app/guides/self-hosting) et [déploiement](https://nextjs.org/docs/app/getting-started/deploying)
- [S7 Secrets dans Docker Compose](https://docs.docker.com/compose/how-tos/use-secrets/)
- [S8 S3 et URLs présignées](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [S9 Sécurité des workflows GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [S10 Sauvegardes PostgreSQL](https://www.postgresql.org/docs/current/backup.html)
- [S11 pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
- [S12 Traces Playwright](https://playwright.dev/docs/trace-viewer) et [reprises de tests](https://playwright.dev/docs/test-retries)
- [S13 Référence WCAG 2.2 du W3C](https://www.w3.org/WAI/WCAG22/quickref/)

