# AUD-06 — Cohérence FR/EN et retours de navigation

État au **25 novembre 2026** : corrections locales implémentées, 135 tests client, 199 scripts, lint, build et typage navigateur réussis. Quatre parcours de navigation et quatre rendus d’offre sont vérifiés avec le nouveau frontend local et les lectures réelles de l’API de recette. Vingt captures originales sont examinées. **La recette complète sur Spring/PostgreSQL/S3 isolés reste non exécutée faute de moteur Docker. Le lot garde cette vérification en attente.** [Résumé vérifiable](AUD-06-checks.json).

## Périmètre

Ce lot poursuit les audits après la livraison du22novembre. Il corrige la langue des retours au catalogue et la présentation des variantes linguistiques d’une offre. Aucun déploiement, import éditorial distant, achat, changement de droit ou paiement n’est effectué par ces corrections. Les six modules P18 gratuits sur la recette restent dans le périmètre de l’autorisation antérieure ; leur présence ne constitue pas une autorisation de production ou de commerce LIVE.

Les guides Next.js installés concernant l’internationalisation et les liens sont consultés avant les changements. Les routes localisées et les utilitaires de validation existants sont conservés. Aucun remplacement aveugle de préfixe dans une URL arbitraire n’est ajouté.

## Causes confirmées et corrections

### Retour au catalogue dans la langue précédente

`resourceLanguages` et les deux branches de contexte d’activité conservaient le même `returnTo` lorsqu’ils construisaient le lien de l’autre langue. Le validateur acceptait correctement une destination de catalogue interne FR ou EN, mais ne la reconstruisait pas pour la langue d’arrivée. Ainsi, une activité anglaise pouvait encore porter un retour vers `/fr/catalogue`.

Le nouvel utilitaire `translateCatalogueReturnTo`, dans `apps/web/src/lib/public/query.ts`, valide d’abord le retour avec la politique existante, puis reconstruit uniquement une destination de catalogue connue. Les filtres compatibles sont conservés : recherche, type, tâche, niveau, accès, taille de page et tri. La langue de recherche suit la langue choisie ; la pagination revient à zéro lorsque cette langue change. Une pagination déjà associée à la langue cible reste conservée. Le texte de recherche est une donnée, jamais une nouvelle destination à décoder.

`apps/web/src/components/public/server-pages.tsx` utilise cet utilitaire à l’entrée des fiches, de la découverte d’activité et des activités contextualisées, ainsi que lors de la construction des équivalents. Les identifiants de ressource, de version pédagogique et de version du parcours sont conservés. Les slugs proviennent toujours des variantes publiées et du contexte retourné par Spring. Une traduction de parcours absente conserve une alternative locale ; aucun chemin de leçon n’est inventé.

Les destinations externes, chemins ambigus ou encodés, fragments, contrôles, paramètres inconnus ou dupliqués et filtres invalides sont refusés au profit du catalogue de la langue cible. Le parcours de connexion conserve sa politique propre : changer la langue du formulaire ne transforme pas implicitement l’intention de retour vers une ressource et une version épinglées.

### Disponibilité des présentations d’offre annoncée sans lecture

`CommercePublicShell` annonçait systématiquement FR et EN comme disponibles sur un détail d’offre. La génération des métadonnées lisait déjà la contrepartie, mais le rendu de la page ne recevait pas cette information. Une offre sans présentation anglaise pouvait donc afficher un sélecteur English ordinaire, puis un écran signalant la traduction absente.

Le helper serveur partagé `offerPresentations`, dans `apps/web/src/components/commerce/server-pages.tsx`, lit maintenant les deux projections publiques. Le sélecteur permet de consulter toute présentation réellement disponible d’une offre active, même si sa langue n’est pas incluse dans l’achat ; l’avertissement commercial existant reste alors affiché et aucun droit n’est ajouté. La politique SEO conserve son critère supplémentaire de langue incluse pour les variantes indexables. Les états restent distincts : présentation disponible, absente, vente suspendue ou disponibilité non vérifiée à cause d’une erreur de lecture. Cette séparation évite de présenter une traduction consultable comme manquante ou d’assimiler sa lecture à une langue achetée.

