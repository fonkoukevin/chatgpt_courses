# Revue éditoriale et décisions de lancement

Préparation actualisée le **27 novembre 2026 — FINAL-01**. La relecture assistée, les223 contrôles de sources et les18 contrôles du lecteur sont réalisés. **La revue humaine et l’essai apprenant restent à faire.** Les décisions commerciales de la [fiche inactive](v1/offer-editorial-draft.json) restent ouvertes ; elles seront réunies pour la vérification finale du propriétaire.

## Lire le parcours

Le lecteur local regroupe les douze leçons, leurs exercices et quiz, ainsi que les dix-huit supports. Les bonnes réponses et corrigés sont repliés pour permettre une lecture avant comparaison. Il s’agit d’un outil pour le relecteur, avec les corrigés inclus, distinct du parcours apprenant et de ses permissions serveur.

Depuis la racine :

```powershell
.\scripts\courses.cmd run content:review
```

Ouvrir ensuite [le lecteur local](../../.runtime/course-editorial-review/review.html). Son manifeste conserve l’empreinte de chaque source et l’état `PENDING` de la revue ; il n’enregistre aucune approbation. Après un changement de source, régénérer le lecteur et préciser quelles sources ont effectivement été relues. Les supports et règles détaillés restent dans [EDITORIAL_PREPARATION.md](EDITORIAL_PREPARATION.md) et [ALIGNMENT_MATRIX.md](ALIGNMENT_MATRIX.md).

| Module | Sources à relire | Point de décision humain | État FR / EN |
| --- | --- | --- | --- |
| M01 | [FR](v1/fr/m01.json), [EN](v1/en/m01.json), BR01/TR01 et tableau | La consigne permet-elle de produire huit lignes utiles et trois questions sans compte ni IA ? | À relire / À relire |
| M02 | [FR](v1/fr/m02.json), [EN](v1/en/m02.json) | Le périmètre, le calcul et les conditions de démarrage sont-ils compréhensibles sans engagements ajoutés ? | À relire / À relire |
| M03 | [FR](v1/fr/m03.json), [EN](v1/en/m03.json), méthode de prompt | Les sept paramètres et deux contrôles sont-ils exploitables, avec exécution ChatGPT facultative et explicitement distinguée ? | À relire / À relire |
| M04 | [FR](v1/fr/m04.json), [EN](v1/en/m04.json), modèle et corrigé BR01 | Les sept rubriques permettent-elles une proposition de deux pages après mise en page ? Les autres formulations fidèles restent-elles recevables ? | À relire / À relire |
| M05 | [FR](v1/fr/m05.json), [EN](v1/en/m05.json), grille et corrigé | Les vingt contrôles et blocages sont-ils applicables à la révision du travail, avec justifications plutôt qu’une validation prétendue ? | À relire / À relire |
| M06 | [FR](v1/fr/m06.json), [EN](v1/en/m06.json), BR02, emails et corrigé | Le transfert explique-t-il les deux contraintes et une éventuelle alternative soumise à l’accord du client, sans envoyer les emails ? | À relire / À relire |

Un retour exploitable indique : module, langue, source ou passage, difficulté rencontrée, correction souhaitée et conclusion après lecture. Une approbation humaine doit être explicitement donnée pour les sources concernées ; les identifiants, empreintes, nom du relecteur et date de cette lecture permettent ensuite de la rattacher à une version précise.

## Constats de préparation

Les faits canoniques sont cohérents : BR01 vaut1200€ HT face à un plafond rédactionnel de1400€, avec quinze jours ouvrés après réception des éléments **et** validation du brief. BR02 vaut1400€ avant intégration face à un plafond **global** de1200€, demande au moins dix jours contre cinq souhaités et propose une option à1180€ sans À propos, sous accord. Les quatre pages finales restent en français dans les deux versions pédagogiques. Ces montants sont des données d’exercice.

La consigne anglaise M06 précisait « agreed alternative ». Elle dit désormais « an alternative subject to the client’s agreement », en cohérence avec le français et le corrigé. L’email demande aussi de confirmer le périmètre proposé plutôt qu’un périmètre déjà accepté. Ces deux clarifications conservent objectifs, quiz et barème. Le dossier auteur reste nommé `v1` ; ce nom ne définit pas la version pédagogique du CMS. Une consigne d’exercice publiée est gelée : la livraison prépare M06 activité/module et le cours en version2, avec les cinq autres modules en version1, sans écraser les anciennes versions, notes ou conditions achetées. La [preuve FINAL-01](../../docs/evidence/FINAL-01.md) distingue préparation et publication effectivement observée.

La pré-revue ne démontre ni durée de réalisation, ni facilité d’apprentissage observée, ni exécution réelle d’un prompt dans ChatGPT. Les corrigés sont rédigés pour l’apprentissage. Aucun média, auteur, résultat commercial ou service de correction humaine supplémentaire n’est établi par cette préparation.

## Décisions à prendre lors de la revue finale

1. **Format proposé** : textes et ressources Markdown actuellement disponibles, ou médias à produire avant de les promettre.
2. **Langues du lancement** : français d’abord ou français/anglais, après revue humaine du périmètre concerné.
3. **Auteur et contact public** : nom public, courte présentation factuelle et adresse de contact réellement suivie.

Ces réponses servent à compléter les brouillons existants, sans déduire une identité d’un compte Git ou une politique d’un jeu de test. Aucun choix n’est présélectionné comme décision acquise dans les données de l’offre.

Après ces réponses et la première revue, les conditions restantes se complètent dans [PUBLIC_INFORMATION_DRAFT.md](PUBLIC_INFORMATION_DRAFT.md) et la fiche d’offre : prix/devise/fiscalité, accès, actualisations, aide, identité/conditions applicables, remboursements et conservation. Elles ne sont pas inventées pour avancer. Les réserves techniques P12/P15/P19 restent distinctes ; leur état figure dans [AUD-07](../../docs/evidence/AUD-07.md).

L’essai apprenant consiste à faire réellement accomplir le parcours, conserver les productions et difficultés observées, puis relever séparément lecture, usage de l’outil, rédaction et vérification. Les comptes et durées des tests techniques ne remplacent pas cet essai.

L’assistant poursuit la finalisation technique et la livraison de recette autorisées avant cette revue finale. Les approbations éditoriales, décisions commerciales, imports CMS et déploiements restent des actions distinctes ; le dossier final doit indiquer ce qui a réellement été exécuté.
