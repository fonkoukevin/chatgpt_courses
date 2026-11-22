# AUD-05 — atelier guidé et vérification compréhensible

Lot du 22 novembre 2026, après AUD-04, sur `audit/aud-05-workshop`. **Validé localement.** Aucun push, déploiement, import partagé ou paiement externe.

## Comportements

L’activité présente quatre moments ancrés, sans onglets qui démontent la rédaction : comprendre, produire, vérifier et réutiliser. Consigne, pièces et outils précèdent la préparation ; la grille suit la rédaction et conserve ses clés, libellés et points. Les cinq catégories contractuelles sont utilisées seulement pour les critères reconnus ; les autres restent dans un groupe neutre. Version, langue et revue de la source sont regroupées dans un détail secondaire. L’encart invité suit la rédaction ; les erreurs de compte restent en haut.

M01 est gratuit mais n’a pas de politique de projet. Il propose donc un essai local vide, copiable et exportable en Markdown, avec langue de rédaction choisie indépendamment de l’interface. Cet essai ne crée ni projet ni grille, n’écrit pas dans le stockage navigateur et ne promet pas de reprise après connexion. La copie et l’export conservent le texte littéral, sans corrigé ajouté. Les liens d’ancre gardent la saisie ; les liens de sortie et de langue provoquent un avertissement. Refuser laisse le texte intact ; accepter autorise explicitement sa perte.

Un projet configuré garde le modèle P09 : sept sections structurées et un texte externe, aides courtes sans réponses préremplies, enregistrement volontaire et source capturée. Un panneau de dossier reste consultable pendant la rédaction ; sa fermeture ne démonte pas les champs. Le bouton initial n’annonce pas de préparation possible lorsque sa lecture est bloquée. Une préparation déjà ouverte reste montée pendant la revalidation du compte.

Le résultat du quiz commence par chaque réponse et son explication, puis donne score et conservation. Sans inscription, il s’agit d’une correction formative en mémoire, même pour un compte connecté ; aucune tentative n’est récupérée automatiquement après identification. Avec compte et inscription autorisés, le serveur conserve une tentative dans sa langue/version d’origine. Visite, lecture déclarée, activité terminée, quiz, projet et compétence restent des faits séparés.

## Carte des états

| État | Conservation et actions |
| --- | --- |
| Essai simple sans politique de projet | Mémoire de la page, champ vide ; copie et export locaux. Aucun stockage ni import promis. |
| Préparation P09 anonyme configurée | Mémoire tant qu’aucune action volontaire n’a été prise. Consentement obligatoire pour un brouillon non sensible conservé au plus deux heures dans cet onglet. |
| Brouillon P09 après connexion | Compte affiché, import explicite ; importer ne crée pas de projet. Il faut ensuite enregistrer volontairement. |
| Projet enregistré | Production propriétaire en base, langue originale et source/version capturées ; l’interface peut changer de langue sans traduire le texte. |
| Réponse formative au quiz | Résultat de page seulement, aucune tentative ni progression pédagogique durable. |
| Tentative authentifiée avec inscription | Snapshot serveur, contrôle CSRF/contexte, limites communes FR/EN, historique privé ; pas d’achèvement ou de projet automatique. |
| Checklist locale de l’activité | Cases locales explicitement non enregistrées ; aucun score de projet créé. |
| Autoévaluation du projet | Déclarations sur une révision précise, vingt critères et quatre erreurs bloquantes inchangés ; pas de vérification automatique de vérité ou de revue humaine. |
| Corrigé de projet | Action volontaire selon la politique existante, accès revérifié ; consulter ne termine ni ne réécrit la production. |
| Compte expiré/changé, panne ou conflit | Gardes et reprise volontaire existants, aucun retry automatique de mutation ; saisie et copie de secours préservées. |

La durée est celle de `projectDraftTtlMs` : 7 200 000 ms. Un brouillon absent, expiré ou un stockage indisponible n’est pas annoncé comme enregistré. L’essai M01 n’utilise pas ce mécanisme. Les exemples et comparaisons déjà publiés dans le corps CMS restent le contenu éditorial public ; aucun découpage par intitulé de paragraphe ni faux corrigé protégé n’est inventé.

## Vérifications et captures

[Synthèse, reçus et empreintes](AUD-05-checks.json).

