# FINAL-01 — finalisation avant revue du propriétaire

État au 27 novembre 2026 : préparation locale vérifiée ; livraison de recette en cours. La demande « ok fait donc tout ca et moi a la toute fin je vais verifier » autorise la finalisation et la livraison sur la recette existante, sans transformer une proposition commerciale en décision ni déclarer une revue humaine réalisée.

## Vérifications locales observées

- PostgreSQL et S3 jetables : **17/17** cas, sans erreur, saut ni retry, dont les14 remboursements HTTP et trois observations instrumentées des décisions d’accès. Douze décisions distinctes conservent les faits de leur propre snapshot et les valeurs réelles de l’horloge PostgreSQL utilisées. Les cas négatifs contrôlés distinguent transaction non validée, ancien snapshot, origine révoquée, compte désactivé et publication retirée. Cette instrumentation en lecture/écriture ne reproduit pas une transaction de production en lecture seule et n’attribue aucune cause aux anciens incidents.
- Le premier GET S3 du remboursement est200 ; l’échéance annoncée par l’API correspond aux paramètres signés. Il s’agit d’une nouvelle observation, distincte du403 ACCESS-01.
- **223** contrôles sur30 sources FR/EN ; **18** contrôles du lecteur Chromium à1440 et390, six captures réellement examinées. Le lecteur conserve les corrigés repliés et ne déclenche pas de requête réseau automatique. Revue humaine `PENDING`, essai apprenant `NOT_PERFORMED`.
- **1079** chemins préexistants contrôlés sans changement pendant la campagne sensible ; aucun nouveau conteneur restant, trois conteneurs préexistants préservés. Le fichier Next utilisateur reste hors des commits.

Preuves : [contrôles locaux](FINAL-01-local-checks.json), [observations d’accès](FINAL-01-access-observations.json), [sources](FINAL-01-content-checks.json), [manifeste du lecteur](FINAL-01-reader-manifest.json), [contrôles et captures](FINAL-01-reader/2026-11-27T17-46-55-230Z-86213a3b-1860-4615-8489-5076a0caa1a3/checks.json).

## Contenu préparé pour la revue

La formulation EN M06 distingue désormais le périmètre proposé du périmètre accepté et subordonne une alternative à l’accord du client. Les documents de présentation FR/EN décrivent six modules écrits, exercices/quiz, neuf supports Markdown par langue, deux cas fictifs et quatre livrables finaux. Ce sont des propositions à valider ; aucune durée, identité d’auteur, prix, condition commerciale, vidéo tournée ou approbation pédagogique n’est inventé.

Le changement de consigne d’exercice impose une nouvelle version pédagogique dans le CMS publié. La préparation prévoit de conserver les anciennes versions et les notes, puis de créer M06 et ses parents en version2, en réutilisant les autres modules et fichiers existants. Cette opération n’est pas déclarée exécutée à ce stade. Les sources du paquet `v1` et les versions effectives du CMS devront être reliées explicitement dans la preuve d’import.

## Livraison et limites

L’inspection en lecture seule constate la recette historique saine, schéma21,85 tables hors sessions et26 autres conteneurs à préserver. Les variables GitHub staging manquantes ont été réconciliées avec les valeurs réellement actives : `STAGING_PAYMENT_TEST=true` et `STAGING_BASIC_AUTH_ENABLED=false`, puis relues. Les secrets et la configuration serveur n’ont pas été modifiés par cette réconciliation. Une nouvelle sauvegarde chiffrée, sa copie hors hôte et sa restauration réelle sont requises pour la livraison ; l’ancienne preuve n’est pas réutilisée.

Les quatre refus P12/P15, le403 ACCESS-01 et le timeout initial P19 restent sans cause historique démontrée. Un passage ultérieur réussi ne les clôture pas. Toute nouvelle anomalie positive exige capture et arrêt avant nettoyage. La reprise d’un bail actif abandonné fait l’objet d’une observation contrôlée distincte en préparation.

La production n’a ni cible configurée observée ni environnement GitHub identifié. P22/P23 peuvent être préparés ; leur exécution réelle et les faits commerciaux restent conditionnés aux données manquantes. Les paiements LIVE, ventes et assertions de revue humaine demeurent désactivés. Les contrôles, la PR, la CI et le déploiement seront consignés dans des preuves supplémentaires sans réécrire les résultats historiques.
