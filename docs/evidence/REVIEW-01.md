# REVIEW-01 — Préparation de la revue humaine et des décisions de lancement

État au **26 novembre 2026** : dossier et lecteur de revue préparés et vérifiés localement. **Revue humaine et décisions personnelles en attente.** Cette étape poursuit la conclusion d’AUD-07 ; elle ne constitue pas un déploiement P22. [Dossier de relecture](../../content/course-client-proposal/LAUNCH_REVIEW.md), [résumé vérifiable](REVIEW-01-checks.json).

## Résultat concret

Le lecteur [review.html](../../.runtime/course-editorial-review/review.html) rassemble les six leçons par langue, objectifs, prérequis, corps, exercices, corrections, questions et bonnes réponses expliquées. Il inclut les neuf supports par langue, avec leurs liens internes résolus dans le même document. Les corrections et réponses sont repliées ; les corrigés de projet sont identifiés comme supports de revue locale. Ce document est destiné au relecteur et ne devient pas une page apprenant.

La commande `scripts/courses.cmd run content:review` est fournie par `scripts/prepare-editorial-review.mjs`, sans nouvelle dépendance. Elle utilise uniquement les trente sources locales de `content/course-client-proposal/v1`, produit le HTML et `manifest.json` dans un dossier identifié par son marqueur, et refuse les sorties non reconnues ou les liens symboliques. Des générations identiques ne réécrivent pas les fichiers. Le manifeste conserve les identités, langues, chemins, ancres, tailles et SHA256 des sources et du HTML ; ses états restent `humanReview=PENDING`, `learnerTrial=NOT_PERFORMED`, `approvalRecorded=false`.

Le HTML est autonome : CSS et polices système, aucun script, formulaire, média embarqué ou chargement réseau automatique. Les liens HTTPS issus des sources ne s’ouvrent que volontairement. Le rendu Markdown couvre les constructions utilisées ici (titres, paragraphes, listes simples, tableaux, citations, code, emphase et liens) ; il ne prétend pas implémenter tout CommonMark. Le HTML brut est échappé. Les métadonnées des supports restent visibles au relecteur. À l’impression, les volets natifs doivent être ouverts si leurs corrections sont souhaitées.

## Pré-revue assistée et correction locale

Deux agents examinent séparément les six leçons et neuf supports FR, puis EN et leur équivalence. Aucun nouveau défaut de calcul, délai, barème ou langue du cas n’est démontré : BR01 conserve1 200€ HT face à un plafond rédactionnel de1 400€, quinze jours ouvrés après réception des éléments ET validation du brief ; BR02 conserve1 400€ avant intégration face au plafond global de1 200€, dix jours minimum et l’option sans À propos de1 180€ sous accord. Les montants restent fictifs, sans assimilation au prix du cours.

La consigne M06 EN utilisait « optionally propose an agreed alternative ». La formulation devient « optionally propose an alternative subject to the client’s agreement ». Elle clarifie la condition d’accord déjà présente en FR et dans le corrigé ; le reste du JSON, quiz compris, reste identique. Aucun import CMS ni nouvelle publication ne transmet cette clarification au staging. Une livraison éditoriale ultérieure devra employer le mécanisme de révision existant et vérifier les traductions concernées.

Les contrôles et relectures des agents ne remplacent pas l’approbation humaine FR/EN, une exécution ChatGPT ou un essai apprenant. Les références OpenAI déjà présentes dans les supports sont examinées comme sources des consignes générales, sans supposer une interface ou fonction payante particulière : [préparer une demande](https://learn.chatgpt.com/docs/prompting), [utiliser et vérifier les résultats](https://learn.chatgpt.com/docs/use-chatgpt).

## Vérifications réellement exécutées

| Contrôle | Résultat observé | Portée |
| --- | --- | --- |
| `verify:content -- REVIEW-01` | **223/223**,30 fichiers ouverts | [Rapport](REVIEW-01-content-checks.json) distinct des preuves historiques. Structure, équivalence des évaluations, tarifs et calculs contrôlés. |
| Générateur du lecteur | Réussi, puis génération identique sans réécriture |30 sources,12 leçons,18 supports,36 questions et48 réponses/corrections repliées. Empreintes du manifeste vérifiées sur les octets réellement produits. |
| Navigateur du lecteur local | **18 contrôles réussis**, zéro erreur de page ni requête réseau | Chromium158 headless, fichier local, viewports1440×1000 et390×844 ; ancres, clavier, volets, langues, contenu complet et absence de débordement de page. [Reçu](REVIEW-01-browser/2026-11-26T21-42-20-986Z-155d37c5-74df-47b9-a7f3-f99dbf73bc70/checks.json). |
| Rendu | **Six captures originales examinées** | Sommaire, M01 FR, M06 EN, corrigé BR02 FR et dossier BR02 EN. Aucun défaut visuel bloquant observé dans les vues capturées ; aucune revue visuelle exhaustive du long document annoncée. |
| Nettoyage | Confirmé | Navigateur et contextes de test fermés. Aucun serveur, conteneur, compte ou service applicatif démarré pour ce lecteur. |
| Préservation | Contrôlée | Fichier Next utilisateur conservé ; anciennes preuves et offre inactive intactes. Une seule consigne de source EN modifiée, sans changement de quiz, de prix ou de droits. |

Un build applicatif ou une recette Spring globale ne sont pas relancés pour ce lecteur local et cette clarification de source. Ils ne démontreraient ni revue humaine ni import éditorial.

## Décisions restant à recevoir

Trois questions sont présentées à l’utilisateur : **format proposé**, **langues de lancement**, **nom public/présentation factuelle/contact suivi**. Aucune réponse ou approbation n’est déduite de l’accord général pour passer à l’étape suivante. Les valeurs non décidées restent dans les brouillons existants ; aucune page publique vide n’est créée.

Le dossier `LAUNCH_REVIEW.md` permet ensuite de consigner les conclusions de lecture par module/langue. Les conditions réelles se complètent dans `PUBLIC_INFORMATION_DRAFT.md` et `offer-editorial-draft.json`. Revue humaine, essai apprenant, prix/devise/fiscalité, accès, actualisations, aide, identité/conditions, remboursements et conservation restent à établir avant l’activation correspondante. Les réserves P12/P15/P19 et la décision AUD-07 de lancement commercial non prêt restent applicables.

Prochaine action : lire et commenter les sources, répondre aux trois choix demandés, puis préparer les textes publics et conditions à partir de ces faits. Aucun déploiement, achat, email externe ou paiement n’est exécuté par REVIEW-01 ; P22 et LIVE restent fermés.
