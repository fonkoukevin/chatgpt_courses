# AUD-01 — publications éditoriales et données de recette

Mandat du15novembre2026, clôture le **22 novembre 2026** (Europe/Paris) : traiter uniquement AUD-01 de `docs/audits/Audit_et_plan_Codex_ChatGPT_Courses_2026-11-15.txt`. **Validé localement**. Aucune purge, aucun push ni déploiement effectué. Le staging demeure sur `7572fcf`, schéma20 ; la base locale partagée demeure au schéma19. V021 est appliquée uniquement dans les bases de vérification isolées.

## Constats vérifiés

[Inventaire des sources, relations et preuves](AUD-01-inventory.json), obtenu par GET publics et transactions PostgreSQL `REPEATABLE READ READ ONLY`.

- Staging :35 identités, dont33 publiées, reliées par UUID exact aux checkpoints de création P21. Le catalogue expose22 cartes FR et14 EN, dont6 gratuites dans chaque langue ; les modules n’y sont pas des cartes. Quatre offres TEST sont conservées avec leurs inclusions et leurs liens historiques.
- Les54 traductions publiées n’ont aucune ligne dans `editorial_public_metadata`. Les tâches et niveaux vides proviennent donc de métadonnées absentes, sans défaut d’association démontré. Aucun GUIDE ni METHOD_TEMPLATE n’existe sur cette cible.
- Le local partagé contient le vrai travail P18 :14 identités importées,28 traductions DRAFT et18 fichiers READY. Il n’est pas publié et ne se trouve pas dans la base staging. Les sources éditoriales existantes ne sont pas remplacées par de nouveaux exemples.
- Les accès directs observés FR/EN restent distincts de la découverte : document public présent pour FREE et absent pour PROTECTED. L’absence d’une carte ne constitue pas une règle d’autorisation.

## Correction locale

La publication pédagogique et la sélection de vitrine sont séparées. V021 ajoute deux historiques append-only, `editorial_public_selections` et `offer_public_selections`, sans modification des lignes existantes. Une décision vise une révision exacte, avec provenance, approbation, acteur, motif et date. Absence de décision : non revu et invisible ; seule la provenance EDITORIAL approuvée alimente la vitrine. Aucun rapprochement de titre ni approbation automatique des anciens objets n’est utilisé.

Le serveur applique la règle aux résultats, facettes, suggestions, publications de découverte et offres ordinaires. Les dépendances du parcours et les inclusions/langues d’une offre doivent également rester sélectionnées. Une nouvelle révision ne reprend pas l’approbation précédente. Les opérations d’administration dédiées réutilisent les permissions de publication/activation, CSRF, contexte de compte, ETag et verrous ; les décisions sont accessibles par API, sans refonte de l’éditeur.

Les lectures directes de recette conservent leurs règles existantes de publication et d’accès. Le calcul des droits, la préparation des commandes, leurs snapshots et l’accès aux versions achetées ne dépendent pas de cette sélection. Les URL et routes existantes sont conservées.

L’accueil sans publication approuvée affiche un état de préparation FR/EN, sans faux cours ni CTA vers un essai absent. Les tâches vides, rubriques Méthodes/Guides/Offres sans résultat et filtres sans choix utile ne sont pas mis en avant. Un filtre déjà actif et la langue de contenu restent conservés. Si seule une autre langue de contenu est disponible, son sélecteur reste accessible : depuis l’interface EN, choisir les contenus FR conserve l’interface EN. Ce cas limite a été reproduit puis corrigé lors de la reprise. Le cas zéro résultat filtré et une panne restent distincts de cet état de préparation.

Les recettes de découverte modélisent désormais explicitement une sélection éditoriale dans leur seule base PostgreSQL éphémère. Le helper vérifie environnement test, origine de boucle locale, label d’appartenance de la base et compte courant avant l’approbation. La publication seule reste disponible sans approbation pour vérifier les cas RECIPE/non revus. Aucun helper n’approuve les35 objets présents sur staging.

## Vérifications

Les [résultats de clôture](AUD-01-closure-checks.json) distinguent les validations du15novembre et les contrôles exécutés à la reprise. Les empreintes des onze sources de la preuve API correspondent au code actuel ; les61 cas acquis ne sont pas présentés comme une nouvelle suite globale exécutée le22novembre.

