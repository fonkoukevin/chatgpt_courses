# Raccorder la recette au frontal partagé

Préparé en P21 pour le VPS OVH autorisé. **Aucun raccordement, reload ni déploiement applicatif effectué.** L’inspection constate un frontal Caddy 2.11.4 actif sur 80/443 pour une autre application. Le déploiement Courses ne doit ni le recréer, ni tirer son image flottante, ni publier un autre service sur ces ports.

## Configuration Courses

Utiliser un répertoire distinct `/home/plumora/chatgpt-courses/staging`, le projet `courses-staging`, la base `courses_staging` et des secrets propres à cette recette. Le fichier privé `config/deployment.env` ajoute au modèle P20 :

```dotenv
INGRESS_MODE=shared
INGRESS_NETWORK=courses-staging-ingress
STAGING_INTEGRATIONS=mailpit-s3
PUBLIC_DOMAIN=staging.chatgpt-courses.com
APP_PUBLIC_ORIGIN=https://staging.chatgpt-courses.com
FILES_PUBLIC_ORIGIN=https://files-staging.chatgpt-courses.com
```

Les digests et `SECRETS_DIR` doivent être renseignés avec les valeurs effectivement préparées. Ce fragment ne suffit pas à valider une configuration. Les fichiers supplémentaires sont `staging-s3-access-key`, `staging-s3-secret-key` et `staging-s3-auth.json`, en plus des secrets PostgreSQL, outbox et Basic. Le JSON SeaweedFS contient exactement une identité `courses-staging`, ses credentials concordants et les actions `Admin`, `Read`, `List`, `Write`, `Tagging`. Ne pas réutiliser les credentials locaux ou ceux d’une production.

Le contrôleur fusionne dans cet ordre : `compose.deployment.yml`, `compose.staging.yml`, `compose.shared-ingress.yml`, `compose.staging-integrations.yml`. Les deux derniers sont opt-in. Le mode partagé vérifie que le réseau externe existe, est `bridge` et `internal:true` **avant** pull ou migration. Le service Caddy Courses est inactif et aucun port web n’est publié. Mailpit garde SMTP et son interface internes. SeaweedFS 4.52 reste un émulateur de recette, pas un choix de fournisseur S3 de production. Commerce, Stripe et vidéo restent désactivés dans cette configuration initiale.

Les fichiers signés utilisent directement l’origine HTTPS `files-staging`, sans ajout/retrait d’un préfixe S3. L’accès anonyme aux objets doit être refusé ; le CORS doit autoriser seulement l’origine exacte de l’application. Le bootstrap des buckets/CORS et une vraie vérification upload/download restent obligatoires avant de déclarer le stockage opérationnel. Une adaptation Compose n’exécute pas ces contrôles.

## Préparer le candidat sans modifier le frontal

Le préparateur accepte uniquement des sous-domaines de recette concordants et un SHA256 exact du fichier source. Sur l’hôte, avec le contrôleur issu du commit revu :

```sh
/home/plumora/.local/lib/node-v24.22.2-linux-x64/bin/node scripts/deployment/shared-ingress-plan.mjs plan \
  --current /opt/plumora/deploy/Caddyfile \
  --expected-sha256 <empreinte-actuelle-verifiee> \
  --caddy-container plumora-caddy \
  --domain staging.chatgpt-courses.com \
  --files-domain files-staging.chatgpt-courses.com \
  --output-directory <nouveau-repertoire-prive-absolu>
```

Les éléments entre chevrons doivent être remplacés. L’outil produit `Caddyfile.before`, `Caddyfile.candidate` et `plan.json` en privé, jamais dans Git. Il adapte les deux configurations avec le binaire Caddy du conteneur existant, compare les routes préexistantes et contrôle les loggers des nouveaux sites. Aucune configuration complète, en-tête, requête ou message d’erreur libre n’est imprimé. Un fichier déjà modifié ou déjà raccordé provoque un arrêt, sans écrasement. Ce contrôle syntaxique ne provisionne pas TLS et ne recharge pas Caddy.

