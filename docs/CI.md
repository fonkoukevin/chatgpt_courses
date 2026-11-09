# Intégration continue

Le workflow [ci.yml](../.github/workflows/ci.yml) prépare une recette contrôlée avec trois jobs sur `ubuntu-24.04`. Sa validation locale est décrite dans [P19-ci-checks.json](evidence/P19-ci-checks.json). **Aucun run GitHub n’est revendiqué sans exécution distante.** Les autres résultats P19 et le verdict du projet figurent dans [P19.md](evidence/P19.md).

## Contrôles et préconditions

| Job | Travail | Sortie nécessaire au suivant |
| --- | --- | --- |
| `web` | `npm ci`, tests de sécurité des scripts CI et des rapports fournisseur, contrat/client généré, tests client, sources pédagogiques, contraste P19, helpers de configuration Stripe avec fixtures, lint, types application/navigateur, build web | Archive du build `.next` et empreinte SHA-256 |
| `api` | Maven Wrapper via `npm run verify:api`, PostgreSQL et transports locaux de test, migrations, concurrence, permissions et états métier | Archive du JAR issu du même `verify` et empreinte SHA-256 |
| `e2e` | Attend les deux jobs, restaure les builds, installe Chromium verrouillé et ses bibliothèques Linux, exécute la chaîne HTTP réelle, les quatre parcours `verify:release`, puis `verify:production-config` | Résumés filtrés et captures de l’application avec données synthétiques |

Le runner passe explicitement `P19` à `verify:content` et `verify:contrast` pour produire les preuves de ce lot. La commande pédagogique sans argument conserve son défaut P18 ; la CI ne doit pas réécrire ce reçu historique.

`web` et `api` sont indépendants. Le troisième job ne reconstruit aucun build et ne commence qu’après leur succès. Les contrôles du proxy HTTP, du navigateur et de la configuration production sont séquentiels ; chacun utilise des processus et une base PostgreSQL tmpfs identifiés par le harness. Les volumes et comptes locaux du développeur ne sont pas utilisés. Docker doit être disponible sur le runner.

Node **24.22.2**, npm **11.19.1**, Temurin **21.0.13+9** et le lockfile sont imposés. L’absence d’une classe `*Test.java` dans les résultats Maven, une suite vide, un test ignoré ou en erreur font échouer le contrôle. Le nombre global n’est pas figé artificiellement. Pour le navigateur, les quatre IDs `P19-01` à `P19-04` doivent chacun avoir exactement un essai réussi, sans skip, flaky ni retry. Le code de sortie seul ne suffit pas. Aucun `continue-on-error` ne transforme un échec en succès.

La recette P19 comprend recherche/vide/panne réelle, acquisition contrôlée et historique FR/EN, conservation du projet et de la méthode, compte/aide/attestation/propriété/permissions. Elle réutilise les invariants éprouvés des lots précédents ; elle ne remplace pas toutes les preuves T01–T20 par quatre tests. `verify:release-stripe` (`P19_EXTERNAL`) reste une recette distincte, autorisée avec les accès TEST réels nécessaires, **absente de la CI**. Ni carte réelle, ni clé externe, ni événement `trigger` sans achat n’est nécessaire aux jobs contrôlés.

La sonde production utilise le même JAR et le même build web avec une origine HTTPS synthétique, cookies sécurisés, fournisseurs désactivés et base vide. Elle vérifie les pages FR/EN, le proxy, les routes de démonstration fermées, l’authentification et l’absence de données métier. Ce contrôle ne prouve ni un déploiement, ni TLS sur un hébergement, ni l’activation commerciale.

## Builds et artefacts

Le transfert `.ci-build.gz` utilise un conteneur gzip documenté par [ci-build.mjs](../scripts/ci-build.mjs) : signature de format, longueur du manifeste JSON, manifeste puis octets des fichiers dans l’ordre déclaré. Il ne lance ni extraction tar ni hook. Le manifeste porte le commit, les versions requises, le `BUILD_ID` éventuel, les tailles et les SHA-256. L’empreinte complète de l’archive est transmise par un output du job producteur ; les métadonnées adjacentes ne servent pas seules d’autorité.

Le JAR est le seul fichier API autorisé. Pour Next, seuls `server`, `static`, `build` et la liste explicite des manifestes nécessaires sont embarqués ; cache, dev, diagnostics, types, traces et fichiers `.env` sont exclus. Les liens symboliques sont refusés. À la restauration, identité du commit, empreinte de l’archive, chemins, tailles et empreintes de **tous** les fichiers sont contrôlés avant écriture. Une destination de build existante est refusée pour préserver un environnement déjà actif. Les deux artefacts sont nommés avec le même `run_id` et `run_attempt`, téléchargés depuis ce workflow et soumis au contrôle de digest de l’action.

