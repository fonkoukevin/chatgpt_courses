# AUD-02 — cohérence du premier parcours et de ses pièces

Lot du22novembre2026, après AUD-01 (`cd3a767`, `cdd845a`). **Validé localement pour la préparation éditoriale et son intégration technique**, en attente de revue humaine avant publication. Périmètre : brouillons P18, pièces FR/EN, fiche éditoriale, matrice d’alignement et vérification locale isolée. Aucun import partagé, publication réelle, sélection éditoriale, paiement ou déploiement effectué par ce lot.

## Constats et corrections

Les sources P18 contiennent déjà les cinq tarifs TR01 et leurs calculs. Le support synthétique incomplet de l’audit public venait des fixtures P21 de staging, distinctes des brouillons P18 locaux. Aucun tarif supplémentaire ni remplacement du critère `budget-1` n’est justifié.

La [fiche éditoriale](../../content/course-client-proposal/EDITORIAL_PREPARATION.md) et la [matrice d’alignement](../../content/course-client-proposal/ALIGNMENT_MATRIX.md) relient les six modules, vingt critères BR01 et dix-huit questions de quiz par langue aux pièces réelles. Elles conservent cible et objectifs du canon et distinguent préparation technique, essai apprenant et approbation éditoriale.

Corrections de rédaction FR/EN : M05 et le corrigé BR01 acceptent trois contrôles justifiés, avec correction ou maintien ; aucune erreur ni nouvelle révision à fabriquer. Le tableau de cadrage conserve les conditions de démarrage comme inconnues. Les quatre fichiers de corrigé annoncent explicitement leurs cas et montants fictifs et ne se présentent pas comme des réponses obtenues de ChatGPT. Le support de méthode propose, pour M01–M06, données à fournir, demande, résultat à examiner et contrôle personnel ; le modèle de proposition est explicite pour un outil qui ne connaît pas les fichiers locaux.

Les objectifs, identifiants, version pédagogique1, quiz et barèmes restent conservés. Les prérequis établis sont renseignés dans le document du parcours FR/EN ; audience, niveau, outils et portée de l’évaluation restent ceux déjà préparés. La durée reste nulle dans les données tant qu’elle n’est pas mesurée. Les supports modifiés produisent de nouvelles empreintes ; l’import crée de nouveaux assets et des révisions sans modifier les fichiers historiques. Les brouillons partagés ne sont pas mis à jour par cette vérification.

## Vérifications réalisées

[Synthèse et empreintes de clôture](AUD-02-checks.json). Les preuves nouvelles sont séparées de P18/P19 ; leurs quatre rapports de contenu historiques sont identiques avant/après. Le fichier Next utilisateur conserve également son empreinte d’origine.

