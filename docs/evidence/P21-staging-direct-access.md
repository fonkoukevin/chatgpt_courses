# Recette — accès direct sans fenêtre HTTP Basic

Le15novembre2026, l’utilisateur demande explicitement de retirer la fenêtre navigateur d’authentification HTTP Basic sur `staging.chatgpt-courses.com`. P22 reste en attente. La connexion aux comptes et les permissions applicatives restent indépendantes.

## Préparation vérifiée

Le paramètre serveur `STAGING_BASIC_AUTH_ENABLED=false` est limité à staging ; une absence conserve le défaut strict historique. L’overlay public ne monte aucun secret Basic ; proxy, entrypoint et healthcheck appliquent le même contrat. Les valeurs inconnues et `false` hors staging sont refusés. Les sessions Spring, CSRF, propriété, permissions, HTTPS, noindex et no-store restent inchangés.

Le déploiement et son smoke déclarent le même mode. Le mode public vérifie les pages FR/EN200 sans challenge, les assets, le cookie de session sécurisé, les API privées/admin401 et les refus CSRF. Les anciens bundles restent compatibles avec leur configuration Basic d’origine ; l’overlay public n’est pas demandé à une ancienne source qui ne le possède pas.

Vérifications locales : **124/124 tests** deployment/CI safety/accès public, aucun skip ; lint ciblé et TypeScript sans émission réussis. Relecture indépendante favorable. Aucun contrôle n’a été désactivé pour obtenir ces résultats. Le fichier Next utilisateur est exclu de la modification et du commit. Les autres constats UX/CMS restent hors de ce lot ciblé.

## Mise en service

La nouvelle version doit encore passer la CI protégée, être publiée par digests puis déployée après sauvegarde actuelle et copie PC. Le retrait n’est pas encore observé sur l’URL au moment de cette préparation. Les preuves P21 précédentes restent historiques et intactes.
