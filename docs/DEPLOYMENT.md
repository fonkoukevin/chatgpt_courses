# Déploiement et exploitation de ChatGPT Courses

Document de référence pour P01, P10 et P17 à P23. Ce document fixe une direction et des critères de réalisation ; il ne constitue pas la preuve qu’un serveur, un fournisseur ou une sauvegarde existe déjà.

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

## Exécution locale

Le frontend peut fonctionner directement dans l’environnement de développement choisi en P00, notamment WSL2 si c’est le mode retenu sur Windows. Les dépendances locales tournent dans Compose. Préserver la cohérence entre chemins, exécutables, Docker et réseau ; ne pas mélanger involontairement installations Windows et WSL.

P01 utilise ici Node et Java portables natifs Windows, PowerShell 5.1 et Docker Desktop avec moteur Linux. `scripts/courses.cmd` sélectionne les outils et le lanceur npm fonctionnel ; le Maven Wrapper est présent dans `apps/api`. Aucun changement de politique système ni déplacement du dossier OneDrive n’a été effectué. Voir le README pour les commandes exactes, `CONFIGURATION.md` pour le chargement des valeurs et `evidence/P01.md` pour les preuves et limites.

Le navigateur utilise une seule origine. En développement, un proxy Next.js documenté relaie /api/v1 vers Spring. En production, Caddy relaie ce préfixe vers l’API et les autres routes vers Next.js. Le chemin de l’API doit être conservé : une réécriture de préfixe accidentelle casse les contrats et les webhooks.

PostgreSQL possède un volume nommé. Les interfaces d’administration locales et Mailpit sont liées à la boucle locale lorsque leur accès depuis l’hôte est nécessaire. Le port SMTP de Mailpit peut rester interne aux conteneurs. Aucun relais externe n’est activé par défaut. [S1, S2]

L’API étant native Windows dans ce mode, SMTP est publié sur `127.0.0.1:1025`. Le réseau Compose local est un bridge dédié : l’essai `internal:true` empêchait la publication effective des ports sur le moteur observé. La correction conserve les volumes et les bindings exclusivement en boucle locale ; elle ne décide pas du réseau de production.

Pour un S3 local, SeaweedFS en mode mono-nœud constitue un candidat documenté par son projet officiel. Vérifier une version stable, sa commande et son format de configuration avant de retenir l’image ; consigner le choix. Cet usage local ne décide pas du fournisseur S3 de production. [S3]

## Production sur une origine

Seul Caddy expose les ports nécessaires au site. Next.js, Spring et PostgreSQL utilisent des réseaux internes ; PostgreSQL et les endpoints de gestion détaillés ne sont pas publiés. Les volumes PostgreSQL et Caddy sont persistants. Les règles d’accès SSH restent celles de la cible autorisée, avec une méthode de récupération qui ne risque pas de verrouiller le propriétaire.

Caddy gère HTTPS avec une configuration adaptée au domaine et au mode DNS retenus. Vérifier les enregistrements A et AAAA, les ports requis, le stockage persistant des certificats et les contraintes de l’environnement avant d’annoncer HTTPS opérationnel. Si Cloudflare est utilisé, conserver une connexion TLS vérifiée jusqu’à l’origine et n’accorder confiance qu’aux proxys réellement attendus. Un CDN ne remplace pas les autorisations de l’application. [S4, S5]

Les cookies de session Spring couvrent Path=/ pour permettre le rendu authentifié Next.js ; ils sont HttpOnly et Secure en production, avec SameSite=Lax selon le contrat retenu. Le contrat CSRF est défini dans API_CONTRACTS.md : jeton obtenu depuis l’API et renouvelé aux transitions d’identité. Le proxy transmet les en-têtes nécessaires sans contourner CSRF.

Les données privées ne doivent être mises en cache ni par Next.js dans un cache partagé, ni par Caddy, ni par le CDN. Les réponses authentifiées, commandes, productions et bibliothèques utilisent les politiques privées/no-store appropriées. Un cache public doit être réservé à une réponse explicitement publique, correctement segmentée par langue et version. Le frontend ne transfère les cookies de session qu’à son API interne autorisée. [S6]

Les pages de recette sont non indexables et protégées selon le besoin d’accès. Une directive noindex ne constitue pas une protection d’accès. Si la recette utilise une protection au niveau proxy, le webhook Stripe de test doit pouvoir atteindre uniquement sa route exacte, avec vérification de signature par Spring ; ne pas ouvrir toute l’API pour contourner cette contrainte.

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

Prévoir une validation de configuration : un serveur peut fonctionner avec des contenus gratuits alors que les paiements sont désactivés ; une offre incomplète ou sans intégration requise ne devient pas achetable. En production, le mode démo et les utilisateurs de démonstration doivent être désactivés.

## Médias et emails

