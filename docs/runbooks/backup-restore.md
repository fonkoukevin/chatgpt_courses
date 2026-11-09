# Sauvegarder et restaurer sur une cible isolée

P20 a exercé une sauvegarde PostgreSQL 18.6, le chiffrement authentifié du bundle, puis la restauration dans une base et un service S3 distincts : **un compte fictif désactivé, ses préférences et deux objets de 84 octets au total**, avec leurs métadonnées. L'exercice et son nettoyage sont consignés dans [P20-integration-checks.json](../evidence/P20-integration-checks.json). Le démarrage de la même image API après restauration a été vérifié. Cet exercice ne valide pas des commandes, projets, droits, paiements, téléchargements applicatifs, une volumétrie de production ou une copie hors hôte.

## Préparer la fenêtre et les secrets

L'opérateur vérifie la cible autorisée, le projet Compose, les références d'images par digest, le commit et les volumes concernés. Les commandes ci-dessous sont des procédures **Linux/Bash à adapter aux seuls chemins et environnements vérifiés** ; leur rédaction ne les exécute pas sur un serveur. Node 24.22.2, Docker et les scripts du commit validé doivent être disponibles. Le bundle de déploiement minimal ne transporte pas automatiquement tous les outils de maintenance : prévoir séparément leur copie contrôlée, avec leurs imports, sans fichiers `.env` ni secrets du développeur.

Maintenir une copie durable des mots de passe de la cible, des paramètres S3 et de la clé `NOTIFICATION_OUTBOX_KEY`. Cette dernière permet de déchiffrer les payloads outbox déjà persistés : une clé aléatoire neuve ne les remplace pas. Le bundle sauvegarde cette clé sous forme chiffrée ; sa clé de sauvegarde de 32 octets en base64 est conservée **séparément** des archives et de leur copie hors hôte.

La génération suivante refuse un fichier de destination existant et n'affiche pas la valeur :

```bash
umask 077
node scripts/deployment/backup.mjs key --output /chemin-prive/backup-key
```

Le répertoire privé est réservé à l'opérateur. Les fichiers montés dans un conteneur doivent rester lisibles par son UID 10001 ; protéger le répertoire source sur l'hôte. Ne pas passer les valeurs des clés dans un argument, les imprimer, exécuter `set -x` ou exporter un `docker compose config` résolu dans un rapport public.

Avant le dump, arrêter `api` et `web` du **seul projet autorisé**, et tout autre écrivain ou import/migration indépendant. Suspendre également les écritures directes d'objets de cette cible. Garder cette quiescence entre export des objets, dump et migration/déploiement : PostgreSQL et S3 n'ont pas de transaction commune. Le script refuse le dump si un conteneur API/web de ce projet tourne ; il ne découvre pas tous les écrivains extérieurs à la pile.

Exemple de sélection explicite pour une recette déjà installée :

```bash
DEPLOY_DIR=/srv/chatgpt-courses/staging
PROJECT=courses-staging
DATABASE=courses_staging
RELEASE_DIR="$DEPLOY_DIR/current"
CONFIG="$DEPLOY_DIR/config/deployment.env"

DC=(docker compose --project-name "$PROJECT"
    --env-file "$CONFIG" --env-file "$RELEASE_DIR/release.env"
    -f "$RELEASE_DIR/infra/compose/compose.deployment.yml"
    -f "$RELEASE_DIR/infra/compose/compose.staging.yml")
"${DC[@]}" config --quiet
"${DC[@]}" stop api web
PG_CONTAINER=$("${DC[@]}" ps -q postgres)
```

Pour production, employer ses propres projet/configuration et omettre le fichier `compose.staging.yml`. Ne pas lire ces fichiers comme du code shell. Vérifier que l'identifiant PG appartient au projet attendu ; le script de sauvegarde contrôle aussi ce label. Ne jamais arrêter le développement ou une autre pile par un filtre de nom approximatif.

## Exporter les objets puis créer le bundle

