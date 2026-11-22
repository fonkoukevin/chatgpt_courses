# Recette — accès direct sans fenêtre HTTP Basic

Le15novembre2026, l’utilisateur demande explicitement de retirer la fenêtre navigateur d’authentification HTTP Basic sur `staging.chatgpt-courses.com`. P22 reste en attente. La connexion aux comptes et les permissions applicatives restent indépendantes.

## Préparation vérifiée

Le paramètre serveur `STAGING_BASIC_AUTH_ENABLED=false` est limité à staging ; une absence conserve le défaut strict historique. L’overlay public ne monte aucun secret Basic ; proxy, entrypoint et healthcheck appliquent le même contrat. Les valeurs inconnues et `false` hors staging sont refusés. Les sessions Spring, CSRF, propriété, permissions, HTTPS, noindex et no-store restent inchangés.

Le déploiement et son smoke déclarent le même mode. Le mode public vérifie les pages FR/EN200 sans challenge, les assets, le cookie de session sécurisé, les API privées/admin401 et les refus CSRF. Les anciens bundles restent compatibles avec leur configuration Basic d’origine ; l’overlay public n’est pas demandé à une ancienne source qui ne le possède pas.

Vérifications locales : **124/124 tests** deployment/CI safety/accès public, aucun skip ; lint ciblé et TypeScript sans émission réussis. Relecture indépendante favorable. Aucun contrôle n’a été désactivé pour obtenir ces résultats. Le fichier Next utilisateur est exclu de la modification et du commit. Les autres constats UX/CMS restent hors de ce lot ciblé.

## Mise en service

**Retrait réellement observé le15novembre2026 à21:52 UTC** sur `https://staging.chatgpt-courses.com`. La source active est `7572fcf51fe51749d7eec9b9ec62f293998091d0`, manifeste `ad2aa976378ed3349743de05b15ef26a2a326884ef3a0608aeb319e35bc39ab4`. [Preuve complète filtrée](P21-staging-direct-access-observed.json), [manifeste](P21-release-manifest-43764310209.json).

- PR12 intégrée avec les protections habituelles. [CI main43763492075](P21-ci-43763492075.json) : API271/271 sur41 suites, PostgreSQL réel utilisé, client125/125, scripts144/144, configuration Stripe5/5, navigateur4/4 sans retry ;12 contrôles production isolés,20 migrations. Trois ZIP et huit captures authentifiés ; aucune inspection visuelle de ces captures revendiquée.
- Publication43764310209 réussie ; nouvelles images par digests, garde déclarant explicitement Basic désactivé. [Déploiement43765849214](P21-deployment-43765849214.json) réussi, même source pour contrôleur et images, pointeur actif mis à jour, aucun rebuild ni restauration de données.
- Sauvegarde actuelle après arrêt des écrivains, expiration réelle des liens PUT300s et drainage S3 ;10 objets READY comparés, chiffrement authentifié et14 fichiers chiffrés/métadonnées vérifiés sur PC indépendant. Reçu `7caeba6f0c51177d923c91d3b87711e0915851456704167fbb90a9246afb09ce` ; clé séparée, API/web maintenues arrêtées jusqu’au déploiement.
- Observation native avant/après : cinq services sains,20 migrations ;14 tables de domaine et5 tables financières identiques,24 autres conteneurs conservés. Seuls les changements attendus de version, du garde web et du bind de rôles PostgreSQL sont acceptés ; les octets du script de rôles restent identiques. Les fichiers de configuration et secrets Basic historiques sont conservés, sans montage du secret Basic dans le nouveau web.
- Caddy original restauré dans le même fichier puis rechargé ; gate temporaire retiré, quatre autres sites HTTPS inchangés. Vérification native supplémentaire avant/après cette restauration. Moniteur sur le serveur : HTTP disponible, sauvegarde récente, disque suffisant, aucune alerte ; aucun canal externe sollicité.

Le smoke indépendant utilise **zéro identifiant HTTP Basic** et réussit11 contrôles : FR/EN200 sans challenge,17 scripts et1 CSS accessibles, santé Spring/PostgreSQL, cookie Secure/HttpOnly/SameSite=Lax, profil/admin401, CSRF403, webhook TEST invalide400, route voisine403 et API inconnue404. Non-indexation et no-store restent contrôlés. Les requêtes de refus ne rejouent aucun achat ni remboursement.

## Continuité et limites

Les collecteurs privés anciens ont refusé les compteurs devenus obsolètes ; leurs octets et refus restent conservés. Des collecteurs distincts liés exactement à cette source/run ont ensuite authentifié les vraies preuves. Le premier observateur a aussi refusé un répertoire Compose supposé incorrect : le diagnostic natif a confirmé `/infra/compose`, puis une famille V2 distincte a validé cette réalité, sans modifier le premier intent/programme/refus. Un écart CRLF/LF Windows a été refusé localement avant tout intent de modification ; le validateur exécuté provient finalement des octets Git épinglés.

Aucune mutation ambiguë n’a été rejouée, aucun volume ni ancien verrou supprimé. Les preuves P21 précédentes et le fichier Next utilisateur restent intacts. La revue visuelle distante et la vérification HTTP d’un propriétaire connecté ne sont pas revendiquées par ce lot ciblé ; les autres constats UX/CMS restent hors de son périmètre. Les essais personnels et la revue avant P22 peuvent reprendre. P22, commerce et LIVE restent fermés.