Un fichier premium reste dans un bucket privé. L’API vérifie publication, propriétaire, droit et état du fichier avant de délivrer un accès temporaire. Prévoir une clé d’objet opaque, un MIME contrôlé, une taille maximale, une règle de téléchargement et une vérification après upload. Une clé fournie par le navigateur n’est pas une autorisation.

Les liens présignés donnent accès pendant une période limitée et peuvent rester utilisables jusqu’à leur expiration. Leur délivrance doit être bloquée après révocation, sans promettre l’effacement des fichiers téléchargés. Éviter la journalisation des signatures et des URLs complètes. Pour un fournisseur S3 compatible, vérifier ses différences effectives avec S3. [S8]

Pour la vidéo, utiliser un fournisseur adapté au streaming, avec contrôle d’accès et lecture signée si le contenu est premium. Ne pas construire une chaîne de transcodage maison dans la V1. En l’absence d’un média fourni et validé, proposer un contenu textuel exploitable et maintenir l’offre cohérente avec ce qui existe réellement.

Les événements métier qui doivent déclencher un email sont persistés de manière durable, avec statut et reprise. Une panne d’email ne retire pas un droit payé. Utiliser une clé métier de déduplication et l’idempotence du fournisseur quand elle existe ; l’envoi SMTP ne permet pas d’affirmer une livraison exactement une fois après toutes les coupures possibles. Conserver un état indéterminé et une procédure de rapprochement si l’accusé du fournisseur manque.

## Livraison et CI

Les tests accompagnent chaque lot ; P19 consolide la recette, il ne constitue pas le début des tests. Vérifications minimales : compilation, TypeScript, lint configuré, tests des invariants métier et intégration sur PostgreSQL, puis parcours navigateur représentatifs avec l’API réelle.

Les workflows utilisent le minimum de permissions. Épingler les actions à un SHA vérifié et les dépendances à des versions verrouillées. Ne pas exposer les secrets de déploiement aux contributions non approuvées. Les traces et artefacts utilisent des comptes fictifs ; limiter leur rétention. GitHub documente les permissions du jeton, le risque du code non fiable et l’épinglage des actions. [S9]

Les images de production sont construites à partir d’un commit identifiable, publiées avec digest, puis promues en recette et en production. Ne pas reconstruire silencieusement un autre état du dépôt pour la production. La configuration d’environnement reste séparée de l’image ; distinguer les valeurs publiques intégrées au build de celles lues à l’exécution. Pour permettre cette promotion, le navigateur utilise /api/v1 en relatif ; les valeurs publiques qui changent entre environnements doivent être fournies par une configuration serveur à l’exécution, sans secret et sans domaine de recette figé dans le JavaScript de production.

Le déploiement vérifie la configuration, la disponibilité des images, les dépendances, la migration et les sondes. Une sonde publique indique seulement la disponibilité générale. La disponibilité du processus et la capacité à servir des requêtes ne sont pas le même signal.

Les migrations Flyway appliquées ne sont pas réécrites. Une migration incompatible nécessite une stratégie explicite, par exemple extension puis transition et retrait ultérieur. Revenir à une image précédente ne revient pas automatiquement à un schéma précédent. Préparer une correction vers l’avant et documenter les conditions dans lesquelles l’ancienne image reste compatible.

## Sauvegarde et restauration

Définir RPO, RTO et rétention selon le risque accepté : le RPO est la perte de données maximale visée ; le RTO est le délai de reprise visé. Ces valeurs restent des décisions à confirmer, pas des garanties déduites d’un cron.

Sauvegarder la base, les objets nécessaires et la configuration de reprise, hors du serveur principal, avec chiffrement et contrôle d’accès. Un volume Docker et une copie sur le même disque ne suffisent pas comme sauvegarde hors hôte.

Choisir la méthode PostgreSQL en fonction du besoin : export logique pour les cas simples et transferts ; sauvegarde physique et archivage WAL/PITR si la perte acceptable exige une restauration plus fine. La documentation PostgreSQL distingue ces techniques et rappelle leurs contraintes. Un dump d’une base ne comprend pas automatiquement tous les rôles du cluster. [S10, S11]

La validation comprend une restauration dans une instance isolée, des contrôles de cohérence et le démarrage de l’application restaurée : utilisateurs fictifs, commandes, droits, versions et liens vers fichiers. Mesurer la durée et la date du point restauré. Après restauration, rapprocher les paiements et remboursements avec la source externe avant réouverture des achats ; éviter les doublons d’emails et d’attributions.

Le runbook doit distinguer sauvegarde avant migration, sauvegarde régulière, restauration d’exercice et restauration de production. Cette dernière peut effacer des écritures récentes : elle demande un choix explicite de cible et de point de reprise. Ne jamais automatiser une commande destructive sur une base déduite d’un nom ambigu.

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