L'image API contient la commande `objects export /backup/<dossier>`. Elle utilise le SDK S3 déjà verrouillé, sans Spring, serveur, migration ou worker. Préparer un fichier **non secret** `objects-source.env` avec les seuls paramètres S3 de la cible : `APP_ENV=staging` ou `production`, endpoint HTTPS, région, deux noms de buckets distincts, `S3_PATH_STYLE` et les deux chemins de secrets ci-dessous. Les valeurs restent dans les fichiers de secrets montés.

```text
S3_ACCESS_KEY_FILE=/run/secrets/S3_ACCESS_KEY
S3_SECRET_KEY_FILE=/run/secrets/S3_SECRET_KEY
```

Les noms historiques `S3_PUBLIC_BUCKET` et `S3_PRIVATE_BUCKET` désignent ici les rôles éditorial et personnel ; **les deux buckets restent privés**. Utiliser l'image API de la release vérifiée. Le dossier exporté doit être neuf ou vide et accessible à UID 10001. Définir `API_IMAGE` et `SOURCE_COMMIT` à partir du même manifeste de release vérifié ; `WORK`, les fichiers de paramètres et de secrets sont des chemins opérateur contrôlés.

```bash
docker run --rm --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,size=128m,uid=10001,gid=10001,mode=1770 \
  --env-file "$OBJECT_SOURCE_ENV" \
  --mount "type=bind,source=$WORK,target=/backup" \
  --mount "type=bind,source=$S3_ACCESS_FILE,target=/run/secrets/S3_ACCESS_KEY,readonly" \
  --mount "type=bind,source=$S3_SECRET_FILE,target=/run/secrets/S3_SECRET_KEY,readonly" \
  "$API_IMAGE" objects export /backup/objects
```

`$WORK`, les chemins de secrets, le fichier d'environnement et `$API_IMAGE` sont des paramètres opérateur vérifiés, pas des valeurs fournies par un utilisateur web. Ne monter que l'espace de travail nécessaire. Un export interrompu sans reçu de succès n'est pas une sauvegarde valide.

L'export écrit des fichiers plats `000001.bin`, etc., et un `manifest.json` **privé**, qui contient clés d'objets, noms de buckets, endpoint source, tailles, SHA256, Content-Type et Content-Disposition. La sortie standard ne contient que résultat, compteurs et empreinte du manifeste. La lecture est en streaming de 64 KiB ; les plafonds par défaut sont 10000 objets et 1 GiB au total (`OBJECT_SNAPSHOT_MAX_OBJECTS`, `OBJECT_SNAPSHOT_MAX_BYTES`, bornes maximales 100000/1 TiB). Le manifeste est limité à 16 MiB. Le chiffreur Node limite chaque fichier clair à 16 GiB : augmenter le plafond S3 ne supprime pas cette limite du bundle.

Créer ensuite le bundle complet avec l'outil du commit validé :

```bash
node scripts/deployment/backup-bundle.mjs capture \
  --container "$PG_CONTAINER" --project "$PROJECT" \
  --environment staging --database "$DATABASE" \
  --source-commit "$SOURCE_COMMIT" \
  --object-directory "$WORK/objects" \
  --backup-root "$DEPLOY_DIR/backups" \
  --key-file "$BACKUP_KEY_FILE" \
  --outbox-key-file "$OUTBOX_KEY_FILE"
```

Le répertoire `backups` existe au préalable. `pg_dump --format=custom --no-owner --no-acl` s'exécute dans le conteneur PostgreSQL avec `courses_owner`. Le mot de passe est lu dans son secret monté, jamais transmis dans les arguments. La commande PG est bornée à 900 s, avec arrêt forcé 10 s après TERM ; le processus de transfert hôte a une borne de 17 minutes. Ces plafonds techniques ne sont pas un RTO.

Chaque fichier est chiffré avec AES-256-GCM, nonce indépendant et authentification avant publication du fichier final. Le bundle contient `database.enc`, le manifeste et les objets chiffrés, `notification-key.enc`, puis un reçu à empreintes. Les temporaires clairs du dump sont retirés en fin de traitement. Les objets d'export et le dossier ultérieurement déchiffré restent sensibles ; leur accès et retrait relèvent de l'opérateur, sans nouvelle politique automatique de conservation.

