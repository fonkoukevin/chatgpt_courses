# AUD-03 — accueil, navigation et présentation locale

Lot du22novembre2026 après AUD-02 (`d0601f6`, `c423dbc`). **Validé localement** sur la branche `audit/aud-03-home`. Aucune publication partagée, approbation éditoriale réelle, activation commerciale, opération financière, push ou déploiement effectué.

## Résultat

L’accueil reconnaît un parcours unique par une lecture COURSE complète, puis vérifie le détail exact : identité, version, révision, langue, disponibilité, slug et titre. La projection transmise au client conserve seulement les descriptions publiques et les destinations utiles. Elle n’inclut ni document pédagogique protégé ni programme complet avec identifiants internes.

La composition affiche titre, objectif, public, résultat, prérequis et modules du parcours. L’essai appartient à son programme publié, dans la même langue et avec les versions du cours et de l’activité épinglées. Une activité gratuite sans lien avec ce parcours ne sert pas de CTA. Sans activité gratuite utilisable, aucune promesse d’essai n’est inventée. Plusieurs parcours gardent la découverte générale ; vide et panne restent distincts.

L’aperçu local BR01 montre un bref dossier, un extrait de proposition et un contrôle annoté. Les montants concernent le cadrage et la rédaction fictifs, jamais un prix de formation. Ce bloc et la mention « proposition à valider » sont limités à local/test par le rendu serveur ; staging/production affichent les descriptions du parcours sans cet exemple de brouillon. Le garde a été relu et le rendu sans indicateur d’aperçu est testé ; aucune recette distante ou production avec un cours sélectionné n’est revendiquée.

La navigation du parcours unique est courte et identique sur ordinateur/mobile. Le pied de page relie l’aide et les demandes de données du compte avec des libellés explicites ; aucune page de contact, auteur ou confidentialité inexistante n’est annoncée. Les [textes proposés](../../content/course-client-proposal/HOME_PRESENTATION_DRAFT.md) et les [champs exacts à fournir par Kevin](../../content/course-client-proposal/PUBLIC_INFORMATION_DRAFT.md) restent des brouillons.

## Captures avant et après

Les deux séries utilisent les mêmes leçons et fichiers P18 FR/EN, importés, publiés et sélectionnés uniquement dans PostgreSQL/S3 éphémères. Les identités techniques sont propres à chaque exécution. La dernière rédaction de l’objectif du parcours remplace le code BR02 par « un autre dossier » ; aucun objectif pédagogique, montant ou barème n’est changé.

| Vue française | Avant | Après final |
| --- | --- | --- |
| Accueil ordinateur | [1440px](AUD03-browser/2026-11-22T00-23-43-199Z-00b07df1-004a-4482-848a-f0bc09a2e8fc/before-single-course-fr-1440.png) | [1440px](AUD03-browser/2026-11-22T00-34-54-813Z-767231c9-64f9-42ee-bc2b-24a2b5dfd8e4/after-single-course-fr-1440.png) |
| Accueil mobile complet | [390px](AUD03-browser/2026-11-22T00-23-43-199Z-00b07df1-004a-4482-848a-f0bc09a2e8fc/before-single-course-fr-390-full.png) | [390px](AUD03-browser/2026-11-22T00-34-54-813Z-767231c9-64f9-42ee-bc2b-24a2b5dfd8e4/after-single-course-fr-390-full.png) |
| Navigation mobile | [Menu](AUD03-browser/2026-11-22T00-23-43-199Z-00b07df1-004a-4482-848a-f0bc09a2e8fc/before-single-course-fr-390-navigation.png) | [Menu](AUD03-browser/2026-11-22T00-34-54-813Z-767231c9-64f9-42ee-bc2b-24a2b5dfd8e4/after-single-course-fr-390-navigation.png) |

Les variantes EN, états vides et vues complètes sont dans les mêmes dossiers. **32 PNG avant/après finaux effectivement examinés**,16 par série ;16 captures intermédiaires également conservées et relues. Les deux CTA restent visibles dès le premier écran à390×844 et1440×1000. Aucun chevauchement, débordement apparent ou commande coupée observé. Les montants français restent groupés après la finition typographique. Les PNG ne prouvent pas les interactions ; les activations au clavier et les destinations sont vérifiées séparément.

## Vérifications

[Synthèse, reçus et empreintes](AUD-03-checks.json).

