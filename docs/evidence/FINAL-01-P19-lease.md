# FINAL-01 — reprise après abandon d’un bail remboursement actif

Observation locale du 27 novembre 2026, réussie en une exécution sans retry. [Preuve JSON expurgée](FINAL-01-P19-lease-2026-11-27T18-10-17-723Z-f9c2821d-dc1c-4331-a8ea-c4b608cad750.json).

Le vrai worker Java a repris une opération `UNKNOWN` après expiration naturelle de son bail abandonné de 120 secondes. Le calcul d’attente a été extrait sans changer sa condition, ses valeurs ni son plafond, puis importé à la fois par le cas navigateur 04 existant et par cette observation API. **La branche prolongée du helper partagé a donc été exécutée ; le cas UI complet historique n’a pas été rejoué.** La cause du premier timeout P19 reste inconnue, comme celles des incidents P12/P15 et du GET signé ACCESS-01. Cette preuve n’approuve aucune acceptation de risque commerciale.

| Fait conservé avant assertion | Résultat |
| --- | --- |
| Accès membre avant remboursement puis pendant `UNKNOWN` | HTTP 200 puis 200, une lecture par point |
| Crash du seul processus API possédé pendant son GET fournisseur retenu | Job de l’ordre exact `PROCESSING`, opération `UNKNOWN`, bail actif : 119 726 ms restantes |
| Après redémarrage | Même jeton et même échéance de bail, 104 553 ms restantes |
| Attente choisie par le helper partagé | 134 553 ms = restant + 30 000 ms ; plafond inchangé de 180 000 ms |
| Échéance abandonnée selon PostgreSQL | `18:13:44.316571Z` |
| Capture de la nouvelle revendication, avant réponse fournisseur | `18:13:46.447653Z`, autre jeton ; ancien bail réellement expiré |
| Coût de cette capture sur le GET de reprise | 10,03 ms mesurées par horloge monotone ; garde instrumentale inférieure à 1 000 ms |
| État final | `SUCCEEDED`, effet d’accès `APPLIED`, un seul droit créé puis révoqué ; accès membre HTTP 403 attendu |
| Unicité | Une opération persistée, un seul POST remboursement reçu par le transport, une clé stable et un enregistrement fournisseur local |

Le job final `WAITING` est celui de la réconciliation périodique ; il n’est pas présenté comme un état `PROCESSED`. Les compteurs normalisés de réponses HTTP du transport ne représentent pas les réponses effectivement reçues par le processus tué. Le compteur de création remboursement est incrémenté lors de la réception du POST et constitue ici la preuve d’unicité du POST.

Le protocole utilise un fournisseur HTTP fictif en boucle locale, Spring réel, PostgreSQL 18.6, stockage et messagerie jetables. Le schéma, les sessions JDBC, le webhook signé, la décision, le droit et le worker sont réels. Aucun Stripe externe, paiement financier réel, base partagée, Next ou Chromium n’a été utilisé. `isolatedEnvironment(environment({loadLocal:false}))` exclut la configuration locale privée. Aucune date SQL, horloge système/VM, durée de bail, timeout fournisseur ou requête applicative n’a été modifiée. Les requêtes d’observation SQL utilisent une connexion dédiée `READ ONLY` ; elles ne décident ni n’accordent aucun droit.

Si l’un des deux accès positifs reçoit un refus inattendu, le scénario s’arrête après une capture immédiate et expurgée des faits autoritaires : compte actif, relation exacte ordre/owner, origines/dates/locales/version, nœuds et liens publiés, horloges et snapshot/isolation de l’observateur. Il n’y a aucun retry d’accès. Cette branche de diagnostic n’a pas été déclenchée par l’exécution réussie. Une telle capture décrit les faits après HTTP ; elle ne reconstitue ni le snapshot ni les échantillons d’horloge utilisés par la décision HTTP.

Les empreintes des neuf sources du protocole sont dans le JSON et sont restées identiques pendant l’exécution. Le JAR utilisé est `ff0c5517c7879be794957f3769dbd18f37d827e4f025e1e1bcadc09809b3f307` ; 785 classes applicatives sur 785 correspondent aux classes compilées courantes. Le packaging isolé préalable `-DskipTests package` n’est pas compté comme un nouveau passage de tests ; l’ancien JAR a été conservé en privé. Aucun code Java applicatif n’a été changé.

Le nettoyage du transport, de l’IPC, des processus possédés et des trois conteneurs jetables est confirmé. Une vérification Docker indépendante après le run ne trouve aucun conteneur portant le label de cette campagne ; seuls les trois services locaux préexistants restent présents. Le fichier Next utilisateur conserve SHA-256 `0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc`. Les journaux privés et observations intermédiaires restent dans `.runtime/refund-lease-observation-2026-11-27T18-10-17-723Z-f9c2821d-dc1c-4331-a8ea-c4b608cad750/`.

Commande opt-in, séparée de la CI standard :

```powershell
.\.tools\node-v24.22.2-win-x64\node.exe scripts/observe-refund-lease.mjs
```

Contrôles supplémentaires : quatre tests purs du transport opt-in et des frontières du helper passent ; TypeScript de l’observation et des tests navigateur, syntaxe du runner et `git diff --check` passent. Aucun délai n’est ajouté au transport par défaut ni à la CI standard. Les limites historiques et la revue humaine restent ouvertes ; cette observation réduit seulement le manque de preuve sur la mécanique du bail et sa branche d’attente partagée.
