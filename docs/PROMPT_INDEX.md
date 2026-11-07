# Ordre de réalisation

Les numéros P00–P23 forment un ordre de dépendance pour une première réalisation. Une correction locale peut revenir sur un lot précédent sans réexécuter toutes les phases. Chaque prompt lit le suivi réel avant d'agir.

## Phases principales

| Phase | Fichier dans prompts/ | Résultat principal | Dépendances et attention |
| --- | --- | --- | --- |
| P00 | P00_AUDIT_CADRAGE.txt | Dossier audité, versions et décisions | Préserver le dépôt existant |
| P01 | P01_FONDATIONS_LOCALES.txt | Applications et services locaux démarrables | P00 ; commandes réellement exécutées |
| P02 | P02_DESIGN_SYSTEM_INTERFACES.txt | Tokens, composants et trois structures visuelles | P01 ; revue ordinateur/mobile |
| P03 | P03_MODELE_DONNEES_API.txt | Schéma, migrations, OpenAPI et client typé | P01 ; contraintes métier avant écrans simulés |
| P04 | P04_IDENTITE_SECURITE.txt | Compte, session, CSRF et autorisations | P03 ; T04 et parcours de retour |
| P05 | P05_CMS_PUBLICATION.txt | Contenus, versions, traductions et publication | P02–P04 ; E14/E15 |
| P06 | P06_SITE_PUBLIC_CATALOGUE.txt | Accueil, recherche, fiches, guides | P05 ; E01–E04, T01/T03 |
| P07 | P07_METHODES_GENERATEUR.txt | Générateur sans API IA et copies personnelles | P04–P06 ; E05/E12, T02/T18 |
| P08 | P08_APPRENTISSAGE_QUIZ.txt | Activités, progression, quiz et notes | P04–P07 ; E09/E10 |
| P09 | P09_PROJETS_EVALUATION.txt | Productions, grilles, révisions, autoévaluation | P08 ; E11, T17/T20 |
| P10 | P10_MEDIAS_EMAILS_STOCKAGE.txt | Fichiers privés, vidéo, emails et reprise | P04/P05/P09 ; adaptation des interfaces existantes |
| P11 | P11_OFFRES_COMMANDES.txt | Conditions d'offre, packs et commandes | P03/P05 ; E07, instantanés |
| P12 | P12_STRIPE_ATTRIBUTION.txt | Checkout, webhooks et accès effectif | P10/P11 ; E08, T05–T10 |
| P13 | P13_REMBOURSEMENTS_DROITS.txt | Remboursements et droits par origine | P12 ; T11–T13/T19 |
| P14 | P14_COMPTE_AIDE_ATTESTATIONS.txt | Compte, aide, achats et preuves pédagogiques | P09–P13 ; E13 |
| P15 | P15_ADMIN_EXPLOITATION.txt | Support, incidents, finances et indicateurs | P05/P12–P14 ; E16 |
| P16 | P16_BILINGUE_SEO.txt | FR/EN complet et SEO des pages publiques | P06–P15 ; T14–T16 |
| P17 | P17_QUALITE_TRANSVERSALE.txt | Sécurité, accessibilité, performance et responsive | P16 ; contrôles ciblés |
| P18 | P18_CONTENUS_OFFRES_PRETS.txt | Parcours et offre réellement publiables | P05–P17 ; aucune condition commerciale inventée |
| P19 | P19_RECETTE_CI.txt | Scénarios métier et CI reproductibles | P18 ; T01–T20 avec preuves et N/A justifiés |
| P20 | P20_INFRASTRUCTURE_PRODUCTION.txt | Conteneurs, secrets, sauvegardes et procédures | P19 ; aucune dépense automatique |
| P21 | P21_DEPLOIEMENT_RECETTE.txt | Environnement externe de test observé | P20 et accès disponibles ; paiements test |
| P22 | P22_DEPLOIEMENT_PRODUCTION.txt | Publication sur cible autorisée et vérifications | P21 et conditions réelles validées |
| P23 | P23_EXPLOITATION_APRES_LANCEMENT.txt | Exploitation, incidents et mesure de la valeur | P22 ; observation et amélioration continue |

## Trois points de revue utiles

Après P02, examiner la direction visuelle sur de vrais écrans. Après P09, parcourir le cycle pédagogique complet avec le dossier fictif : essai, compte, travail, vérification et reprise. Après P19, examiner le parcours commercial et les scénarios sensibles avant une livraison externe.

Une dépendance fournisseur non disponible doit être isolée avec une frontière de test explicite. Les étapes locales peuvent avancer, mais un résultat externe non observé reste non validé. Les médias de P10 remplacent les états honnêtes de disponibilité de P08 ; le paiement de P12 raccorde les actions commerciales préparées auparavant.

## Prompts réutilisables

| Fichier | Quand l'utiliser |
| --- | --- |
| R01_REPRENDRE_PROJET.txt | Reprendre après interruption ou dans une nouvelle conversation |
| R02_CORRIGER_ERREUR.txt | Diagnostiquer et réparer un problème précis |
| R03_REVOIR_INTERFACE.txt | Améliorer une interface en respectant la charte |
| R04_AUDITER_CORRIGER_LOT.txt | Vérifier un lot et corriger les écarts prouvés |
| R05_FAIRE_EVOLUER_FONCTION.txt | Modifier le périmètre sans créer de contradictions |
| R06_PASSER_LE_RELAIS.txt | Préparer un checkpoint et une reprise courte |

Le prompt de démarrage se trouve à la racine : 01_PROMPT_DE_DEMARRAGE.txt. Le fichier consolidé distribué avec le ZIP sert à lire ou copier une partie du kit ; il n'est pas destiné à être collé entièrement à chaque requête.

