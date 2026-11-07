# Réception fonctionnelle et preuves attendues

Les scénarios T01–T20 viennent du cahier fonctionnel V1. Ce fichier définit ce qui devra être testé : aucune ligne n’affirme que le futur produit passe déjà ces tests. La mise en œuvre et ses preuves seront suivies dans STATUS.md et dans les rapports de test du dépôt.

## Règles de preuve

Pour chaque exécution, conserver date, version/commit, environnement, préconditions, données fictives, action, résultat attendu, résultat observé, commande ou procédure utilisée et incident éventuel. Ne jamais inclure de secret, texte privé réel ni donnée de carte dans les traces.

Classer le résultat : NON_EXÉCUTÉ, RÉUSSI, ÉCHEC, BLOQUÉ_ENVIRONNEMENT ou NON_APPLICABLE_JUSTIFIÉ. Un mock de fournisseur peut vérifier un comportement de notre application, pas le fonctionnement du fournisseur réel. Indiquer expressément ce niveau. Un test non exécuté ne devient pas réussi parce que le code semble correct.

Les tests de règles métier et d’API utilisent la persistance PostgreSQL appropriée. Les autorisations, concurrence, paiements et remboursements demandent des assertions serveur et base de données, pas seulement des captures de boutons. Les parcours d’usage combinent tests navigateur ciblés et revue visuelle. Éviter les tests artificiels qui ne vérifient que la structure du code.

## Scénarios obligatoires du socle

| ID | Préconditions et action | Résultat observable | Preuves et phase principale |
| --- | --- | --- | --- |
| T01 | Catalogue avec ressources FR/EN et accès variés ; rechercher une tâche puis combiner type, niveau, langue et accès ; réinitialiser ; ouvrir une fiche et revenir. | Résultats cohérents, ordre stable, droits/langues visibles, URL partageable, filtres conservés au retour et réinitialisation complète. Aucun brouillon privé exposé. | Test du service de recherche, réponse API et parcours navigateur ; P06, P16, P19. |
| T02 | Visiteur ayant écrit dans l’activité gratuite ; demander sauvegarde, créer/se connecter à un compte, revenir à l’action et enregistrer ; rouvrir dans une autre session authentifiée. | Destination correcte ; brouillon conservé lorsque la session locale le permet ; message honnête sinon. Sauvegarde durable confirmée par le serveur et reprise sous le même propriétaire. | Parcours navigateur avec données fictives, lecture API/DB ; P04, P07–P09, P19. |
| T03 | Requête sans correspondance, puis panne contrôlée du service de recherche. | Zéro résultat et panne sont distincts ; filtres expliqués, catégories utiles, nouvelle tentative. Aucun faux résultat utilisé pour masquer la panne. | Test API d’erreur et revue des deux états ; P06, P19. |
| T04 | Deux apprenants et un éditeur limité ; remplacer l’identifiant d’un projet, méthode, fichier, commande ou attestation par celui d’autrui ; l’éditeur appelle un endpoint financier. | Refus serveur sans divulgation ni mutation, y compris en appel direct ; les ressources du propriétaire restent utilisables. | Tests d’intégration HTTP autorisés/interdits et contrôle DB ; P04, tous lots privés, P17/P19. |
| T05 | Commande non payée ou absente ; visiter directement l’URL de succès et fournir un faux identifiant de session/commande. | Aucun droit créé depuis l’URL ; la page décrit uniquement l’état vérifié du serveur. | Assertions sur droits/commande après navigation et appel direct ; P12/P19. |
| T06 | Envoyer deux créations de checkout concurrentes pour le même achat ; recommencer avec un accès déjà détenu. | Commande/session en cours réutilisée selon la clé métier ; accès existant proposé ; pas de double achat involontaire. | Test concurrence serveur + contrainte DB + vérification du comportement Stripe en environnement de test si disponible ; P11/P12/P19. |
| T07 | Paiement différé reconnu en traitement puis notification vérifiée de réussite. | Attente affichée ; aucun droit prématuré ; droit attribué après confirmation et reprise vers le cours. | Test du flux webhook signé/test fournisseur, état DB et navigateur ; P12/P19. |
| T08 | Répéter simultanément le même événement ; utiliser plusieurs événements valides décrivant la même origine d’achat. | Un effet métier par origine : pas de droit doublé, pas de confirmation répétitive ; événements/reprises traçables. | Tests concurrence/idempotence sur PostgreSQL et journal de traitement ; P12/P19. |
| T09 | Paiement réussi et accès attribué ; provoquer un échec contrôlé du service email, puis sa reprise. | Cours accessible pendant l’incident ; email en échec visible ; reprise sans retirer ni doubler les droits. | Assertions outbox/accès et capture SMTP local ou sandbox ; P10/P12/P15/P19. |
| T10 | Interrompre le traitement après réception durable de la notification et avant attribution ; relancer le worker. | Reprise après incident sans duplication ; commande, paiement et droit finalement rapprochés. | Test de panne contrôlée avec redémarrage et états persistants ; P12/P15/P19. |
| T11 | A acheté seul puis pack A+B ; remboursement confirmé du pack. | Origines du pack révoquées ; A reste autorisé par achat individuel ; B ne l’est plus en l’absence d’autre origine active. Progression et productions conservées. | Assertions sur origines et décisions d’accès, puis navigation A/B ; P13/P19. |
| T12 | Remboursement partiel avec lignes/effets explicites ; passage demandé, en cours puis échec ; scénario séparé de confirmation. | Aucun « remboursé » erroné ; décisions d’accès conformes aux règles et au statut réellement confirmé ; montants cumulés cohérents. | Tests de transitions, serveur/DB, affichage client et admin ; P13/P19. |
| T13 | Rejouer une ancienne confirmation valide de paiement après un remboursement confirmé. | Aucun rétablissement du droit remboursé ; rapprochement avec l’état actuel et trace de l’événement. | Test métier avec chronologie inversée et contraintes persistantes ; P12/P13/P19. |
| T14 | Même activité disponible FR/EN, achat couvrant les deux, quiz tenté, note personnelle et vidéos distinctes ; changer de langue. | Droits et acquis équivalents conservés ; note inchangée ; tentative conserve sa langue/version ; position vidéo attachée à son média ; équivalent correct. | Tests de mapping/version et parcours dans les deux langues ; P07–P09, P16/P19. |
| T15 | Activité FR publiée dont la traduction EN manque, est brouillon ou périmée/suspendue selon décision éditoriale. | Indisponibilité explicite, choix de rester ou point d’entrée EN pertinent ; aucun cours différent ou contenu incomplet présenté comme traduction publiée. | API de disponibilité et navigation langue ; P05/P06/P16/P19. |
| T16 | Une correction mineure puis une révision avec nouvel objectif/évaluation ; apprenant possédant progrès et attestation ancienne. | Historique intact ; correction tracée ; nouvelle version et compléments identifiés ; attestation ancienne non réécrite. | Tests versionnement/snapshots et revue de VersionNotice ; P05/P08/P09/P14/P19. |
| T17 | Modifier un brouillon puis couper le réseau ; deux sessions éditent la même révision ; faire arriver des réponses réseau dans un ordre défavorable. | Texte conservé ; « enregistré » seulement après confirmation pertinente ; conflit explicite, copie/comparaison et résolution choisie ; aucune perte silencieuse. | Tests de concurrence API, réponses différées et parcours navigateur ; P05/P07/P09/P19. |
| T18 | Sauvegarder une méthode personnelle, modifier puis archiver sa source. | Copie et notes intactes ; origine/version conservées ; proposition de nouvelle copie ou indisponibilité de source expliquée. | Assertions snapshots/personnalisation et navigation ; P07/P19. |
| T19 | Droit de cours révoqué ; demander un nouveau lien vidéo/fichier privé ; examiner un lien ancien selon son expiration. | Nouveau lien refusé côté serveur ; expiration des liens anciens conforme au TTL retenu. Aucune prétention d’effacer un fichier téléchargé. | Tests ACL et intégration stockage/vidéo en environnement adapté ; P10/P13/P17/P19. |
| T20 | Renseigner une autoévaluation ; vérifier son origine, sa révision et son rendu dans le compte/attestation. Si service humain activé, soumettre une révision, la faire revoir et consulter les deux preuves. | Autoévaluation toujours déclarative ; aucun humain ou résultat inventé. Si activée, revue distincte avec évaluateur, date, grille, décision et révision soumise ; attestation fidèle. | Partie autoévaluation obligatoire P09/P14/P19. Revue humaine complète conditionnelle : NON_APPLICABLE_JUSTIFIÉ tant que service désactivé ; test complet exigé avant activation. |