| Contrôle | Résultat observé |
| --- | --- |
| Client | **133/133**, dont deux nouveaux tests d’export littéral et de langue. Compilation du client comprise. |
| Scripts CI locaux | **188/188**, dont seize cas AUD05 : quiz6, atelier6, routes/historique retiré4. Vrais lecteurs et composants, gardes de compte et absence de corps pédagogique dans les références personnelles. [Résumé expurgé](AUD-05-script-checks.json). |
| Recette AUD05 finale | **6/6**, clavier et quatre viewports FR/EN ; deux vrais exports Markdown, contenu/nom/UTF-8/SHA vérifiés, copie réelle, avertissements, quiz formatif, import P09 et projet M04 protégé. [Session](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/session.json), [états et exports](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/aud05-workshop-checks.json). |
| Régression apprentissage | **10/10**, dont note et historique réellement retrouvés après retrait de l’activité, du module et du parcours ; propriétaire distinct refusé. [Session finale](P08-browser/2026-11-22T07-54-25-615Z-719fb98c-82af-4cfb-a452-8b918b537998/session.json). |
| Régression projets | **8/8** : consentement/import FR/EN, source, révisions et autoévaluation, vraie panne/conflit, compte changé et préparation CMS sans publication. [Session finale](P09-browser/2026-11-22T07-54-25-614Z-eb3c906f-594b-496a-931d-217a716c4b00/session.json). |
| Build et types | Build final `Nch3OFomjPpRU74VdIkU1`, TypeScript applicatif pendant build, lint et typage navigateur passent. JAR AUD04 `2cbb814c…` inchangé ; aucun nouveau test Java annoncé, aucune source backend, migration ou dépendance ajoutée. |
| Contrastes | **21 paires opaques réussies**, mêmes tokens ; [mesures](AUD-05-contrast.json). Aucun certificat d’accessibilité globale n’est déduit de ce calcul. |
| Préservation | **83 tables partagées hors sessions identiques** avant/après, transactions PostgreSQL READ ONLY ; fichier Next utilisateur et preuves P18/P19/AUD02/AUD03/AUD04 inchangés. |

La baseline est **1/1 avec dix PNG** : quatre cadrages M01 FR/EN1440/390 et leurs vues complètes, puis deux résultats de quiz. Le montage de la rédaction, les champs vides, les gardes et la source exacte sont recettés réellement. Le dossier s’ouvre au clavier, se ferme par Échap et restitue le focus sans perdre la saisie ; cette interaction n’a pas de PNG dédiée ouverte. Les deux exports finaux sont de250 et249octets ; leur langue et leur texte courant sont vérifiés sans sauvegarde implicite.

Le test P09 technique observe une borne de7 200 000ms et un échantillon restant de7 199 417ms après consentement. Il n’attend pas deux heures réelles. L’import laisse zéro projet avant l’enregistrement volontaire ; un titre manquant signale le champ et lui rend le focus. Une interface EN conserve ensuite le texte et la langue FR. Un quiz authentifié et une lecture déclarée ne créent pas de projet et ne terminent pas l’activité. M04 atteint le maximum de points déclarés avec une erreur bloquante et reste À réviser ; révéler son corrigé ne modifie pas la révision de production.

| Vue | Avant | Après final |
| --- | --- | --- |
| Activité FR mobile | [390px](AUD05-browser/2026-11-22T07-38-45-896Z-fb0c376f-a9f0-464d-858c-cfadf728c6f1/before-m01-fr-390.png) | [390px](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/after-m01-fr-390.png) |
| Activité EN complète | [1440px](AUD05-browser/2026-11-22T07-38-45-896Z-fb0c376f-a9f0-464d-858c-cfadf728c6f1/before-m01-en-1440-full.png) | [1440px](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/after-m01-en-1440-full.png) |
| Quiz FR expliqué | [Avant](AUD05-browser/2026-11-22T07-38-45-896Z-fb0c376f-a9f0-464d-858c-cfadf728c6f1/before-m01-fr-390-quiz-result.png) | [Après](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/after-formative-fr-390-answers-explained.png) |

Autres vues : [rédaction locale FR](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/after-practice-fr-390-written.png), [consentement P09](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/after-p09-technical-consent-390.png), [production FR dans interface EN](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/after-p09-saved-fr-text-in-en-interface-390.png), [déclaration avec erreur bloquante](AUD05-browser/2026-11-22T07-54-18-823Z-b41139c1-b1b6-412e-8d7c-15f93b27a01c/after-m04-declared-assessment-blocking-390.png), [note après retrait](P08-browser/2026-11-22T07-54-25-615Z-719fb98c-82af-4cfb-a452-8b918b537998/fr-390-withdrawn-source-personal-note.png).

