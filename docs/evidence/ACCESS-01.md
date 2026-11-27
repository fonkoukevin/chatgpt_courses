# ACCESS-01 — diagnostic d’accès renforcé, régression S3 ouverte

27 novembre 2026, Europe/Paris. **Le défaut du collecteur de diagnostic est corrigé localement ; la régression de remboursement n’est pas validée.** Les deux incidents P12 et les deux incidents P15 restent ouverts, sans cause démontrée. Un nouveau refus S3 distinct est conservé. [Résultats expurgés](ACCESS-01-checks.json).

## Défaut reproduit et correction

Dans `EntitlementAccessIntegrationTest.captureFreshFailure`, le décodage du problème HTTP, le contrôle de session et les observations PostgreSQL partageaient un seul `try`. Un corps HTML ou malformé pouvait donc empêcher toute collecte SQL ; une session indisponible pouvait avoir le même effet.

Le nouveau test a d’abord été exécuté en conservant ce comportement : **1 test, 1 échec, aucune erreur ni aucun ignoré**. Le premier corps HTML produit seulement les métadonnées et `diagnosticAvailable=false`, sans `ownerActive`. Le XML et le journal privés de cette baseline sont conservés avec empreintes dans le résultat expurgé.

Les collectes problème, transport/session JSON, compte, chaque nœud épinglé et origines sont maintenant indépendantes, avec disponibilité explicite. Une erreur de collecte ou d’écriture ne remplace pas l’assertion d’accès initiale. Les requêtes d’autorisation, périodes, origines et transactions applicatives sont inchangées ; aucune relecture de couverture ou attente supplémentaire n’est introduite.

Le test vérifie trois corps intentionnels — HTML, JSON malformé et JSON `ACCESS_DENIED` — chacun avec une session volontairement indisponible, sur de vrais compte, origine et publications PostgreSQL. Les prédicats restent disponibles. Les captures intentionnelles restent en mémoire, distinctes d’un incident réel. La confidentialité est contrôlée par un booléen avant les assertions sur le rapport, sans transmettre les valeurs privées à leurs messages.

## Passage réellement observé

| Vérification | Résultat |
| --- | --- |
| Baseline du nouveau diagnostic, ancien comportement conservé | 0/1, échec attendu du champ SQL manquant |
| `EntitlementAccessIntegrationTest` après correction | 6/6, dont les16 GET FR/EN parallèles du cas de fraîcheur |
| `RefundHttpIntegrationTest` dans le même passage ciblé | **13/14**, un refus S3 inattendu |
| Diagnostic seul après correction de la confidentialité des assertions | 1/1 |
| Capture S3, JUnit synthétique sans réseau | 3/3 |

Le passage ciblé totalise **20 tests, 19 réussites, un échec, aucune erreur ni aucun ignoré**. Il n’a pas été rejoué pour obtenir un résultat vert. Le contrôle synthétique ajouté pour la nouvelle capture S3 est séparé dans le fichier de résultats ; il ne rejoue aucun paiement, remboursement ou téléchargement réel.

Commandes Maven réellement utilisées depuis `apps/api`, par le runner privé avec environnement isolé sans `.env.local` ni identifiants fournisseur hérités : `mvnw.cmd --batch-mode --no-transfer-progress -Dtest=EntitlementAccessIntegrationTest#diagnostic* test`, puis `-Dtest=EntitlementAccessIntegrationTest,RefundHttpIntegrationTest test`. Le premier sélecteur est réexécuté après la correction du message de confidentialité ; le contrôle S3 seul utilise `-Dtest=PresignedDownloadDiagnosticsTest test`. Les services PostgreSQL/S3 sont jetables via Testcontainers ; le fournisseur de paiement est un double HTTP local, distinct de Stripe externe.

## Nouveau refus S3 : portée et limites