Conserver l'empreinte `receiptSha256` retournée et le dossier `backups/<empreinte>`. Le reçu lie environnement/projet/base/commit et les SHA des fichiers. Il est nécessaire avant une migration d'une base existante selon [deploy.md](deploy.md) ; son existence n'établit pas une copie hors hôte ou une restauration réussie.

## Copier hors hôte

La destination, les credentials et la rétention hors hôte ne sont pas configurés ni exercés en P20. L'exemple suivant prépare une copie SSH/SFTP vers une cible indépendante **déjà autorisée** ; il n'installe ni serveur, ni fournisseur, ni compte. Vérifier la clé d'hôte par un canal indépendant et préparer le répertoire parent privé. Les paramètres de compte/hôte/port viennent de cet inventaire opérateur ; aucun champ web ne les fournit.

Depuis le bundle validé, créer les sommes des seuls fichiers chiffrés et du reçu. Le répertoire distant est neuf et son chemin est volontairement limité à des caractères sans métacaractères shell :

```bash
set -euo pipefail
[[ "$RECEIPT_SHA256" =~ ^[a-f0-9]{64}$ ]]
[[ "$OFF_HOST_DIRECTORY" =~ ^/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$ ]]
REMOTE_BUNDLE="$OFF_HOST_DIRECTORY/$RECEIPT_SHA256"

(cd "$BUNDLE_DIR" && sha256sum receipt.json *.enc > SHA256SUMS)
SUMS_SHA256=$(sha256sum "$BUNDLE_DIR/SHA256SUMS" | cut -d ' ' -f 1)
SSH_OPTIONS=(-o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o ForwardAgent=no
  -o "UserKnownHostsFile=$OFF_HOST_KNOWN_HOSTS" -i "$OFF_HOST_SSH_KEY")

ssh "${SSH_OPTIONS[@]}" -p "$OFF_HOST_PORT" \
  "$OFF_HOST_USER@$OFF_HOST_HOST" \
  "test ! -e '$REMOTE_BUNDLE' && mkdir -m 700 '$REMOTE_BUNDLE'"
scp "${SSH_OPTIONS[@]}" -P "$OFF_HOST_PORT" \
  "$BUNDLE_DIR/receipt.json" "$BUNDLE_DIR/"*.enc "$BUNDLE_DIR/SHA256SUMS" \
  "$OFF_HOST_USER@$OFF_HOST_HOST:$REMOTE_BUNDLE/"

printf '%s  receipt.json\n%s  SHA256SUMS\n' "$RECEIPT_SHA256" "$SUMS_SHA256" |
  ssh "${SSH_OPTIONS[@]}" -p "$OFF_HOST_PORT" \
    "$OFF_HOST_USER@$OFF_HOST_HOST" \
    "cd '$REMOTE_BUNDLE' && sha256sum --check --status - && sha256sum --check --status SHA256SUMS"
```

Le secret SSH reste dans son fichier protégé ; seule sa localisation apparaît dans les arguments. Ne pas employer `StrictHostKeyChecking=no`, `ssh-keyscan` comme preuve de confiance, transfert d'agent ou SCP en ancien mode `-O`. La copie ne contient **pas** `BACKUP_KEY_FILE` : conserver cette clé et le reçu attendu dans un emplacement de récupération séparé et autorisé. Conserver une preuve opérateur de la vérification distante et des empreintes attendues. Cette vérification n'est pas un acquittement de durabilité du fournisseur.

Pour l'exercice de reprise, récupérer les fichiers depuis cette copie dans un **nouveau** répertoire local privé avec les mêmes options SFTP/SSH, puis employer l'empreinte du reçu conservée indépendamment avec `backup-bundle.mjs unpack`. Celui-ci recontrôle aussi les SHA des ciphertexts et les tags GCM. Ne pas prendre simplement une empreinte recalculée sur une copie suspecte comme valeur attendue. Le fichier auxiliaire `SHA256SUMS` n'est pas un substitut à cette authentification.

Tester une restauration depuis **cette copie**, pas seulement depuis le disque source. Un volume Docker sur le même hôte ou un reçu `offHostCopyObserved:false` ne protège pas de la perte de l'hôte. Ne pas créer une attestation de copie pour faire passer le contrôleur de déploiement. Aucun des transferts SSH/SFTP ci-dessus n'a été exécuté par P20.