**Dix captures avant et17 finales réellement examinées**, plus douze intermédiaires et quatre vues P08 de conservation après retrait. Les quatre ancres sont visibles en mobile après déplacement de l’encart invité, les critères sont lisibles par thèmes et les explications précèdent le bilan. Aucun débordement ou chevauchement bloquant observé. Les PNG ne prouvent pas les interactions, contrôlées séparément ci-dessus.

Commandes exécutées avec Node24.22.2 figé et environnement isolé : `node scripts/web.mjs build`, `node scripts/api-contract.mjs test`, runner CI local pour scripts/lint et `typecheck:browser`, `node scripts/verify-contrast.mjs AUD-05`, `node scripts/verify-browser.mjs AUD05`, P08 et P09. Le nouveau raccourci `scripts/courses.cmd run verify:workshop` appelle le même superviseur. Les lanceurs `.runtime/aud05` gardent les logs bruts privés, ne chargent pas les secrets fournisseur et réservent bases/ports dédiés. Toutes les sessions, y compris celles en échec, confirment leur nettoyage ; commerce, Stripe et workers de paiement/remboursement/notification restent désactivés. Zéro retry, flaky ou cas ignoré dans les exécutions finales retenues.

## Diagnostics conservés

La première recette après a passé comparaison, rédaction/copie/export et quiz formatif, puis s’est arrêtée sur l’activation clavier d’un bouton encore désactivé pendant la vérification du compte : trois cas passés, un échec, deux non exécutés. Le test attend maintenant son activation avant focus/Entrée ; le garde produit est conservé. [Session conservée](AUD05-browser/2026-11-22T07-45-42-594Z-3d5820db-6813-4cb9-ace7-727b5cf97aa5/session.json).

Les régressions initiales ont identifié une erreur d’accès au travail personnel après retrait pédagogique : la page d’indisponibilité masquait notes et historique alors que leurs API propriétaires conservaient les données. Le correctif conserve le refus pédagogique, mais transmet une référence de trois champs aux composants privés existants de notes et d’historique. Aucun corps, corrigé ou contexte membre n’est transmis dans ces props publiques. La création de note y est désactivée ; la lecture et la modification d’une note existante restent soumises à Spring et au contexte du compte. Quatre tests SSR couvrent les deux branches de route et les états de compte ; la régression P08 finale confirme leur accès réel après retrait.

Les échecs initiaux sont conservés : [P08](P08-browser/2026-11-22T07-45-49-878Z-33d8c799-dfaf-41f4-923d-98e93137221b/session.json), huit cas réussis/deux échecs d’affichage après retrait ; [P09](P09-browser/2026-11-22T07-45-49-793Z-2e05f351-803e-4152-a2d5-de64eab87b3a/session.json), sept réussis/un timeout de préparation CMS. La capture CMS montre BR01 chargé malgré la sélection BR02 effectuée aussitôt après le rendu serveur. L’interaction avant hydratation est une inférence fondée sur le DOM et le code, sans trace réseau exhaustive. Le test attend désormais la lecture de compte du montage client, vérifie le choix BR02 puis exige toujours sa vraie réponse et les révisions inchangées. Aucun sommeil, relâchement de contrôle ou retry automatique n’est ajouté.

## Limites

Recette sur Chromium local, PostgreSQL/S3 possédés éphémères et sources P18 techniquement publiées dans ces seules bases. Le projet FREE configuré de consentement/import est une fixture technique séparée de M01 ; M04 conserve son accès PROTECTED et utilise une origine MANUAL_TEST isolée. Aucune revue éditoriale humaine, publication partagée, API IA payante, certification, vidéo ou performance sur appareil physique n’est revendiquée.

Le contrôle visuel ne comprend pas de PNG du panneau de dossier ouvert ; son interaction clavier/focus est réellement testée. Un petit défaut d’espacement préexistant entre deux liens de la vue P08 de programme conservé est consigné dans la revue, hors de l’atelier modifié. Les avertissements de saisie sont recettés pour les liens de sortie/langue et les ancres internes ; aucun contrôle exhaustif de tous les chemins d’historique du navigateur n’est annoncé.

Les refus historiques P12/P15 et limites P19 restent ouverts séparément. Ce lot n’exécute aucun Checkout ou paiement externe et ne les clôture pas. Commerce, LIVE et P22 restent fermés. Suite prévue après validation : AUD-06, cohérence FR/EN et retours de navigation.
