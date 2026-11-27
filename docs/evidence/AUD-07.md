# AUD-07 — Recette publique, SEO par environnement et mesure

État au **26 novembre 2026** : **validé localement pour le périmètre technique audité**. Le passage final réussit 12/12 scénarios publics, la régression SEO 4/4, les scripts 205/205, le build, le lint et le typage navigateur. Quarante-deux captures des séries finales sont examinées. **Le lancement commercial reste à préparer** : revue pédagogique humaine, auteur, format vendu, langues et conditions commerciales ne sont pas validés par ces contrôles. Aucun déploiement ni paiement externe n’est effectué. [Résumé vérifiable](AUD-07-checks.json).

## Résultat et correction

Le sitemap pouvait inclure la présentation anglaise d’une offre dont les langues achetées se limitaient à FR, alors que les métadonnées de sa fiche appliquaient déjà `noindex`. Le défaut est reproduit avec le code initial : quatre tests SEO réussissent et deux échouent. Le correctif de [sitemap.xml/route.ts](../../apps/web/src/app/sitemap.xml/route.ts) relit le détail public de chaque offre candidate, exige la même révision que la liste et sa langue incluse avant d’ajouter l’URL. Une lecture impossible ou une révision changée produit503 `no-store`, conformément à la politique de sitemap complet. La présentation reste consultable ; aucun droit ni contrat de commande n’est modifié. Les six tests ciblés passent après correction. [Avant/après et limites](AUD-07-seo-checks.json).

Les seules autres modifications exécutables raccordent AUD07 au superviseur, à la préparation des preuves, au typage et aux scripts CI/contraste. La nouvelle commande `scripts/courses.cmd run verify:public-audit` exécute [aud07-public.spec.ts](../../tests/browser/aud07-public.spec.ts) après les builds, avec services jetables et commerce/workers désactivés. Aucun changement backend, DDL ou dépendance n’est introduit.

## Vérifications effectivement réalisées

| Contrôle | Résultat | Preuve et portée |
| --- | --- | --- |
| Recette publique isolée | **12/12**, zéro échec, saut, flaky ou retry | [Session finale](AUD07-browser/2026-11-26T21-19-19-690Z-c17fd79d-db25-4598-8262-8c4066086671/session.json), [parcours et mesures](AUD07-browser/2026-11-26T21-19-19-690Z-c17fd79d-db25-4598-8262-8c4066086671/aud07-public-checks.json). Spring/PostgreSQL18.6/S3/Mailpit jetables, même build final `UMEgrBuTpF_oiTaRddh2q`. |
| SEO en configurations production et staging | **4/4**, aucun saut/retry | [Contrôles HTTP/HTML](P16_SEO-browser/2026-11-26T21-10-39-341Z-a20020e2-bc2d-4ea2-b5cd-f0626cae2745/seo-checks.json). Même build sur boucle locale, origine synthétique `https://courses.invalid`, API/PostgreSQL isolés. |
| Scripts CI locaux | **205/205** | Six nouveaux cas SEO inclus ; autres garde-fous conservés. Reçu privé et empreinte dans [AUD-07-checks.json](AUD-07-checks.json). |
| Build, lint, typage navigateur | **Réussis** | Vrais runners du dépôt avec Node24.22.2, environnement filtré sans chargement de `.env.local`, fichier Next utilisateur restauré à l’identique après build. |
| Contrastes | **21/21 combinaisons** | [Mesures](AUD-07-contrast.json) des couples opaques de tokens utilisés : textes, états et contrôles. Ne constitue pas une inspection exhaustive de tous les états de chaque page. |
| Staging public déployé | **8/8 contextes**, huit captures finales | [Observation](AUD07-browser/staging-readonly-f34b37a8-37f2-4e8b-b7e2-7f465194967d/observations.json), [SEO, frontières et revue](AUD07-browser/staging-readonly-f34b37a8-37f2-4e8b-b7e2-7f465194967d/policy-and-review.json). Lectures anonymes GET/HEAD, aucune mutation transmise. Cette version distante précède les correctifs locaux AUD-06/AUD-07. |
| Nettoyage et préservation | **Confirmés** | Quatre sessions isolées nettoyées, processus et conteneurs possédés absents, ports3147/8347/3111/3112 sans écoute.127 preuves historiques et fichier Next utilisateur identiques. [Bilan](AUD-07-checks.json). |

Les suites API et client historiques ne sont pas relancées globalement : le backend et les contrats restent identiques. Leur ancien résultat n’est pas présenté comme une nouvelle exécution AUD-07.

## Parcours publics et rendu

La recette utilise **Chromium158.0.8127.18 headless sous Windows**, avec de vrais viewports CSS de **320×844,390×844,768×1000 et1440×1000**, dans les deux langues. Il s’agit de viewports de navigateur, sans observation d’un téléphone matériel. Le zoom navigateur reste à100%.

