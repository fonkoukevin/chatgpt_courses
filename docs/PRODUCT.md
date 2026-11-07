# Contrat produit de ChatGPT Courses

Document de référence pour la V1 à développer. Les choix fonctionnels proviennent du Cahier fonctionnel de ChatGPT Courses V1 et de l’Analyse fonctionnelle du 7 novembre 2026. Le cahier le plus récent précise le socle ; la matrice FUNCTION_MATRIX.md conserve les 54 fonctions et leurs priorités. Ce dossier ne constitue ni une application déjà construite, ni une preuve de rentabilité.

## Problème et promesse

Une personne qui a essayé l’IA obtient parfois un résultat trop général, peine à vérifier les affirmations ou ne sait pas réutiliser sa méthode. Le produit doit lui permettre de choisir une tâche, apprendre, produire un livrable, le contrôler et conserver une méthode personnelle. Le premier parcours de référence concerne une proposition commerciale réalisée à partir d’un dossier fictif. La cible de départ proposée est l’indépendant de services ; la cible la plus rentable et le prix restent des hypothèses à valider.

La valeur gratuite doit être autonome : un guide répond réellement à une question et une première activité permet une réalisation complète. La valeur payante vient d’un parcours cohérent, de dossiers et ressources, d’exercices gradués, de corrigés et de modalités de vérification explicites.

## Architecture fonctionnelle

Trois espaces partagent un design system :

- Public : accueil par tâche, catalogue, recherche, guides, méthodes, première activité, informations d’offre.
- Apprenant : reprise, leçons, quiz, projets, méthodes personnelles, compte, achats et aide.
- Administration : édition, versions, traductions, publication, offres, commandes, droits, remboursements, support, incidents et mesure.

E01–E16 sont des familles couvrant plusieurs pages et états, pas seulement seize captures. Leur détail est dans SCREENS.md. T01–T20 décrivent des comportements à vérifier ; ACCEPTANCE.md distingue tests réels, dépendances et cas conditionnels.

## Périmètre de lancement

Le socle comprend découverte, contenus publics, comptes, parcours et activités, progression persistante, quiz, atelier de production textuelle, grille d’autoévaluation, générateur de prompts sans API IA, bibliothèque personnelle, achat de parcours/packs, attribution des droits, remboursements, support asynchrone, administration éditoriale et opérationnelle, structure FR/EN, SEO, sauvegardes et surveillance.

Le premier parcours doit être complet dans les langues et formats annoncés par l’offre. La capacité vidéo est nécessaire à la plateforme ; une vidéo non fournie ne doit pas être inventée ni vendue comme disponible. Une leçon peut rester utile grâce à son texte et sa transcription. Le mode de livraison de l’offre réelle doit correspondre aux ressources effectivement produites.

Les services suivants restent différés ou conditionnels : tutorat IA, outils métier connectés, communauté, ateliers, correction humaine, équipes, formateurs externes, abonnement récurrent, promotions/affiliation, rappels marketing, application mobile dédiée et deuxième site Claude. Le modèle peut préserver leur possibilité sans ajouter leurs écrans actifs, leurs coûts ni leurs engagements au lancement.

## Comptes et propriété

Le visiteur peut consulter le public et essayer la première activité. Un compte devient nécessaire pour sauvegarder durablement et avant la création d’une session de paiement. L’identification conserve la destination et, lorsque le navigateur le permet, la saisie temporaire ; son caractère temporaire doit être annoncé.

Un apprenant n’accède qu’à ses commandes, notes, productions et méthodes. L’identifiant d’une ressource ou sa présence dans un lien ne donne aucun droit. Le backend contrôle authentification, permission, propriété et accès pédagogique à chaque action. La dissimulation d’un bouton n’est pas une autorisation.

Acheter un contenu ne crée aucun rôle d’administration. Les permissions éditoriales et financières sont séparées. Les accès opérationnels aux productions privées doivent être limités au besoin justifié, et non accordés automatiquement à tout intervenant.

## Apprentissage et preuves

Conserver des faits distincts : consultation d’une vidéo, activité terminée, quiz réussi, projet autoévalué, projet revu et attestation délivrée. Un événement de lecture ne valide pas une compétence. Une case « terminé » est une déclaration lorsque le critère le prévoit ; elle reste nommée comme telle.

Les quiz correspondent à la version des questions. Les tentatives et leur langue restent historisées ; le backend calcule le résultat à partir des réponses et du barème applicable. Les corrections fournissent une explication.

L’autoévaluation d’un projet enregistre la révision concernée, la grille versionnée, les points déclarés et les erreurs bloquantes. Son libellé est « Autoévaluation renseignée » avec « score déclaré ». La consultation du corrigé ne valide pas la production.

La revue humaine, si un jour activée, nécessite un évaluateur, un périmètre, une révision soumise, une grille, une date et une décision. L’aide IA éventuelle est identifiée comme automatique. Une attestation décrit les preuves réelles ; aucun diplôme ou certification officielle n’est supposé.

## Sauvegarde et conflits

L’interface distingue modification, enregistrement, enregistré et échec. « Enregistré » correspond à une confirmation du backend. Un cache local temporaire reste une sauvegarde de secours sur l’appareil, pas une synchronisation serveur.