## Restaurer d'abord en isolation

Choisir un nouveau projet, une base initialisée avec les rôles mais **sans table utilisateur**, et deux buckets cibles précréés **vides**. Ne pas lancer Flyway avant `pg_restore` : cela remplirait la base vide exigée. `pg_isready -h 127.0.0.1` doit attendre le serveur PG final, pas le serveur temporaire d'initialisation. Les secrets/réseaux de cette cible sont distincts de la source ; aucun reset, `--clean`, `down --volumes` ou suppression de schéma n'est requis.

`RESTORE_DC` désigne un tableau Bash construit comme `DC`, mais avec les seuls projet et fichiers de la cible isolée autorisée. Démarrer seulement PG à ce stade :

```bash
"${RESTORE_DC[@]}" up --no-build -d --wait --wait-timeout 180 postgres
RESTORE_PG_CONTAINER=$("${RESTORE_DC[@]}" ps -q postgres)
```

Authentifier/déchiffrer le bundle dans un dossier neuf :

```bash
node scripts/deployment/backup-bundle.mjs unpack \
  --directory "$BUNDLE_DIR" --receipt-sha256 "$RECEIPT_SHA256" \
  --key-file "$BACKUP_KEY_FILE" --output "$RESTORE_WORK"
```

Un mauvais SHA, une clé erronée, un tag GCM invalide ou un fichier manquant bloque la reprise. La finalisation refuse l'écrasement d'un fichier existant. Le contenu déchiffré reste privé.

La commande objets de restauration reprend le même montage de secrets S3, mais avec le fichier d'environnement de la **cible** et le sous-dossier déchiffré monté en lecture seule :

```bash
docker run --rm --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,size=128m,uid=10001,gid=10001,mode=1770 \
  --env-file "$OBJECT_TARGET_ENV" \
  --mount "type=bind,source=$RESTORE_WORK/objects,target=/backup/objects,readonly" \
  --mount "type=bind,source=$TARGET_S3_ACCESS_FILE,target=/run/secrets/S3_ACCESS_KEY,readonly" \
  --mount "type=bind,source=$TARGET_S3_SECRET_FILE,target=/run/secrets/S3_SECRET_KEY,readonly" \
  "$API_IMAGE" objects restore /backup/objects
```

Par défaut, les noms cibles doivent différer de tous les noms sources. Pour préserver les références `assets.bucket_name` de PostgreSQL, le mode explicite suivant permet les **mêmes noms par rôle**, uniquement sur un endpoint canonique différent :

```text
OBJECT_RESTORE_PRESERVE_BUCKET_NAMES=true
OBJECT_RESTORE_TARGET_CONFIRMED=true
```

Ces deux lignes appartiennent au fichier d'environnement privé de restauration, après vérification opérateur. Toutes les tailles, noms de fichiers et empreintes sont validés avant le premier PUT ; la cible doit rester vide, et chaque PUT emploie `If-None-Match:*`. Le mode ne met à jour aucune identité de bucket dans `assets`. Un autre alias du même service n'établit pas son indépendance. La preuve locale utilise deux SeaweedFS distincts ; elle n'établit pas qu'un fournisseur réel à namespace global, notamment un bucket déjà existant ailleurs, permettrait cette stratégie. L'exception HTTP exige `APP_ENV=test` **et** `ISOLATED_OBJECT_SNAPSHOT=true` et reste réservée aux émulateurs isolés du harness ; recette/production exigent HTTPS.

Restaurer le dump sur la base vide du seul conteneur cible autorisé :

```bash
node scripts/deployment/backup.mjs database-restore \
  --container "$RESTORE_PG_CONTAINER" --project "$RESTORE_PROJECT" \
  --database "$RESTORE_DATABASE" --input "$BUNDLE_DIR/database.enc" \
  --key-file "$BACKUP_KEY_FILE"
```