`PublicOfferDetails` transmet ces résultats à `CommercePublicShell` et présente un bloc de langues explicite. Une variante disponible ouvre le même identifiant d’offre ; une variante non proposée ou non vérifiée offre un retour vers la liste de la langue choisie. Une panne de lecture n’est pas présentée comme une absence de traduction. Les listes FR/EN restent des destinations disponibles, indépendamment de la traduction d’une offre particulière.

### Langue des contenus conservés

`OfferTerms` conserve les textes de la langue du snapshot d’une commande, même lorsque l’interface change de langue. Les textes d’accompagnement et de fiscalité reçoivent maintenant leur annotation `lang`, comme les conditions ; les messages d’information manquante gardent la langue de l’interface. Aucun texte de conditions n’est retraduit ou remplacé.

La lecture du code confirme que les notes et réponses personnelles gardent leur texte et leur langue enregistrés. Les résultats de quiz présentent les questions, choix et explications dans la langue de la tentative. Aucun fragment anglais d’interface n’est démontré dans les offres françaises inspectées ; les données éditoriales ou fixtures ne sont pas réécrites pour masquer cette distinction.

## Vérifications réellement exécutées

| Vérification | Résultat observé | Portée |
| --- | --- | --- |
| Client typé et tests de contrat | **135/135**, zéro échec ni saut | Inclut deux nouveaux cas de retour localisé et de refus des destinations dangereuses. |
| Scripts intégrés à la CI locale | **199/199**, zéro échec ni saut | Inclut quatre tests de lecture de routes publiques et sept tests de rendu des langues d’offre, dont la distinction entre présentation EN et contenu inclus FR. |
| Régression ciblée AUD04 | **13/13** | Découverte d’offres par cours/version/langue, filtres et programme conservés. |
| Lint | Réussi | Commande réelle exécutée par le runner du dépôt. |
| Build web | Réussi | Nouveau build local ; aucun déploiement correspondant. |
| Typage des scénarios navigateur et syntaxe des lanceurs | Réussis | Huit cas et treize captures attendues dans la nouvelle suite isolée ; ce nombre préparé ne vaut pas exécution. |
| Fichier Next utilisateur | Préservé | SHA256 `0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc`. |
| Navigateur local avec API/PostgreSQL isolés | **Non exécuté à ce stade** | Moteur Docker local indisponible. |
| Baseline navigateur de la recette distante | **Quatre retours dans la mauvaise langue reproduits** | FR→EN et EN→FR à 1440 et 390 pixels, aucune écriture API ; quatre captures originales examinées. |
| Nouveau frontend local avec API de recette en lecture seule | **Navigation 4/4 et rendus d’offre 4/4** | FR/EN à 1440 et 390 pixels ; aucune écriture API, aucun compte créé, aucun achat ou Checkout. |

La baseline réelle de recette confirme le défaut dans les deux sens : le lien d’activité et celui de retour au cours conservent le `returnTo` de départ, puis le catalogue et son attribut HTML `lang` reviennent dans cette ancienne langue. Les quatre captures avant correction sont ouvertes ; les URL observées, plutôt que les seules images, établissent le défaut.

Le premier build corrigé, `fap3YrGBQrWCwvXCkjH-g`, est ensuite démarré sur un port de boucle locale. Un proxy local transmet exclusivement les GET/HEAD publics autorisés vers l’API réelle de recette, avec TLS vérifié, sans Cookie, Authorization, contexte de compte ou CSRF, et sans retransmettre Set-Cookie. Les sondes POST, lecture d’administration et requête portant un cookie sont effectivement refusées sans transmission. Les demandes de renouvellement CSRF du client anonyme sont également refusées localement ; cette limite est visible dans le reçu.

