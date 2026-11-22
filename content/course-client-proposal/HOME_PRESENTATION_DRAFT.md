# Présentation proposée pour l’accueil

Cette proposition locale utilise le parcours préparé dans AUD-02 et le dossier fictif BR01. La cible commerciale et la revue éditoriale restent à confirmer. Elle ne publie pas les brouillons P18 et n’active aucune offre.

## Composition retenue

Quand un seul parcours est sélectionné dans la langue demandée, l’accueil reprend son titre, son objectif, son public, ses prérequis, son résultat attendu et ses modules depuis Spring. Il présente directement ce parcours, sans grille de cartes répétant les activités du même programme ni recherche dominante.

L’action principale ouvre une activité gratuite publiée du programme exact. L’action secondaire ouvre la fiche du même parcours et de la même version. S’il n’existe aucune activité gratuite utilisable, seule la fiche est proposée, sans promesse de début gratuit. Un ensemble de plusieurs parcours conserve la découverte générale ; une vitrine vide reste en préparation et une panne reste une erreur récupérable.

La navigation de l’accueil à un parcours suit les mêmes destinations sur ordinateur et mobile : Formation, Essai gratuit lorsqu’il existe, Ressources lorsqu’elles sont disponibles, puis le compte. Les autres pages conservent leur navigation existante. Aucun titre ou slug ne sert à reconnaître artificiellement P18 comme un produit approuvé.

## Textes FR et EN

| Élément | Français | English |
| --- | --- | --- |
| Repère | Un parcours pratique, un travail à vous | A practical course, work of your own |
| Titre | Titre réellement sélectionné du parcours ; pour le brouillon P18 : Du brief client à la proposition commerciale avec ChatGPT. | Actual selected course title; for the P18 draft: From client brief to a clear proposal with ChatGPT. |
| Texte d’introduction | Objectif publié du parcours et public renseigné. | Published course objective and supplied audience. |
| Action principale | Essayer l’activité gratuite | Try the free activity |
| Précision conditionnelle | Gratuite, sans inscription pour commencer. | Free, with no sign-up needed to start. |
| Action secondaire | Voir le parcours | View the course |
| Programme | Un résultat à chaque étape | A useful result at each step |
| État de l’exemple local | Proposition de présentation à valider | Proposed presentation for review |

Ces textes sont dans `apps/web/src/lib/i18n/home.ts` ; titre, objectif et programme restent des données éditoriales serveur. Le CTA ne transforme pas une publication technique de recette en approbation du propriétaire.

## Démonstration originale du dossier BR01

L’aperçu local présente trois fragments lisibles :

1. **Brief fictif** : quatre pages à réécrire, plafond de 1 400 € HT, logo et intégration évoqués sans tarif.
2. **Extrait de proposition** : cadrage et rédaction pour 1 200 € HT ; logo et intégration à clarifier et à chiffrer séparément.
3. **Contrôle** : un budget restant ne crée pas de tarif ; retrouver la source de chaque montant avant engagement.

Les faits viennent du [support gratuit BR01/TR01 FR](v1/resources/fr/br01-tr01.md) et de sa [variante EN](v1/resources/en/br01-tr01.md). Ce fragment est rédigé pour l’accueil, sans reproduire un corrigé privé, attribuer une réponse à ChatGPT ou promettre un résultat commercial. Il est marqué fictif et proposé pour cet aperçu local ; il n’est pas présenté comme un extrait d’un autre parcours sélectionné.

Le bloc BR01 et sa mention de proposition sont limités par le rendu serveur aux environnements `local` et `test`. En staging/production, la composition à un parcours affiche son résultat public réel sans charger cet exemple de brouillon. Le déploiement du code et toute approbation éditoriale restent des opérations séparées.

## Pied de page et informations du propriétaire

Le pied de page décrit le bénéfice de la plateforme avec des mots courants et relie **Aide dans mon compte** et **Mes demandes de données (connexion requise)**. Ces pages privées ne sont présentées ni comme un contact public ni comme une politique de confidentialité. Aucun lien vers une page vide de mentions ou de conditions n’est ajouté.

La [préparation des informations publiques](PUBLIC_INFORMATION_DRAFT.md) indique les champs à fournir pour auteur, contact, identité, conditions et confidentialité. Aucun nom public, expérience, affiliation, adresse, délai de réponse ou statut fiscal n’est fabriqué.

## Validation et limites

La recette compare l’ancien accueil et la proposition avec les mêmes sources pédagogiques FR/EN, publiées et sélectionnées uniquement dans une base éphémère. Les captures couvrent 1440 et 390 px, état vide, parcours unique et menus mobiles. Les résultats effectifs sont dans [AUD-03](../../docs/evidence/AUD-03.md).

Les prix d’exercice ne sont pas un prix de formation. Aucun témoignage, nombre de clients, durée mesurée, vidéo, correction humaine ou accréditation n’est ajouté. Avant une présentation commerciale réelle, Kevin doit relire cette proposition et fournir les informations publiques manquantes ; la fiche de formation et son lien d’offre restent le périmètre d’AUD-04.