## Contrôles transversaux liés au risque réel

### Identité et frontières

Vérifier sessions/cookies/CSRF selon ARCHITECTURE.md ; appels sans authentification, sans permission ou avec propriétaire différent ; absence de fuite par cache Next, résultats de recherche, exports et liens médias. Vérifier expiration de session et retour à l’action sans exposition de données d’un ancien compte.

### Interface et contenu

Examiner public, apprenant et administration à 1440, 1024 et 390 px, et vérifier absence de débordement bloquant à petite largeur. Parcourir au clavier les formulaires, onglets, dialogues, quiz et navigation de cours. Vérifier labels, focus, erreurs reliées aux champs, contenus essentiels sans audio et contraste utile. L’audit visuel ne vaut pas certification automatique.

Les boutons ont une action réelle ; les états vide/chargement/erreur restent utiles. Les textes FR/EN sont externalisés, les mots longs ne cassent pas les mises en page et les pages annoncées dans une langue sont réellement disponibles.

### Offres et fichiers

Contrôler cohérence entre fiche, récapitulatif, montant serveur et snapshot acheté. Les dossiers pédagogiques n’utilisent pas des données clients réelles. Chaque ressource vendue s’ouvre, correspond à sa version, possède le bon niveau d’accès et la bonne langue. Un vrai fournisseur manquant est un blocage identifié, pas un succès simulé.

### Exploitation et déploiement

P19–P22 doivent compléter les preuves de build, migration, CI, sauvegarde/restauration, santé, erreurs, emails et paiement dans les environnements prévus. Les tests en staging ne prouvent pas que la production est déployée. Les données fictives et accès administrateur de démonstration restent exclus de la production.

## Critère de passage d’un lot

Un lot est terminé lorsque son code fonctionne dans l’environnement annoncé, ses états nécessaires sont présents, ses règles sont testées au niveau pertinent, ses documents/contrats sont cohérents et ses limites sont explicites. Réaliser une étape sans exécutabilité requise ou sans dépendance fournisseur produit un statut partiel ou bloqué, avec ce qui est déjà vérifié.

La décision de mise en vente exige aussi les paramètres et contenus réels. Ne pas laisser un prix de démonstration, une vidéo absente ou un délai d’assistance inventé franchir ce contrôle.