Dans `fullPackRefundKeepsEarlierIndividualOriginAndPersonalWorkButRefusesNewPrivateS3Links`, Spring renvoie **200** pour l’émission du lien, puis le GET signé vers S3 renvoie **403**, attendu200 à la ligne236 du passage conservé. L’échec intervient **avant** la préparation et l’exécution du remboursement. Les étapes suivantes de ce cas ne sont donc pas validées par ce passage.

Le TTL de la fixture vaut deux secondes. Le code d’erreur S3, l’instant signé et le délai du GET n’ont pas été capturés au refus ; les services temporaires ont été nettoyés automatiquement. Une expiration est compatible avec le code, mais **n’est pas démontrée**. Le champ applicatif `expiresAt`, calculé après la signature, ne prouve pas à lui seul l’expiration exacte du lien. Aucun TTL ni code de production n’a été changé.

Une capture de test est ajoutée avant l’assertion du premier GET attendu200. Sur refus, elle conserve seulement des horaires, une durée monotone, le statut et un code S3 reconnu ; URL signée, signature, identifiants et corps brut restent exclus. Ses contrôles synthétiques ne démontrent pas la cause du403 réel. Aucun lien causal avec P12/P15 n’est établi.

## Réexamen des incidents historiques

Les deux refus P15 appellent directement `covers`. Écriture du début de droit et comparaison utilisent PostgreSQL `clock_timestamp()`, également dans le code historique P15 `32f0334` : un simple décalage constant JVM/PostgreSQL ou un `now()` de début de transaction ne constitue pas l’explication de ce code. Un recul transitoire de l’horloge PostgreSQL reste une hypothèse, sans preuve au moment des refus. Les origines et publications manquantes ne peuvent pas être écartées à partir des données historiques conservées.

Les diagnostics restent postérieurs au refus : ils ne reconstituent pas son instant exact. Le correctif de collecte et les succès actuels ne ferment aucune des quatre occurrences. [Suivi P12](P12-access-follow-up.md), [suivi P15](P15-access-follow-up.md). La garde avant livraison commerciale reste applicable.

## Fiabilité des preuves et conservation

Deux défauts du runner privé ont été détectés et corrigés : option de destination Surefire ignorée, puis parseur attribuant mal les cas XML autofermés. Les reçus initiaux restent conservés. Les reçus réconciliés relisent les XML originaux archivés, sans exécuter à nouveau les tests ; nombre de cas et sommes échecs/erreurs/ignorés doivent correspondre aux en-têtes. Le nom du cas S3 et son assertion sont confirmés par le XML et le rapport texte originaux.

L’observation initiale de nettoyage précède la sortie asynchrone de Ryuk ; le contrôle final exige leur disparition effective. Les empreintes des preuves JSON historiques, des sources de production, des sources JSON du cours et du fichier Next utilisateur sont comparées à l’état initial. Le résultat expurgé donne les comptes exacts et le nettoyage observé ; aucun journal privé, secret ou URL signée n’y est copié.

Aucune vérification visuelle n’est requise pour ces changements de tests ; aucun nouveau rendu navigateur n’est revendiqué. Aucun import, paiement externe, publication ou déploiement. P22/LIVE restent fermés. Prochaine action : conserver les gardes et recueillir les faits du prochain refus avant nettoyage ; la revue humaine et les choix format/langues/auteur restent nécessaires pour la rédaction publique finale.

## Suivi ACCESS-02 — 27 novembre 2026

Un défaut distinct de métadonnée est reproduit puis corrigé : l’expiration GET annoncée conserve maintenant l’échéance effectivement portée par la signature, sans nouveau TTL après présignature. Contrats et intégrations sensibles18/18, collecteur synthétique final5/5. Dans une observation isolée nouvelle, le GET immédiat réussit200 et une lecture volontairement après expiration renvoie403 avec indication reconnue. Ce passage ne reproduit pas le403 ACCESS-01, qui reste ouvert ; le parcours de remboursement n’a pas été rejoué. Les quatre incidents P12/P15 et la garde commerciale restent inchangés. [Preuves et limites ACCESS-02](ACCESS-02.md).