Les nouveaux sites dirigent vers `courses-staging-web:3000` et `courses-staging-s3:8333`. Basic reste appliqué dans Next ; seul le POST Stripe exact peut en être exempté selon le contrat de signature. Les journaux d’accès **et** d’erreur de ces deux sites ont des filtres distincts, exclus du logger par défaut. La journalisation de l’autre application reste intacte ; si son mode debug ou la journalisation des credentials empêche cette garantie, le préparateur refuse le candidat.

## Activation à effectuer après les préconditions

1. Constater la CI source réussie, les protections GitHub effectives, les deux DNS, les images publiées avec leur visibilité explicitement autorisée (publique depuis la nouvelle décision P21), les deux digests vérifiés et les secrets de recette validés. Contrôler les sondes de l’application existante avant intervention.
2. Sauvegarder privément le Caddyfile **et** le Compose réels de l’autre projet, avec leurs empreintes et leur état Git. Préparer une modification durable de ce Compose : déclaration externe `courses-staging-ingress`, ajout au seul service Caddy, maintien de tous ses réseaux actuels. Valider le Compose fusionné avec le **nom de projet existant**. Ne pas modifier ses images, volumes, ports, autres services ou credentials.
3. Créer le réseau Courses interne seulement s’il est absent ; si présent, contrôler son identité, ses propriétés et ses membres avant usage. Lui raccorder le Caddy existant sans recréation, et conserver l’ajout dans le Compose durable. Aucun conteneur Courses autre que web et S3 ne rejoint ce réseau.
4. Le helper P21 revu regroupe raccordement réseau, persistance Compose/Caddy et reload dans une même activation. Son précontrôle exige encore les12anciens conteneurs et zéro Courses ; `release-apply` exige quant à lui le réseau avant pull. **Activer donc ce helper avant le premier déploiement Courses**, après candidat adapté et plan de reprise prêts. Le Caddyfile est un **bind de fichier individuel** : recontrôler empreinte/inode/propriétaire, sauvegarder puis écrire dans l’inode existant, adapter/valider et recharger avec le Caddy courant. Ne pas remplacer ce fichier par renommage ni relancer `compose up` sur le frontal.
5. Contrôler immédiatement les quatre anciens domaines et les identités/états/images des12anciens conteneurs. Les deux nouvelles origines peuvent temporairement répondre502 tant que leurs backends ne sont pas démarrés ; ce n’est pas une recette réussie. Déployer ensuite les digests par le workflow protégé, puis vérifier web/S3 et le smoke HTTPS. Aucune activation `current` avant son succès, aucun replay aveugle du helper après mutation de ses empreintes initiales.
6. Vérifier immédiatement les anciens domaines et les deux nouvelles origines : certificat vérifié, Basic/noindex, préfixe API, CSRF, cookies, erreurs no-store, S3 signé/anonyme et logs expurgés. Toute erreur arrête la recette ; restaurer le fichier sauvegardé avec le même soin d’inode et recharger si nécessaire. Aucun rollback de base implicite.
7. Conserver les changements du frontal dans le dépôt/déploiement qui le possède, après revue de son état existant. Une modification seulement présente sur le serveur peut être écrasée par sa prochaine livraison ; elle ne constitue pas une intégration durable.

Les commandes de cette section sont une procédure, pas une preuve d’exécution. L’agent n’a créé/connecté aucun réseau ni modifié/rechargé le frontal partagé à ce stade.

Références officielles : [Caddy global logging](https://caddyserver.com/docs/caddyfile/options#log), [access logging](https://caddyserver.com/docs/caddyfile/directives/log), [adapt/reload](https://caddyserver.com/docs/command-line), [réseau bridge interne Docker](https://docs.docker.com/reference/cli/docker/network/create/#internal).