Les archives de build nécessaires à la recette et les rapports ont une rétention de **trois jours**. Aucun upload global de `.runtime`, `docs/evidence` ou du dépôt n’existe. Les rapports publiables sont exclusivement construits dans `.runtime/ci-public/{web,api,e2e}` puis vérifiés par [ci-report.mjs](../scripts/ci-report.mjs).

Les logs de commande restent dans `.runtime/ci-private` et ne sont pas uploadés. [ci-sanitize.mjs](../scripts/ci-sanitize.mjs) conserve uniquement compteurs, noms de tests Java conformes, IDs fixes des parcours, états et durées bornées. Propriétés JUnit, XML Surefire brut, erreurs libres, sorties console, stack traces, snippets, corps HTTP, cookies, traces Playwright et secrets sont omis. Les états d’échec, essais multiples et ignorés restent visibles. Un filtre qui refuse une preuve fait échouer le contrôle ; il ne la remplace pas par un faux succès.

Seules les huit captures synthétiques annoncées par la fixture P19 sont autorisées. `capture-manifest.json` doit attester l’origine loopback de l’application, `syntheticApp:true`, `provider:false`, le scénario, les dimensions et le SHA-256 des octets réellement produits. Tout autre chemin, image de fournisseur, hash ou dimensions discordants sont refusés. Les images ne sont ni modifiées ni supposées anonymes à partir de leur nom : cette liste fermée complète le garde d’origine du helper de capture. Aucune page de connexion hébergée, carte de paiement ou capture historique du dépôt n’est publiée.

Le runner transmet à ses enfants une liste limitée de variables système et une configuration synthétique. Les clés fournisseurs, secrets GitHub, variables `NEXT_PUBLIC_*` héritées et options Node arbitraires n’y entrent pas. `APP_ENV` est fixé avant l’appel aux scripts ; aucune configuration privée `.env.local` n’est chargée. Les clés temporaires nécessaires aux services locaux sont générées en mémoire, jamais copiées dans les rapports. Le checkout ne conserve aucun credential Git.

## Validation locale et limites

Depuis PowerShell avec le binaire Node 24.22.2 portable indiqué dans le README :

```powershell
.\.tools\node-v24.22.2-win-x64\node.exe --test tests/scripts/ci-safety.test.mjs
.\.tools\node-v24.22.2-win-x64\node.exe scripts/ci-run.mjs web scripts
.\.tools\node-v24.22.2-win-x64\node.exe scripts/ci-report.mjs web
```

Les tests injectent des chaînes privées **fictives** dans les rapports, des archives altérées, traversées de chemins, liens et fichiers interdits. Ils vérifient le refus avant écriture et la conservation des échecs. Ils ne contactent aucun fournisseur et n’imitent pas PostgreSQL. Pour rejouer `verify:api` ou les harness complets, respecter la propriété des processus et le gel des builds décrits dans le README ; ne pas restaurer une archive dans le build actif du développeur.

Le YAML a été chargé avec `js-yaml` installé par le lockfile et contrôlé avec **actionlint 1.7.12** officiel, archive Windows amd64 vérifiée par SHA-256 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`. Commande locale :

```powershell
.\.tools\actionlint-1.7.12\actionlint.exe -shellcheck= -pyflakes= .github/workflows/ci.yml
```

Ce contrôle valide la structure, expressions, jobs, runners et entrées d’actions. ShellCheck et Pyflakes ne sont pas installés dans cette recette locale et sont explicitement désactivés ; aucune exécution de shell Linux ou des actions GitHub n’est déduite de ce résultat. Le téléchargement initial a échoué en HTTP 504 ; le second téléchargement officiel a été vérifié avant utilisation. Les versions exactes des actions nécessitent un runner compatible Node 24 ; le workflow vise GitHub.com et ses runners hébergés, pas GHES.

## Sources officielles vérifiées

Les cinq tags ont été résolus sur leurs dépôts officiels par `git ls-remote`; le workflow utilise les commits complets, pas les tags mobiles.

| Action | Version | Commit |
| --- | --- | --- |
| [checkout](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1) | 7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| [setup-node](https://github.com/actions/setup-node/tree/949feb2413d6458794dcd2491c4babbbce0c15c1) | 7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| [setup-java](https://github.com/actions/setup-java/tree/77dd5b2ce225ea11469928ac317850245a74ae78) | 6.2.0 | `77dd5b2ce225ea11469928ac317850245a74ae78` |
| [upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | 7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| [download-artifact](https://github.com/actions/download-artifact/releases/tag/v8.0.2) | 8.0.2 | `9000827ccba6bdab643e8b6fd33ac0654aef8333` |

Références complémentaires : [sécurité GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use), [artefacts upload](https://github.com/actions/upload-artifact), [validation du digest au téléchargement](https://github.com/actions/download-artifact), [installation Playwright en CI](https://playwright.dev/docs/ci), [release actionlint](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) et [checksums officiels](https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_checksums.txt).