| Contrôle | Résultat observé |
| --- | --- |
| Baseline réelle | **2/2**,16 captures de l’ancienne application compilée, nettoyage confirmé. [Session avant](AUD03-browser/2026-11-22T00-23-43-199Z-00b07df1-004a-4482-848a-f0bc09a2e8fc/session.json). |
| Recette finale AUD03 | **2/2**,16 captures, FR/EN à1440/390px, navigation clavier, menu et absence de débordement mesurée. Les deux CTA ouvrent le cours/version et l’activité/version attendus ; l’essai reste anonyme et son document FREE est réellement reçu. [Session finale](AUD03-browser/2026-11-22T00-34-54-813Z-767231c9-64f9-42ee-bc2b-24a2b5dfd8e4/session.json), [destinations](AUD03-browser/2026-11-22T00-34-54-813Z-767231c9-64f9-42ee-bc2b-24a2b5dfd8e4/aud03-home-checks.json). |
| Régression catalogue P06 | **6/6** : filtres/retours, contenu protégé absent du public, programme épinglé, langues manquantes/périmées, retrait, panne/reprise réelle et conflit CMS. [Session](P06-browser/2026-11-22T00-38-03-895Z-5d451465-b42f-48d4-bbc3-e646e9f2be55/session.json). |
| Régression AUD01 | **4/4** : sélections, recettes hors vitrine, accès directs FREE/PROTECTED conservés, choix de FR depuis le catalogue EN. [Session](AUD01-browser/2026-11-22T00-38-03-877Z-9dae4f74-3ed3-42aa-a70c-57c896528ee8/session.json). |
| Rendu et sélection | **17/17** après les finitions : composants réels et résolution pure du cours, activité étrangère, plusieurs cours, langue/version/révision erronées, cours sans gratuit, aperçu explicite et absence de corps privé. Inclus dans la suite de scripts ci-dessous. |
| Composition locale des scripts CI | **159/159**, dont les tests de rendu/sélection ; aucun lancement GitHub CI. [Résumé expurgé](AUD-03-script-checks.json). Les17 ciblés sont rejoués après la finition textuelle. |
| Build et types | Build final en environnement isolé réussi, TypeScript applicatif pendant build, typage navigateur et lint réussis, aucun paquet ajouté. JAR AUD-01 réutilisé ; aucune source Java ni migration modifiée. |
| Contrastes | **21 paires opaques calculées réussies**, dont le bleu nuit sur les surfaces utilisées ; [mesures](AUD-03-contrast.json). Référence [W3C contrastes](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) relue le22novembre. Ce contrôle ne certifie pas l’accessibilité globale. |
| Préservation | **83 tables locales partagées hors sessions identiques** à la baseline, transaction PostgreSQL `REPEATABLE READ READ ONLY` après les recettes ; anciens rapports P18/P19/AUD02 et fichier Next utilisateur inchangés. [Empreintes](AUD-03-checks.json). |

Les régressions P06 et AUD01 ont utilisé des ports et bases dédiés distincts ; aucune recette n’a réutilisé la base partagée ou les services personnels. Zéro retry, flaky ou cas ignoré dans les exécutions retenues. Tous les processus/services possédés ont été arrêtés avec nettoyage confirmé. Une première recette après modification, également2/2, est [conservée](AUD03-browser/2026-11-22T00-29-38-993Z-c8f3b073-2d5d-4476-84be-a1378ddd6853/session.json) avant les deux finitions. Ces répétitions restent les mêmes deux scénarios, pas six cas distincts.

Commandes utilisées : build via `node scripts/web.mjs build`, lint et typage navigateur via `scripts/courses.cmd`, `node scripts/verify-contrast.mjs AUD-03`, puis `scripts/verify-browser.mjs AUD03` avec `COURSES_AUD03_STAGE=before|after` ajouté après création de l’environnement isolé. Les lanceurs privés `.runtime/aud03` utilisent `isolatedEnvironment(environment({loadLocal:false}))`, sans secrets fournisseur locaux. La composition CI locale appelle `runStep('web','scripts')` et garde ses journaux bruts hors des preuves publiques.

## Limites et suite

L’observation est locale sur Chromium, sans téléphone physique, mesure de performance, revue humaine ou observation de production. L’interface et les liens fonctionnent avec les vraies API et bases de recette ; les sélections restent des simulations éditoriales isolées. La vitrine staging existante, ses données P21, les brouillons P18 partagés et les incidents historiques P12/P15/P19 ne sont pas modifiés par ce lot.

Restent la revue de la cible et de la présentation, les informations publiques du propriétaire et les conditions commerciales réelles. AUD-04 pourra ensuite améliorer la fiche de formation et son lien vers l’offre pertinente, sans simuler de prix ou d’achat. Commerce, LIVE et P22 restent fermés.