| Vérification | Résultat |
| --- | --- |
| Sources FR/EN | **223/223 contrôles**,30 fichiers ouverts : douze leçons et dix-huit supports ; calculs tirés des tableaux réels, clés/réponses des quiz et grilles canoniques comparées. [Rapport final](AUD-02-content-checks.json). |
| Préparation | **14 identités,28 traductions,18 fichiers**, noms versionnés et liens Markdown adaptés. Empreintes des sources et des octets livrés reliées. [Manifeste de préparation](AUD-02-content-preparation.json). |
| Import isolé | Plan puis application :28 DRAFT,18 fichiers READY,12 aperçus privés et12 refus404 publics avant publication ; rejeu intégralement inchangé. [Preuve](AUD02-browser/2026-11-22T00-14-46-312Z-6eb57d06-a360-44f3-afdd-1f65ce506f73/import-draft-checks.json). |
| Chromium final | **4/4**, zéro retry, cas ignoré ou flaky ; douze leçons, méthodes, projets BR01/BR02, autoévaluation déclarative et cloisonnement des corrigés. [Session](AUD02-browser/2026-11-22T00-14-46-312Z-6eb57d06-a360-44f3-afdd-1f65ce506f73/session.json), [résultats](AUD02-browser/2026-11-22T00-14-46-312Z-6eb57d06-a360-44f3-afdd-1f65ce506f73/results.json). |
| Téléchargements réels | **18 fichiers distincts** depuis l’interface, dont4 corrigés après révélation explicite : nom/langue/version, octets, SHA256 et UTF-8 vérifiés. Chaque empreinte téléchargée correspond à la préparation finale, elle-même reliée aux sources relues. **4 exports locaux** n’enregistrent pas implicitement le texte personnel. [Reçus](AUD02-browser/2026-11-22T00-14-46-312Z-6eb57d06-a360-44f3-afdd-1f65ce506f73/course-download-checks.json). |
| Rendu visuel | **18 PNG finaux effectivement inspectés**,9 FR et9 EN : leçons et méthode en vues partielles ; grille et projet BR02 en pleine page, avec zones de texte défilables. Aucun défaut matériel observé dans ces surfaces. L’inspection ne démontre pas le corps intégral des leçons ; les blocs et actions clavier sont vérifiés séparément par Playwright. [Empreintes et limites](AUD-02-checks.json). |
| Préservation | Après arrêt confirmé des seuls services/processus de recette, **83 tables locales partagées hors sessions identiques** à la baseline, transaction PostgreSQL `REPEATABLE READ READ ONLY`. Brouillons P18 et données personnelles inchangés. [Preuve agrégée](AUD-02-checks.json). |
| Contrôles de code | Syntaxe des trois scripts Node, typage navigateur et `git diff --check` réussis sous Node24.22.2 ; Java21.0.13. JAR et build web AUD-01 réutilisés, leurs empreintes conservées : aucune source Java ou interface applicative modifiée dans AUD-02. |

Commandes réellement exécutées depuis la racine avec les outils portables :

```powershell
.\.tools\node-v24.22.2-win-x64\node.exe scripts/prepare-course-content.mjs AUD-02
.\.tools\node-v24.22.2-win-x64\node.exe scripts/verify-course-content.mjs AUD-02
.\scripts\courses.cmd run typecheck:browser
```

Le superviseur `scripts/verify-browser.mjs AUD02` a été exécuté avec `isolatedEnvironment(environment({loadLocal:false}))`, via un lanceur privé dans `.runtime/aud02`, sans charger les secrets fournisseur de `.env.local`. PostgreSQL/S3/Mailpit utilisent des ports de boucle locale et du tmpfs. Les28 brouillons sont publiés uniquement dans cette base éphémère pour examiner les vues et téléchargements ; cette publication technique ne concerne ni les brouillons partagés ni la vitrine. Stripe et les workers de paiement, remboursement et notification restent désactivés avant/après. Le nettoyage est confirmé pour les deux exécutions.

Une première exécution complète **4/4** a précédé les précisions finales du prompt M04, du résultat attendu M05 et des prérequis du parcours. Elle reste [conservée](AUD02-browser/2026-11-22T00-11-38-913Z-68e3f1ec-1531-452f-8f9c-c658cf05304b/session.json), avec [contrôles de sources initiaux](AUD-02-content-checks-initial.json) et [préparation initiale](AUD-02-content-preparation-initial.json). La seconde exécution complète porte sur la rédaction finale ; les quatre scénarios distincts ne sont pas présentés comme huit cas indépendants.

## Revue et décisions restantes

La relecture croisée des agents a examiné les douze leçons, dix-huit fichiers et leurs équivalences, sans devenir une revue humaine. Les pages officielles [Prompting](https://learn.chatgpt.com/docs/prompting) et [Use ChatGPT](https://learn.chatgpt.com/docs/use-chatgpt), ouvertes le22novembre, soutiennent les conseils généraux de M03 sur objectif/contexte/format/limites et vérification des nombres, sources et affirmations. Aucune interface connectée, réponse réelle d’IA, fonctionnalité liée à un abonnement ni essai apprenant n’a été observé.

La durée reste non estimée ; aucun temps de test automatique ne devient une durée pédagogique. Kevin doit confirmer la cible et l’auteur, la revue FR/EN, le format et les langues de lancement, puis organiser un essai apprenant. Les conditions commerciales restent celles à renseigner dans la fiche inactive. Aucun média non produit, aide humaine, attestation officielle, tarif réel ou accès n’est inventé. Publication, mise en vitrine et activation commerciale demeurent séparées.