Les quatre trajets catalogue filtré → cours → M01 → changement de langue → cours → catalogue passent. Langue choisie, identifiants, versions et slugs publiés sont vérifiés ; une pagination initiale non nulle revient à zéro et les autres filtres contrôlés restent présents. Ce passage transmet 250 GET : 234 réponses HTTP 200 et 16 réponses HTTP 401 attendues pour l’identité anonyme ; 16 renouvellements CSRF et trois sondes sont refusés localement. Les douze PNG sont examinées, six par l’agent principal et six par l’agent de revue.

Après le dernier ajustement distinguant présentation et langue incluse, le build final `0pkhJQUlA45ZQB4iqu19j` passe à nouveau. Quatre fiches FR/EN à 1440 et 390 pixels lisent une ancienne offre P21 TEST existante par son lien direct, avec titres issus des réponses API, deux présentations disponibles et mêmes identifiants dans les liens de langue. Les quatre PNG complètes sont ouvertes et examinées. Les 58 GET reçoivent 54 réponses HTTP 200 et quatre réponses HTTP 401 ; quatre renouvellements CSRF et trois sondes restent refusés localement. Aucun lien d’achat ou de connexion n’est activé. Cette lecture ne sélectionne pas cette offre pour la vitrine et ne la transforme pas en offre commerciale.

Le navigateur, chaque serveur web possédé et chaque proxy sont arrêtés après leurs passages. Aucun défaut visuel bloquant ni débordement horizontal n’est observé dans les vingt images retenues. Les vues d’activité cadrent le haut de M01 ; elles ne certifient pas toutes les sections ni le menu mobile ouvert. Les cas d’offre absente ou en erreur restent des tests de rendu avec transport remplacé, sans nouvelle fixture persistée en recette.

Exemples conservés : [retour avant correction FR→EN](AUD06-browser/staging-baseline-6a55d044-359e-4e12-a79e-1c5f44d9cba8/fr-to-en-390-catalogue.png), [retour corrigé EN](AUD06-browser/readonly-local-browser-72aca963-1b3a-4ea7-9618-9a82d25caf68/fr-to-en-390-catalogue-after.png), [présentations d’offre sur le build final](AUD06-browser/readonly-offer-browser-da67cbb5-2569-4c22-817c-0003635d1ebd/en-390-legacy-test-offer.png).

Les reçus privés des vérifications client, scripts, lint et build sont conservés dans `.runtime/aud06/`. Ils indiquent Node 24.22.2, le résultat du vrai runner, l’absence de chargement d’identifiants fournisseur et la préservation du fichier Next utilisateur. Ils ne sont pas des reçus GitHub ni des preuves de déploiement.

Les tests `tests/scripts/aud06-public-navigation.test.mjs` exercent les lectures des pages serveur et leurs liens, avec frontière API remplacée. Les tests `tests/scripts/aud06-offer-languages.test.mjs` rendent les vrais composants React, utilisent les décodeurs publics et vérifient les métadonnées, la traduction manquante, l’erreur de lecture, la présentation anglaise d’une offre incluant seulement FR, les ventes suspendues et les textes français d’un snapshot dans l’interface anglaise. Ces tests ne sont pas présentés comme un parcours de navigateur ni une persistance Spring/PostgreSQL réelle.

Le raccourci `verify:navigation` et la phase `AUD06` du superviseur Playwright sont préparés pour la recette isolée. Leur présence ne prouve pas leur exécution. Les scénarios de paiement externes ne sont pas appelés par cette phase.

## Limites et suite

Le démarrage de Docker Desktop a été refusé par la revue automatique des permissions, avec le motif `blocked by policy`. Le moteur local reste donc indisponible. La suite de huit tests sur Spring/PostgreSQL/S3 jetables est préparée et typée, mais pas exécutée : les deux passages en lecture seule décrits ci-dessus ne sont pas présentés comme cette intégration isolée. Aucune comparaison des tables SQL de recette n’est effectuée dans ce lot ; aucune mutation SQL ou action CRUD distante n’est demandée.

