# ACCESS-02 — expiration annoncée alignée sur la signature S3

27 novembre 2026, Europe/Paris. Le lot poursuit le diagnostic local autorisé après ACCESS-01. **Un défaut de métadonnée est reproduit : l’API recalculait l’expiration après signature. Le403 historique reste de cause inconnue.** Aucun parcours de remboursement, paiement externe ou service partagé n’est rejoué. [Résultats expurgés](ACCESS-02-checks.json), [observations de stockage](ACCESS-02-storage-observations.json).

## Défaut certain et correction

`AssetService.access` renvoyait `Instant.now()+ttl` après le retour du presigner. Le temps de signature était donc ajouté à la durée annoncée au client. Le SDK2.57.11 conserve aussi une fraction de seconde dans son `expiration()`, alors que les champs SigV4 utilisés ici portent une date à la seconde et une durée en secondes entières. [Presigner figé](https://github.com/aws/aws-sdk-java-v2/blob/2.57.11/services/s3/src/main/java/software/amazon/awssdk/services/s3/internal/signing/DefaultS3Presigner.java#L378), [champs signés](https://github.com/aws/aws-sdk-java-v2/blob/2.57.11/core/http-auth-aws/src/main/java/software/amazon/awssdk/http/auth/aws/internal/signer/V4RequestSigner.java#L108), [format de date](https://github.com/aws/aws-sdk-java-v2/blob/2.57.11/core/http-auth-aws/src/main/java/software/amazon/awssdk/http/auth/aws/internal/signer/util/SignerUtils.java#L54).

Un test de contrat du service, sans SQL ni réseau, fournit une échéance déterminée par un stockage fictif. Avec le comportement initial conservé, **1 test échoue sur l’échéance renvoyée**, sans erreur ni ignoré. Ce test vérifie la transmission de la date ; il ne prétend pas valider les permissions ou PostgreSQL.

`ObjectStorage.SignedRequest` transporte maintenant l’échéance portée par la signature. Pour GET et PUT, `S3ObjectStorage` la dérive des deux seuls paramètres temporels du `signed.httpRequest()` : `X-Amz-Date + X-Amz-Expires`. L’URL et les paramètres d’identification ne sont pas analysés pour cette opération. Le service restitue cette valeur dans `DownloadAccess.expiresAt` sans redémarrer une durée. Le format JSON reste identique.

Les TTL et les permissions ne changent pas. La réservation d’upload conserve sa propre échéance PostgreSQL ; les grants et dates de droits ne sont pas modifiés. Le rendu texte de la valeur signée reste expurgé.

## Observation isolée sur le code antérieur

Avant la correction applicative, un test dédié utilise SeaweedFS4.52 épinglé et le vrai `S3ObjectStorage`/SDK2.57.11, avec un objet fictif, sans Spring, compte, PostgreSQL ou paiement. TTL de deux secondes inchangé. Une seule signature puis un GET immédiat sont effectués ; un refus aurait conservé les faits et arrêté le cas. Seulement après le succès, un deuxième GET distinct est volontairement envoyé après expiration.

| Lecture du même lien | Observation réelle |
| --- | --- |
| Immédiate | HTTP200 ; signature à12:28:53Z, expiration signée12:28:55Z, réception du lien12:28:53.571441Z, réponse GET12:28:54.550559700Z |
| Volontairement expirée | HTTP403 à12:28:56.036538700Z ; code `AccessDenied`, message d’expiration reconnu par correspondance exacte puis éliminé du rapport |

La présignature dure382,109ms et le premier GET977,748ms, mesures monotones descriptives d’un seul passage local. À la réception du lien, sa durée signée restante est d’environ1,429s. Ces chiffres ne constituent ni une mesure de production ni la preuve de la cause du refus ACCESS-01.

Le comportement d’expiration est cohérent avec le code SeaweedFS4.52 : comparaison de son horloge à la date signée plus la durée, puis erreur403. Le collecteur reconnaît uniquement une combinaison fermée de code/message connue ; il ne conserve aucun message brut. [Vérification fournisseur](https://github.com/seaweedfs/seaweedfs/blob/4.52/weed/s3api/auth_signature_v4.go#L698), [erreur d’expiration](https://github.com/seaweedfs/seaweedfs/blob/4.52/weed/s3api/s3err/s3api_errors.go#L503).

Les deux preuves sont écrites avant les assertions et le nettoyage. Les rôles `IMMEDIATE_READ` et `INTENTIONAL_EXPIRY_PROBE` sont distincts ; ce second GET ne remplace pas un refus par un succès. Le passage de stockage et les quatre contrôles purs du collecteur passent **5/5** sur les sources applicatives initiales, dont les empreintes sont restées identiques pendant ce passage.

## Vérifications du code corrigé

| Vérification | Résultat |
| --- | --- |
| Baseline de transmission de la date, code initial | 0/1, échec attendu de la date |
| Stockage isolé et collecteur, code initial | 5/5 |
| Contrats service/SDK et intégrations PostgreSQL/S3 du code corrigé | 18/18 : quatre contrats, huit fichiers, six accès ; aucune erreur ni aucun ignoré |
| Collecteur synthétique final, après garde sur le statut HTTP | 5/5 ; aucun service relancé |

Les tests SDK sans réseau couvrent GET et PUT avec2s,2,5s et2,999999999s, pour vérifier l’échéance effectivement portée par les paramètres et éviter de supposer des durées toujours entières. Le contrat du service vérifie la transmission exacte, un seul appel de signature et la conservation du TTL demandé. Les intégrations de fichiers et d’accès vérifient les règles existantes sur de vrais PostgreSQL et S3 jetables.

Le helper HTTP des tests de fichiers conserve les GET signés comme **observations**, avec nom de cas et ordre de lecture. Un403 peut y être attendu par le test d’expiration : il n’est pas automatiquement qualifié d’incident. Les assertions du cas restent l’autorité. Aucun instant de réception du lien n’est inventé lorsque le helper ne l’a pas observé.

Après le passage18/18, l’interprétation de corps d’erreur du collecteur est limitée aux réponses HTTP≥400. Un fichier XML renvoyé en200 ne peut ainsi créer une fausse indication d’erreur S3. Un ciblé purement synthétique distinct passe5/5 sur cette limite et la confidentialité ; il ne relance aucun service.

Les commandes Maven sont exécutées depuis `apps/api` avec le Wrapper, `--batch-mode --no-transfer-progress`, environnement isolé sans `.env.local`, et `-Dsurefire.skipAfterFailureCount=1 test`. Sélections : `SignedDownloadExpiryContractTest` pour la baseline ; `S3PresignedExpiryIntegrationTest,PresignedDownloadDiagnosticsTest` pour l’observation ; `SignedDownloadExpiryContractTest,S3SignatureExpiryTest,AssetServiceIntegrationTest,EntitlementAccessIntegrationTest` pour le code corrigé. Aucun retry de test n’est demandé. XML et journaux privés restent locaux ; seuls comptes, noms de cas, empreintes et métadonnées autorisées sont conservés dans les preuves versionnées.

Le protocole temporel est ensuite nommé `S3PresignedExpiryObservation` et se lance explicitement avec `-Dtest=S3PresignedExpiryObservation` depuis `apps/api`. Il conserve ses assertions, son TTL et ses deux lectures conditionnelles. Son classement hors découverte Maven standard correspond à une observation du budget de temps du poste, qui n’est pas un critère déterministe de CI ; le passage précédent est vert et aucun échec n’est retiré. Les tests fonctionnels de fichiers et de contrat restent dans la découverte habituelle. Le reçu conserve l’ancien nom réellement exécuté et l’empreinte du source avant/après ce changement de nom.

## Conservation et limites

Les preuves JSON historiques, les sources JSON du cours et le fichier Next utilisateur sont comparés à l’état initial. Seuls les trois fichiers applicatifs annoncés peuvent différer ; les autres sources de production restent identiques. Les reçus finaux précisent les comptes, les empreintes des sources vérifiées et la disparition des conteneurs jetables, avec préservation des trois conteneurs préexistants.

Les deux refus P12, les deux refus P15 et le403 S3 d’ACCESS-01 **restent ouverts**. Le succès immédiat observé ici ne ferme aucune occurrence antérieure ; le défaut de métadonnée n’est pas présenté comme leur cause. Le scénario de remboursement en échec n’a pas été rejoué. Les collectes renforcées restent disponibles pour un futur refus avant nettoyage.

Aucune horloge, permission, condition commerciale ou donnée partagée n’est modifiée. Aucun nouveau rendu navigateur, import, publication ou déploiement n’est revendiqué. La garde commerciale demeure applicable ; P22/LIVE et les décisions éditoriales restent dans leur état antérieur.