L'outil authentifie le fichier avant `pg_restore --exit-on-error --single-transaction --no-owner --no-acl`. Une base contenant déjà des tables est refusée ; ne pas enlever ce garde pour rejouer sur une cible partiellement restaurée. En cas d'échec, isoler cette cible et décider explicitement d'une nouvelle cible vide.

Préparer ensuite la configuration de cette pile restaurée : restaurer la clé outbox déchiffrée `notification-key`, pointer PG et S3 vers la cible vérifiée et garder commerce/notifications vers des tiers fermés. Le fichier déchiffré est privé ; adapter sa lisibilité pour le montage UID 10001 sans ouvrir le répertoire hôte aux autres utilisateurs. Ne pas le remplacer par une clé neuve.

Lancer `command: [migrate]` sur **la même image API** avec `POSTGRES_USER=courses_owner`, son secret et `POSTGRES_APP_ROLE=courses_app` :

```bash
"${RESTORE_DC[@]}" run --rm --no-deps migrate
"${RESTORE_DC[@]}" up --no-build --no-deps -d --wait --wait-timeout 180 api web caddy
```

Le CLI valide/rejoue Flyway sans seed, puis rend à l'application USAGE+DML sur les tables, USAGE/SELECT sur les séquences et les privilèges par défaut du propriétaire ; l'historique Flyway reste en lecture seule pour l'application. `courses_app` reste non-superutilisateur et sans droit CREATE de base/schéma. Démarrer l'API seulement après ce succès : Flyway y est désactivé, Hibernate utilise `validate`, l'initialisation SQL et Spring Session restent désactivées.

Avant une reprise de service, comparer lignes et empreintes des données attendues, nombre/bytes/SHA/métadonnées des objets, secrets indispensables et refus d'écrasement ; effectuer les parcours autorisés et refus propriétaires nécessaires. Le seul `UP` de la sonde ne prouve pas ces contrôles. Rapprocher paiements/remboursements, origines de droits et inbox/outbox avec leurs autorités avant toute reprise commerciale ; ne pas recréer une opération financière ou un droit à partir d'un ancien email. Le [retour d'image](rollback.md) est une procédure distincte.

## Objectifs provisoires à confirmer

| Sujet | Base de travail, non activée et sans engagement |
| --- | --- |
| Fréquence/RPO | Proposition initiale : point quotidien, plus avant chaque changement de schéma. La perte maximale dépasse l'intervalle de24h de la durée d'export/copie/vérification, et augmente encore en cas d'échec. Pour viser un RPO≤24h, prévoir plutôt deux passages quotidiens et vérifier que durée+reprise restent dans la marge des12h restantes ; fréquence et objectif restent à confirmer. Le seuil moniteur de24h n'est pas une garantie de RPO. |
| RTO | Proposition de travail :4h pour la recette privée, à mesurer sur une volumétrie représentative avec clés disponibles, reconstruction de cible et vérifications complètes. Aucun engagement de production. La durée du seul fragment de restauration PG fictif ne mesure pas un RTO de service. |
| Rétention | Proposition de dimensionnement :7 points quotidiens et4 hebdomadaires, sans purge activée. À confirmer avec la politique de conservation des données personnelles et les capacités/coûts de la cible choisie ; ce lot ne décide pas la conservation métier. |

Des fenêtres à02:00 et14:00 UTC sont une proposition à valider pour le RPO visé ci-dessus, pas une tâche installée. Exemple de fréquence systemd uniquement :

```ini
[Timer]
OnCalendar=*-*-* 02,14:00:00 UTC
```

Le service associé reste à préparer et autoriser : quiescence des écrivains, export/dump cohérents, chiffrement, copie distante vérifiée, contrôle du reçu, puis décision de reprise. Un simple timer ne fournit pas cette orchestration ; ne pas activer un arrêt automatique d'application hors fenêtre approuvée. Définir aussi le traitement d'une fenêtre manquée et l'observation depuis un autre hôte. Aucun timer/cron n'est activé ici.

Ne pas annoncer ces hypothèses comme SLA, sauvegarde planifiée, copie hors hôte ou intégration fournisseur déjà en service. [Incidents et surveillance](incident-monitoring.md) décrit les observations disponibles et leurs limites.