Les premiers essais d’automatisation de la baseline sont conservés : une navigation de langue pouvait être déclenchée avant la confirmation de l’ouverture de l’activité. Le passage retenu attend le titre et l’URL exacts. Le premier passage local a ensuite réussi son trajet, mais s’est arrêté sur quatre refus405 de CSRF provoqués par la frontière stricte du proxy. Quatre réponses503 amont y sont aussi observées et restent sans cause attribuée. L’observateur distingue désormais uniquement le405 attendu de `/auth/csrf` ; le proxy garde son refus. Le passage final de navigation n’observe aucun503. Aucun échec historique n’est remplacé par un succès et aucun retry automatique n’est ajouté.

Les refus historiques P12/P15 et les limites P19 restent ouverts. Ce lot ne réexécute ni ne clôture les scénarios de paiement, d’attribution de droits ou de remboursement. Aucune traduction automatique des productions, certification ou revue pédagogique humaine n’est annoncée. P22 et LIVE restent fermés.

Après la réponse utilisateur « Je démarre Docker Desktop », les contrôles du25novembre ne trouvent toujours aucun moteur Linux joignable, ni sur le contexte `desktop-linux` ni sur `default`. Aucun démarrage automatique, service applicatif ou test PostgreSQL n’est effectué lors de cette reprise. L’état affiché par Docker Desktop est demandé pour poursuivre le diagnostic ; l’annonce du démarrage n’est pas assimilée à un moteur prêt.

La revue préalable renforce aussi une attente du test d’activité autonome : son URL utilise déjà le chemin du catalogue, donc une attente fondée sur ce seul chemin peut se terminer avant la navigation. Le test attend maintenant l’absence du sélecteur `activity` et la langue cible avant de comparer les mêmes filtres stricts. Ce risque est trouvé en revue du code, sans échec PostgreSQL observé. Typage navigateur et syntaxe passent ; aucun code applicatif ni build n’est modifié. Le lanceur privé exige désormais explicitement un moteur Linux.

La reprise du **26 novembre 2026 à 20:47 UTC** confirme que Docker Desktop n’a aucun processus actif et que son service `com.docker.service` est arrêté. WSL liste `docker-desktop` arrêté. Les commandes `docker --context desktop-linux info --format '{{.OSType}}'` et leur équivalent `default` échouent avec le code1 : leurs canaux nommés sont absents. Le contrôle `docker desktop status` ne trouve pas Desktop en cours d’exécution. Le lanceur privé exécuté avec Node24.22.2 s’arrête correctement sur `DOCKER_LINUX_NOT_READY`, avant tout démarrage applicatif et toute création de fixture. Aucun démarrage de Docker par l’agent n’est retenté après le refus automatique historique. Le reçu privé de disponibilité a pour SHA256 `740cff991a4a24357177eab580e129fdb1fd044b08061b1e6be14fc1af485826` ; son résumé est ajouté à [AUD-06-checks.json](AUD-06-checks.json).

Les préconditions indépendantes restent vérifiées : Node24.22.2, build final `0pkhJQUlA45ZQB4iqu19j`, JAR présent, fichier Next utilisateur de même SHA256 et scénario identique au commit de renforcement de l’attente. La revue indépendante du scénario et de ses lanceurs ne trouve pas de défaut bloquant ; elle confirme huit tests et treize captures attendus. Les catalogues de cette suite commencent à `page=0` : elle ne démontrera pas à elle seule la remise à zéro d’une page non nulle, déjà couverte par les tests client et le passage antérieur en lecture seule. Les validations historiques ne sont pas relancées puisque le code n’a pas changé. Aucun nouveau résultat navigateur ou PostgreSQL n’est revendiqué.

Prochaine action : démarrer manuellement Docker Desktop et attendre le moteur Linux prêt, puis exécuter la suite isolée via `scripts/courses.cmd run verify:navigation` dans l’environnement de test isolé prévu, ou le lanceur privé préparé `.runtime/aud06/run-browser.mjs --execute` qui ne charge pas `.env.local`. Examiner ses treize captures et ses preuves de nettoyage avant de clôturer cette réserve. AUD-07 reste la suite après cette validation ; aucune publication automatique n’en découle.
