# Exploitation et définitions des mesures

L’administration E16 utilise les services métier existants : offres P11, paiements P12, remboursements P13, aide et outbox P10/P14, édition P05. Spring contrôle les permissions à chaque appel. Aucun bouton ne permet de fabriquer un paiement, un remboursement ou une réussite pédagogique.

Les vues privées d’exploitation se trouvent sous `/{locale}/admin/operations` ; les offres sous `/{locale}/admin/offers`. Elles ne sont ni indexables ni placées en cache partagé. Les comptes opérateurs ne sont pas créés automatiquement. Les rôles de référence attribuent des permissions ; l’inscription normale n’attribue aucune permission d’exploitation.

## Périodes et états

Les vues de flux exigent une période UTC explicite `[from,to)`, de durée au plus 366 jours. L’interface propose les trente derniers jours et montre les bornes appliquées. Les listes sont paginées. Un compteur de backlog représente l’état courant des objets créés dans cette période ; il ne reconstitue pas l’état historique du stock à la date de fin.

`ACTIVATIONS_READY` est l’état courant READY des commandes dont le paiement a été confirmé dans la période (`paid_at`). Ce n’est pas le flux des activations effectuées dans la période : une activation retardée reste rattachée ici à sa cohorte de paiement. Le flux des origines effectivement attribuées est l’indicateur `ACCESS_GRANTED`, daté par `access_grants.created_at`.

Les reprises utilisent les traitements et clés d’idempotence persistées. Une réponse « travail enregistré » ne signifie pas « paiement reçu », « droit actif », « remboursement confirmé » ou « email envoyé ». Une notification dont l’envoi est indéterminé exige une reconnaissance explicite du risque de doublon avant reprise. Un incident non reprenable conserve sa raison et la prochaine action disponible.

## Assistance et dossiers de contenu

Le brouillon de réponse appartient à l’opérateur courant. Sa sauvegarde n’ajoute aucun message visible et ne déclenche aucun email. La publication explicite vérifie les révisions du ticket et du brouillon et utilise le service d’aide et son outbox. Une panne SMTP conserve le message et le ticket.

Notes internes, affectation et temps de traitement sont distincts de la conversation apprenant. Une note interne n’est jamais automatiquement communiquée au propriétaire. Chaque temps saisi conserve son auteur et sa date. Aucune entrée signifie « inconnu » ; une entrée explicite de zéro minute signifie zéro connu. Aucun coût horaire n’est supposé.

Un signalement de contenu référence la ressource, sa version et sa langue. Le dossier conduit à l’éditeur existant. Sa résolution lie une révision corrigée réellement publiée et disponible de la même identité/langue ; un brouillon ne suffit pas. Elle ne publie aucun contenu automatiquement, ne réécrit aucun instantané et ne remplace aucune méthode ou production personnelle. Les traductions à revoir relèvent du processus éditorial existant.

## Dictionnaire des indicateurs

Les définitions détaillées, sources, unités, dates, déduplications et limites sont aussi renvoyées par `/api/v1/admin/metrics` et son export CSV. Aucun texte personnel n’est collecté pour compter une sauvegarde.

| Code | Fait et unité | Date et déduplication | Limite |
| --- | --- | --- | --- |
| USEFUL_VISITS | Visites utiles non mesurées | Aucune source autorisée configurée | Inconnu, jamais zéro reconstruit |
| ACTIVITY_STARTED | Première visite authentifiée et autorisée observée par inscription/activité-version | Fait serveur unique, date d’observation | Collecte depuis V017 ; aucun historique antérieur reconstitué |
| PERSONAL_REVISIONS_SAVED | Révision réellement persistée d’une méthode, note ou production | Type/identifiant/révision uniques, transaction de sauvegarde | Depuis V017 ; rejeu et absence de changement ne comptent pas ; aucun corps privé stocké |
| CHECKOUT_STARTED | Opération Checkout durable | Identifiant d’opération, date de création | Une opération n’est pas un paiement |
| PAYMENT_CONFIRMED | Commande dont le paiement a été confirmé | Identifiant de commande, date de paiement | Un remboursement ne crée pas une seconde vente |
| ACCESS_GRANTED | Origine ORDER_LINE attribuée | Identifiant d’origine, date de création | Une origine n’est ni une personne unique ni une réussite ; sa révocation ultérieure n’efface pas l’attribution initiale |
| DECLARED_COMPLETION | Déclaration d’activité actuellement conservée | Inscription/activité-version, date de déclaration | Déclaratif ; une déclaration retirée ne reste pas un achèvement courant ; aucune compétence certifiée |
| REFUND_CONFIRMED | Remboursement confirmé | Opération locale liée au remboursement fournisseur, date de confirmation | Les notifications répétées ne comptent pas plusieurs remboursements |

Les mesures de volumes sont des comptes, sans taux de conversion implicite. Le dénominateur exposé indique ce qui est compté. Une période antérieure au démarrage des nouveaux ledgers est signalée partielle. Le rafraîchissement d’une page ne crée pas une vente ou une révision personnelle.

Le filtre de devise s’applique aux faits commerciaux portant une devise : Checkout, paiement, attribution liée à une ligne de commande et remboursement, ainsi qu’aux montants. Les visites d’activité, sauvegardes, déclarations et minutes d’assistance n’ont pas de devise et gardent leur périmètre temporel ; ils ne sont pas convertis en événements financiers.

## Montants et export

Les agrégats financiers sont des entiers exacts en unités mineures, transportés comme chaînes décimales. Chaque devise reste séparée. Les recettes correspondent aux paiements confirmés dans la période ; les remboursements correspondent aux confirmations dans cette même période. La différence est un solde de flux, peut être négative et ne constitue pas une cohorte d’achats.

Taxes, frais, coûts variables, coût monétaire du support et contribution estimée restent inconnus tant que des valeurs fiables ne sont pas collectées et validées. Une notice fiscale ou un nombre de minutes ne devient pas un montant connu. La contribution estimée n’est pas un bénéfice comptable.

L’export CSV reprend les mêmes filtres et permissions, avec unités et définitions. Il exporte des agrégats, pas les données personnelles du circuit de demandes de compte. Les cellules sont protégées contre les formules. Le journal d’audit normalise les métadonnées d’action ; il exclut les messages, notes, projets, secrets, liens temporaires et données bancaires.

Le proxy vérifie la taille et le SHA256 du CSV reçu de Spring avant de transmettre un succès. Il fournit `X-Content-Size`, taille décodée effectivement vérifiée, et `X-Content-SHA256`. Le client impose ces deux contrôles et la borne de1Mio. `Content-Length` relève du transport HTTP et peut être retiré par Next ; son absence ne devient ni un fichier vide ni une validation d’intégrité. Le téléchargement utilise `private, no-store, no-transform`.

## Conditions restant à valider

Les prix réels, la fiscalité, la durée d’accès, les conditions de mise à jour et d’assistance, les délais et horaires d’aide ainsi que la conservation ne sont pas décidés par l’outil. Les offres incomplètes restent inactivables. L’existence de cette administration ne signifie pas que la production ou la vente sont opérationnelles.