Les huit trajets vérifient accueil → recherche catalogue → filtre de parcours → fiche et FAQ → essai M01 épinglé. Ils exercent le lien d’évitement, le menu mobile et ses retours de focus, Tab/Shift+Tab/Escape, les filtres et leur soumission clavier, les accordéons FAQ et détails de version, les langues et les quatre ancres de l’atelier. Un menu refermé rend le focus à son déclencheur. Titres, descriptions et langue HTML sont lus dans le vrai document. Les pages d’accueil et de parcours contrôlées ne présentent aucun intitulé de fixture technique comme produit commercial ; le dossier fictif BR01 et l’aperçu local restent explicitement signalés.

Les deux essais complets téléchargent réellement BR01/TR01 et le tableau de cadrage dans les deux langues. Les **quatre supports reçus sont identiques octet par octet aux fichiers préparés**, avec noms, SHA256 et décodage UTF-8 vérifiés. La rédaction commence vide, reste présente entre les quatre moments, est réellement copiée puis exportée dans **deux fichiers Markdown** comparés au contenu saisi et à la source. Seules les fins de ligne CRLF Windows sont normalisées pour la comparaison du presse-papiers. Le contenu saisi n’est pas retrouvé dans les stockages navigateur. Une erreur de quiz dirige le focus vers la première réponse ; le POST formatif réel reçoit les explications sans créer de tentative durable. Les compteurs commandes/Checkout/droits et tentatives durables restent identiques dans PostgreSQL jetable.

Les formulaires FR/EN sont vérifiés à320px : email vide/invalide, mot de passe trop court, erreur décrite, focus visible et absence de soumission d’inscription/connexion invalide. Deux tests distincts augmentent la **taille de police racine à200% à390px**, avec reflow, filtres et clavier. Cette technique ne constitue pas un test de zoom natif du navigateur.

Les32 captures locales finales sont ouvertes :12 par l’agent principal (320/1440),10 par la revue navigateur (390, menus/filtres ouverts) et10 par la revue mesure (768, formulaires et reflow). Les deux captures SEO sont examinées par l’agent principal et les huit captures distantes par la revue SEO. Aucun défaut visuel bloquant ni débordement horizontal n’est observé dans ces séries. Les pages320 et formulaires/reflow sont capturées entièrement ; les autres vues publiques cadrent le haut. Les interactions testées et ces images ne valent pas certification générale d’accessibilité. [Inventaire et empreintes](AUD-07-visual-review.json).

## SEO par environnement

