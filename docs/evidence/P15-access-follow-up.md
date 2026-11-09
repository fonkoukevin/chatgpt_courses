# P15 — deux refus d’accès pendant la régression de remboursement

9 novembre 2026 : **deux occurrences observées, causes encore inconnues, aucun correctif de ces refus revendiqué**. Elles sont distinctes des deux observations HTTP historiques de [P12](P12-access-follow-up.md) et du défaut de transport contrôlé P12 qui bloquait l’activation avant READY. Aucune cause commune entre ces incidents n’est établie.

## Occurrences conservées

| Passage du 9 novembre (heure locale +01) | Observation réelle |
| --- | --- |
| Ciblé60, terminé03:24:20 | 59 réussites, un échec dans `dashboardPartialWaitsForExplicitAccessDecisionAndCumulativeFullRevokesOnlyThatOrder` : `covers` d’un achat indépendant renvoiefalse. Il suit le vrai flux CMS/offre/commande/Checkout/worker jusqu’à READY. Avant le refus, son remboursement reste PREPARED, sa réserve vaut100 unités mineures et zéro origine de cette commande est révoquée. Cela ne démontre pas la présence ou la validité temporelle d’une origine. |
| Classe14, terminée03:35:07 | 13 réussites, un échec distinct dans `partialConfirmationAndDuplicateSignedRefundEventsApplyOnlyTheSelectedOriginOnce`, ligne213 : l’accès A attendu conservé renvoiefalse après un remboursement partiel de B confirmé SUCCEEDED, des événements signés dupliqués acquittés et un seul POST fournisseur constaté. Les prédicats de ce refus n’ont pas été capturés ; l’instrumentation ne couvrait alors que le premier cas. |

La [première observation expurgée](P15-access-failure.json), les [passages ciblés](P15-api-targeted-checks.json) et le [bilan global](P15-api-global-checks.json) conservent ces échecs. Les journaux privés restent respectivement `.runtime/p15-api-target-inbox-final.log` et `.runtime/p15-access-diagnostic-class.log`.

Les bases temporaires étaient déjà nettoyées avant l’analyse. Aucun instant de début/expiration, nombre total de grants, statut de compte ou état de publication au point des refus ne peut donc être reconstitué honnêtement. Le retard JVM/PostgreSQL [mesuré séparément](P15-clock-observation.json) ne constitue pas une preuve causale : début et comparaison du droit utilisent tous deux PostgreSQL. Une inversion des lignes A/B n’est pas davantage démontrée.

## Diagnostic et passages ultérieurs

Les sept attentes positives de la classe utilisent maintenant une assertion commune : une seule lecture réelle de couverture, puis, uniquement si elle échoue, collecte de booléens, comptes et bornes temporelles expurgés avant nettoyage. Les parents épinglés des activités sont inclus. Aucun retry de couverture, délai pour remplacer un refus, antidatage de grant, transaction ajoutée, modification de règle d’accès ou assouplissement de l’assertion n’a été introduit. Les horloges du diagnostic sont explicitement postérieures au false ; elles ne prouvent pas son instant exact.

| Observation distincte | Résultat |
| --- | --- |
| Cas isolé du premier refus, terminé03:31:52 | 1/1 réussi, 44,955s de test ; Maven BUILD SUCCESS1:06. Aucun diagnostic collecté, car le refus n’a pas été reproduit. |
| Première classe complète, terminée03:35:07 | 13/14 ; elle a révélé la deuxième occurrence ci-dessus, au lieu de résoudre la première. |
| Classe complète après généralisation du diagnostic, terminée03:40:08 | 14/14, sortie0 ; 78,572s de tests, Maven1:40. Aucun refus ni fichier de diagnostic. |
| Global terminé03:51:26 | 234/234, sortie0 ; remboursement14 inclus, pas additionné. Aucun refus ni fichier de diagnostic. |

La [régression navigateur paiement P15](P15-payments-regression-checks.json) passe aussi8/8 avec le même JAR et un fournisseur contrôlé. Ces succès ne démontrent pas qu’une cause historique a été corrigée.

## Garde P17/P19 avant livraison

P15 est validé localement sur les contrôles documentés ; **ce suivi reste ouvert**. Toute récidive doit arrêter la validation du parcours et être analysée avec les faits capturés, avant nettoyage et sans remplacer le refus par un retry réussi. Suspendre la livraison du parcours commercial concerné tant que cette garde n’est pas levée sur des preuves suffisantes. Aucun succès ultérieur, corrigé temporel d’un autre module ou transport de test réparé ne ferme ces occurrences de cause inconnue.