Une perte de réseau conserve le texte et propose nouvelle tentative ou copie. Une ancienne réponse réseau ne doit pas masquer une modification plus récente. Deux éditeurs ou deux onglets ne s’écrasent pas : contrôler une révision et proposer une résolution explicite du conflit. Les identifiants utilisateur proviennent de la session, jamais d’un champ client faisant autorité.

La suspension d’un droit ne supprime pas automatiquement notes, productions, méthodes ou historique. Le travail personnel peut rester consultable tandis qu’une ressource pédagogique premium n’est plus accessible. Les durées de conservation sont configurées séparément.

## Méthodes personnelles

Le générateur assemble une instruction à partir d’objectif, contexte, données, destinataire, format et contraintes. Il ne prétend pas appeler ChatGPT. Le texte reste modifiable, copiable et sauvegardable.

Une méthode sauvegardée est une copie appartenant à l’utilisateur. Elle conserve son texte, ses paramètres, sa langue, son origine et sa révision source. Une nouvelle version du modèle propose une nouvelle copie ou une comparaison ; elle ne remplace jamais automatiquement le travail personnel. Une source archivée ne supprime pas sa copie personnelle.

## Commerce et accès

Commande, paiement, remboursement, droit d’accès et progression sont des dimensions distinctes. Les données de l’offre et les conditions sont préparées par le serveur et figées dans les lignes de commande. Le navigateur ne choisit ni le prix autoritaire ni les ressources à ouvrir.

Une confirmation de paiement vérifiée côté serveur autorise l’attribution. Une URL de succès ou une animation ne constitue pas une preuve. Le traitement gère répétitions, concurrence, ordre des événements et reprise après incident sans doubles droits ni confirmations multiples.

Un paiement réussi peut coexister avec une activation retardée. L’interface doit l’expliquer et l’administration permettre une reprise. Un email échoué ne retire pas un droit déjà acquis.

Un droit conserve son origine. Après remboursement du pack A+B, un achat individuel de A continue d’autoriser A. Un remboursement partiel comporte une décision explicite sur ses lignes et ses effets. « Remboursement demandé » et « remboursement confirmé » restent différents. Une ancienne notification ne réactive pas un achat déjà remboursé.

Les fichiers premium utilisent des accès temporaires après autorisation. Révoquer un droit bloque les nouveaux liens ; cela ne garantit pas l’invalidation immédiate de tous les liens déjà émis ni l’effacement des fichiers téléchargés.

## Langues et versions

FR et EN sont liés par l’identité du parcours, de l’activité et de la version pédagogique équivalente. Les achats ouvrent les langues annoncées et les acquis équivalents sont communs. Les médias et positions vidéo restent propres à chaque piste ; les productions et notes de l’utilisateur ne sont pas traduites automatiquement.

Une traduction absente est annoncée. Le sélecteur conserve le contexte quand un équivalent existe et propose explicitement une alternative sinon. Une page dont seul le menu est traduit n’est pas un cours intégralement disponible dans cette langue.

Correction mineure : historique et acquis conservés, changement tracé. Objectif ou évaluation modifiés : nouvelle version pédagogique, exigences supplémentaires expliquées, attestations antérieures inchangées. Une révision signale les traductions et ressources dépendantes à revoir.

## Publication et contenu

Brouillon, à vérifier, prêt, publié, à actualiser et archivé sont des états éditoriaux. Publier une ressource et rendre une offre achetable sont deux opérations distinctes. Une prévisualisation privée ne devient pas une page publique indexable.

Avant vente : contenus annoncés présents, liens et fichiers vérifiés, langues cohérentes, exercices exécutés, corrigés relus, modalités d’accès et assistance explicites. Une date de revue doit correspondre à une revue réelle. Le premier parcours se fonde sur CONTENT_REFERENCE.md ; les jeux de test et exemples y sont fictifs.

L’interface s’inspire de la sobriété demandée, selon DESIGN_SYSTEM.md. Les références externes ne justifient pas de copier leurs avis, statistiques, prix, textes ou promesses. La marque et ses paramètres restent modifiables.

## Mesure et exploitation

Mesurer les événements utiles : activité commencée, première réalisation, méthode sauvegardée, commande confirmée, autoévaluation, revue effective, réutilisation déclarée et demande d’aide. Documenter unité, période, origine et déduplication. Les textes privés ne sont pas envoyés aux outils de mesure.

Une exportation est un indice d’usage ; une réutilisation déclarée reste déclarative. La vue commerciale distingue recettes, taxes, remboursements, frais, coûts renseignés et temps de support. Une contribution estimée n’est pas un bénéfice comptable démontré ; une donnée manquante ne vaut pas zéro.

## Décisions encore nécessaires au lancement

Prix et devise, fiscalité et libellés applicables, durée d’accès, période d’actualisation, support, correction humaine éventuelle, langue initiale, quotas, dépôts et conservation doivent être renseignés dans la configuration et DECISIONS.md. Les valeurs fictives appartiennent uniquement aux profils de développement/test.

L’application peut être construite avec ces paramètres non renseignés ; la commercialisation réelle reste bloquée pour l’offre concernée. Cette séparation permet d’avancer sans inventer les engagements du fondateur.