Le staging réellement observé conserve `X-Robots-Tag: noindex, nofollow, noarchive`, les métadonnées `noindex, nofollow`, `robots.txt` interdisant l’exploration et un sitemap sans URL. Ses canonical désignent son propre domaine. Les huit lectures HTTP de politique SEO réussissent. Cette observation ne démontre pas une désindexation dans Google : le moteur doit pouvoir récupérer une URL pour y lire sa directive `noindex`. La politique staging n’est pas modifiée. [Règle officielle](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

Les configurations production synthétiques vérifient l’origine absolue `courses.invalid`, les langues activées seulement, les canonical sans domaine staging, le HTML serveur et les variantes réciproques avec auto-inclusion. La méthode reste **hreflang dans le HTML** ; aucun système concurrent n’est ajouté. Les tests couvrent aussi une seule langue lancée, une traduction absente, la fraîcheur des slugs et du sitemap, les vraies404, le refus d’indexation des pages privées et filtres, le garde staging et une panne API donnant503. Le futur domaine de production n’est pas déployé ou observé. [Méthode et variantes officielles](https://developers.google.com/search/docs/specialty/international/localized-versions), [preuve isolée](P16_SEO-browser/2026-11-26T21-10-39-341Z-a20020e2-bc2d-4ea2-b5cd-f0626cae2745/seo-checks.json).

## Vitesse et stabilité mesurées

Les32 instantanés représentent un échantillon par page/langue/viewport : cache navigateur désactivé et vidé, service worker contourné, CPU sans ralentissement, HTTP en boucle locale sans limitation réseau. Les serveurs sont déjà démarrés et réchauffés par les fixtures/parcours précédents. Les durées de préparation et les compteurs réseau cumulés ne sont pas assimilés à la durée de chaque document. [Protocole, machine et valeurs exactes](AUD-07-performance.json).

| Page —8 configurations chacune | État prêt observé | LCP à l’état prêt | Décalage de mise en page à cet instant |
| --- | --- | --- | --- |
| Accueil | 719–864ms | 652–820ms | 0 |
| Catalogue | 311–600ms | 156–464ms | 0 |
| Fiche | 363–600ms | 212–452ms | 0–0,001147 |
| Essai M01 | 606–672ms | 348–428ms | 0,012582–0,027523 |

Aucune ressource externe n’est comptée dans ces32 documents. Ces instantanés de laboratoire ne sont ni des Core Web Vitals utilisateurs, ni des percentiles de fréquentation, ni une mesure INP. Aucun score ni gain avant/après n’est annoncé.

## Mesure et décision de lancement

[MEASUREMENT.md](../MEASUREMENT.md) inventorie les faits Spring/E16 existants et spécifie les huit étapes demandées, avec déclencheurs, producteurs, déduplication et données autorisées. Aucun outil analytics n’est décidé ou ajouté. Visite/début/fin d’essai et retour ne sont pas déjà collectés ; la fin d’essai anonyme nécessite encore un geste produit défini. Paiement confirmé provient exclusivement du rapprochement serveur ; `checkout=success` ne suffit pas. L’état READY actuel ne remplace pas un événement d’activation horodaté. Les textes, réponses libres, mots de passe, cookies, URLs signées et données fournisseur sont exclus de cette spécification.

| Critère avant acquisition | Verdict | Conséquence et preuve |
| --- | --- | --- |
| Parcours public, essai et supports cohérents techniquement | **Prêt localement pour le périmètre vérifié** | 12/12, six téléchargements réels et textes identiques ; ne prouve pas l’utilité observée chez des apprenants. |
| Formation terminée et contenu revu | **Non vérifié humainement** | [Préparation](../../content/course-client-proposal/EDITORIAL_PREPARATION.md), [alignement](../../content/course-client-proposal/ALIGNMENT_MATRIX.md). Aucun tournage, durée apprenant ou revue humaine inventés. |
| Données de recette et offre destinée aux prospects | **Prêt sur les sélections inspectées** | Aucun intitulé technique promu ; le cas pédagogique fictif reste explicite. Les URL de recette directes ne constituent pas une offre commerciale. |
| Auteur, format vendu, prix, accès, langues, aide et conditions | **À établir avant vente** | [Informations publiques en brouillon](../../content/course-client-proposal/PUBLIC_INFORMATION_DRAFT.md), [offre inactive](../../content/course-client-proposal/v1/offer-editorial-draft.json), [décisions](../DECISIONS.md). |
| FR/EN, dimensions et clavier | **Prêt localement pour les scénarios testés** | AUD-06 et AUD-07 validés localement ; correctifs non déployés. Zoom natif, autres navigateurs et technologies d’assistance restent non vérifiés ici. |
| Indexation adaptée à l’environnement | **Prêt localement ; staging observé** | Correctif sitemap et 4/4 isolés ; production réelle et index des moteurs non vérifiés. |
| Paiement TEST et accès | **Preuves séparées, réserves maintenues** | [P19](P19.md), [P21 TEST](P21-native-payments-observed.json). Refus P12/P15 et limites P19 restent ouverts ; aucun scénario financier rejoué par AUD-07. |
| Entonnoir et performance terrain | **Spécifié / non mesuré sur utilisateurs** | Huit événements spécifiés ; aucune collecte nouvelle ni taux de conversion disponible. |

La décision est **lancement commercial à préparer**, avec fermeture P22/LIVE maintenue. La suite est de finaliser les décisions éditoriales/commerciales et la revue humaine, puis de préparer une livraison explicitement autorisée des correctifs locaux sur la recette. Ce rapport n’autorise aucune publication automatique.

## Échecs conservés et limites de preuve

Le premier passage isolé échoue avant capture métier : le contrôle de texte du nœud `head title` ne lit pas le titre non rendu. Le test utilise désormais `page.title()`/`toHaveTitle`, avec les mêmes attentes de titre. Résultat conservé :0 réussi,1 échoué,11 non exécutés. Le deuxième passage réussit10 cas puis échoue sur un sélecteur `getByLabel(..., exact:true)` du mot de passe requis. Le champ conserve son vrai libellé ; le test cible son nom stable et contrôle son nom accessible. Résultat :10 réussis,1 échoué,1 non exécuté. Ces corrections ne changent aucun composant produit ; le passage final12/12 ne remplace pas ces échecs et aucun retry automatique n’est activé. Captures d’échec et nettoyages sont conservés dans leurs dossiers et [résumés](AUD-07-checks.json).

Le collecteur privé du premier passage voyait aussi les dossiers d’observation staging créés en parallèle et n’associait pas automatiquement le dossier isolé. Son reçu original reste intact ; l’association est rétablie avec l’identifiant exact du superviseur et ses rapports, puis les quatre nettoyages sont revérifiés. Les deux premières observations distantes restent diagnostiques : [mauvais chemin initial du navigateur](AUD07-browser/staging-readonly-b588d0fa-fb6b-4508-b8b8-da405b0afdf1/diagnostic.json), puis [attente insuffisante entre accueil et fiche partageant le même h1](AUD07-browser/staging-readonly-09ba48a9-c670-4069-8632-4195352440fc/diagnostic.json). Le passage retenu attend l’URL et le canonical exacts ; aucune erreur réseau distante n’est attribuée à ces deux erreurs d’automatisation.

Les preuves P18/P19/AUD-01 à AUD-06 sont conservées à l’identique. Aucune empreinte des tables SQL partagées n’est calculée dans ce lot : aucune mutation partagée n’est demandée, les écritures de fixtures/quiz se limitent aux instances possédées jetables. Les refus historiques d’accès et les décisions commerciales ne sont pas clos par une recette publique.
