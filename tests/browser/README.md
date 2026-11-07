# Recette navigateur P01 — préparée, non exécutée

Ce scénario utilise Playwright et un Chromium dédié, sans prendre le contrôle du navigateur personnel. Son exécution attend une autorisation explicite pour cette technologie. La présence de ces fichiers ne constitue pas une preuve de validation navigateur.

Prérequis à préparer seulement après autorisation : ajouter `@playwright/test` **1.65.0** aux dépendances de développement racine, mettre à jour l’unique lockfile, installer son Chromium puis exécuter l’installation verrouillée. Le script ne télécharge aucun navigateur et ne lance aucun `npx` susceptible d’installer un paquet automatiquement.

Script racine préparé : `"verify:browser": "node scripts/verify-browser.mjs"`. Commande Windows après installation autorisée et builds web/API : ` .\scripts\courses.cmd run verify:browser `. Cette commande n’a pas été exécutée. PostgreSQL local doit être démarré et `.env.local` renseigné ; aucune donnée n’est réinitialisée.

Le superviseur réserve les ports **3101 et 8181** par défaut (`BROWSER_WEB_PORT` et `BROWSER_API_PORT` permettent un autre choix), puis démarre le JAR existant et le build Next sur la boucle locale. Il refuse un port occupé et ne réutilise ni n’arrête les services de développement en 3000/8080. Il enregistre ses seuls PID dans `.runtime/browser-<session>/processes.json`. L’arrêt/reprise de Spring passe par un IPC privé authentifié, sans endpoint produit de simulation.

Les sept tests prévus couvrent FR/EN à 1440, 390 et 320 px : navigation clavier, réponse réelle Spring/PostgreSQL, erreur 404 structurée, absence de défilement horizontal et d’exception JavaScript. Le dernier test arrête réellement Spring, vérifie l’indisponibilité dans les deux langues pendant que Next répond toujours, redémarre Spring, puis utilise « Réessayer » pour confirmer la reprise.

Les captures PNG de page, sans barres du navigateur utilisateur, et le rapport JSON vont dans `docs/evidence/P01-browser/<session>/`. Les résultats temporaires et journaux restent dans `.runtime/`. Chaque exécution possède son dossier pour conserver les preuves précédentes. Un code de sortie non nul ou un nettoyage non confirmé reste un échec ; tous les arrêts sont tentés et regroupés dans l’erreur finale. Les images doivent ensuite être examinées : les assertions automatiques ne suffisent pas à déclarer une revue visuelle.

Sources officielles vérifiées le 8 novembre 2026 : [registre exact Playwright 1.65.0](https://registry.npmjs.org/@playwright%2ftest/1.65.0), [installation et exigences](https://playwright.dev/docs/intro), [configuration](https://playwright.dev/docs/test-configuration), [assertions](https://playwright.dev/docs/test-assertions), [clavier](https://playwright.dev/docs/api/class-keyboard), [captures](https://playwright.dev/docs/screenshots). Le package déclare Node ≥20 ; la documentation inclut Node 24 et Windows 11. Aucun de ces outils n’a été installé ni lancé pour préparer ces sources.