| Vérification | Résultat et preuve |
| --- | --- |
| PostgreSQL/HTTP ciblés | **61 cas distincts, huit suites**, derniers résultats consolidés verts ; permissions, CSRF, contexte de compte, ETag, concurrence, langues, descendants, offres, accès directs et commandes conservées. [Détail](AUD-01-api-checks.json). |
| Migration V020→V021 | **84 tables antérieures et leurs triggers préservés**, deux historiques nouveaux vides, sans backfill ; test PostgreSQL réel. [Détail API](AUD-01-api-checks.json). |
| Chromium AUD01 | Nouvelle exécution du22novembre **4/4**, sans retry ni cas ignoré, nettoyage confirmé. États vides, sélection simulée, recettes/direct FREE/PROTECTED, choix de FR depuis EN à1440/390px. [Session](AUD01-browser/2026-11-22T00-01-15-008Z-19a31db5-745f-4c55-84ca-9421e359a714/session.json), [rapport](AUD01-browser/2026-11-22T00-01-15-008Z-19a31db5-745f-4c55-84ca-9421e359a714/results.json). |
| Régression catalogue P06 | **6/6** le15novembre, sans retry ni cas ignoré, nettoyage confirmé. [Session](P06-browser/2026-11-15T23-13-21-755Z-ac9e7539-8ff2-451f-9253-63f03709b06b/session.json). |
| Rendu des vrais composants | **8/8** le22novembre ; le nouveau cas de langue unique échouait avant correction. Commande : `.tools/node-v24.22.2-win-x64/node.exe --test --test-reporter=tap tests/scripts/aud01-public-ui.test.mjs`. |
| Contrat, types et lint | `scripts/courses.cmd run api:check`, `run typecheck`, `run typecheck:browser`, `run lint` passent sous Node24.22.2/npm11.19.1 ;17 fichiers générés identiques. Types navigateur et lint vérifiés après le dernier correctif. |
| Build web | Build du22novembre réussi en environnement isolé, sans secrets fournisseur. Fichier Next utilisateur restauré à son empreinte initiale. |
| Configuration production locale | **12/12** le15novembre,21 migrations, base vide isolée et processus arrêtés ; HTTPS public synthétique, aucun TLS distant ni déploiement revendiqué. [Preuve historique de ce lot](AUD-01-production-config-checks.json). |
| Préservation des bases existantes | Transactions `REPEATABLE READ READ ONLY` du22novembre : **83 tables locales** hors sessions et **22 tables suivies sur staging** identiques aux baselines du15novembre. Nouveau contrôle local après Chromium également réussi. [Empreintes et limites](AUD-01-closure-checks.json). |

Les résultats client125/125, composition locale des scripts CI149/149 (dont les sept rendus UI initiaux) et20 tests de contrat de release sont acquis le15novembre. La nouvelle suite UI comporte huit cas ; aucune exécution GitHub CI ou suite financière globale n’a été effectuée à la reprise. La candidate locale exige le schéma21 ; les anciens manifestes et preuves restent inchangés.

La [revue visuelle initiale](AUD-01-visual-review.json) porte sur six captures et douze observations FR/EN à320/390/1440px, avec clavier, menu et absence de débordement contrôlés. À la reprise, les captures d’accueil vide/mobile et de vitrine simulée/ordinateur ont été réexaminées ; le nouveau [panneau de choix de langue à390px](AUD01-browser/2026-11-22T00-01-15-008Z-19a31db5-745f-4c55-84ca-9421e359a714/aud01-single-language-en-390.png) a été inspecté : libellés lisibles, choix FR et bouton d’application visibles, sans débordement. Il s’agit de viewports Chromium locaux ; aucun téléphone physique, certification d’accessibilité ou score de performance n’est revendiqué.

## Échecs conservés et limites

- API : première compilation refusée pour une déclaration `var` multiple ; deuxième tentative avec ancien compteur de migrations et fixtures sans EUR. Corrections puis17/17 ciblés ; les autres cas réussis restent acquis, sans effacement des échecs. [Chronologie](AUD-01-api-checks.json).
- Premier P06 :1 réussi,1 échec,4 ignorés ; la fiche de cours n’affichait pas le message d’offre indisponible attendu. Correction du rendu et nouvelle recette complète6/6. [Session échouée conservée](P06-browser/2026-11-15T23-07-01-805Z-39c78ef2-4a71-4513-93be-0b4b64475607/session.json).
- Reprise : le comparateur distant a d’abord refusé le Node global24.14.0 avant transport ; exécution avec le Node portable24.22.2 réussie. Les premiers lint/types/contrat ont également été remplacés par des contrôles sous les outils verrouillés.
- Les ressources « éditoriales » des scénarios restent des simulations dans leur base éphémère. Aucun contenu réel P18 ou objet P21 n’est approuvé, aucun droit n’est attribué, aucune offre réelle n’est créée.
- Les anciennes limites P12/P15/P19, décisions commerciales, revue humaine des contenus et préconditions de P22 restent ouvertes. La vitrine staging existante n’a pas reçu ce correctif local.

## Ce qui reste nécessaire pour AUD-02

Repartir de `content/course-client-proposal/` et de `docs/CONTENT_REFERENCE.md` : rapprocher les consignes et les pièces réellement livrées, notamment la grille des cinq tarifs et le support synthétique observé ; vérifier le dossier complet et ses fichiers FR/EN. Conserver les brouillons P18 et leurs versions.

La revue du propriétaire, la cible définitive, l’auteur et les informations commerciales réelles restent à établir avant approbation/publication. Les langues, médias, durée et éventuel accompagnement doivent correspondre à ce qui est réellement fourni ; aucune vidéo, correction humaine, durée ou condition commerciale n’est inventée. AUD-02 à AUD-07 et P22 ne sont pas commencés par ce lot.
