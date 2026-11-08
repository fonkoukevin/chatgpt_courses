# Familles d’écrans et comportements

Cette carte reprend E01–E16 du cahier fonctionnel V1 et précise les routes introduites au fil des lots. Le registre comprend aussi les familles futures : l’état vérifié reste celui de STATUS et des preuves. P06 implémente E01–E04 et une lecture textuelle publique d’activité/méthode ; sa recette navigateur est en cours, sans validation anticipée. Toute modification doit être répercutée dans les liens, traductions, tests et métadonnées. Les slugs publics sont localisés ; l’identité métier reste indépendante du titre et de l’URL. Les chemins privés n’autorisent jamais leur contenu.

## Registre central des routes FR/EN

| Famille | Français | Anglais |
| --- | --- | --- |
| E01 Accueil | `/fr` | `/en` |
| E02 Catalogue | `/fr/catalogue` | `/en/catalog` |
| E02 Activité autonome publiée, P06 | `/fr/catalogue?activity={resourceId}&version={versionId}` | `/en/catalog?activity={resourceId}&version={versionId}` |
| E03 Parcours | `/fr/parcours/{slug}` | `/en/courses/{slug}` |
| E04 Guide | `/fr/guides/{slug}` | `/en/guides/{slug}` |
| E05 Méthode source | `/fr/methodes/{slug}` | `/en/methods/{slug}` |
| E06 Identification | `/fr/connexion`, `/fr/inscription`, `/fr/recuperation` | `/en/sign-in`, `/en/sign-up`, `/en/reset` |
| E07 Offres | `/fr/offres` | `/en/offers` |
| E07 Récapitulatif privé | `/fr/commandes/{id}/recapitulatif` | `/en/orders/{id}/summary` |
| E08 État de commande | `/fr/commandes/{id}/statut` | `/en/orders/{id}/status` |
| E09 Apprentissage | `/fr/espace/apprentissage` | `/en/my/learning` |
| E10 Activité | `/fr/apprendre/{courseSlug}/{activitySlug}` | `/en/learn/{courseSlug}/{activitySlug}` |
| E11 Projets et atelier | `/fr/espace/projets`, puis `/{projectId}` | `/en/my/projects`, puis `/{projectId}` |
| E12 Méthodes personnelles | `/fr/espace/methodes`, puis `/{methodId}` | `/en/my/methods`, puis `/{methodId}` |
| E13 Compte | `/fr/compte` | `/en/account` |
| E14 Contenus | `/fr/admin/content` | `/en/admin/content` |
| E15 Éditeur | `/fr/admin/content/{id}/edit` | `/en/admin/content/{id}/edit` |
| E16 Exploitation | `/fr/admin/operations` | `/en/admin/operations` |
| Diagnostic technique P01, local/test | `/fr/dev/foundations` | `/en/dev/foundations` |

- Locales autorisées : `fr` et `en`. `/` oriente vers la préférence autorisée ou la langue par défaut configurée. FR est la valeur de développement, sans décision sur les langues de l’offre réelle.
- L’API reste sous `/api/v1`, sans préfixe de langue. Les noms d’administration `content`, `edit`, `operations` sont conservés dans les deux langues ; leurs libellés d’interface sont traduits.
- Les UUID métier et versions pédagogiques ne dépendent pas des slugs. Le sélecteur résout un équivalent via cette identité, pas par substitution de texte dans l’URL. Une traduction absente propose une alternative explicite.
- `returnTo` n’accepte qu’une destination interne validée ; aucun domaine externe ni donnée sensible. Les routes privées restent contrôlées côté Spring.
- Les sections du compte, aperçus privés et variantes de récupération seront précisées dans leur lot, dans ce registre. Aucun aperçu ne devient indexable. Le récapitulatif est privé et ne confirme pas un paiement.
- En P06, `/fr` et `/en` sont les accueils publics ; l’ancienne sonde d’interface P01 est déplacée dans `/{locale}/dev/foundations`, gardée en local/test avec les autres démonstrations.
- Les détails publics acceptent `?version={versionId}` pour conserver une version publiée déterminée. Les liens d’activité E10 du programme ajoutent `resource={activityId}`, `version={activityVersionId}` et `courseVersion={courseVersionId}` ; les slugs seuls ne remplacent pas cette identité/version.
- P06 garde les lectures publiques `no-store`, sans cookie et sans personnalisation privée. Canonical et équivalents sont préparés ; **noindex/nofollow reste actif jusqu’à P16**. Aucun prix, achat ou paiement opérationnel avant P11/P12.

## Conventions communes

- Une action principale claire par situation, avec destination ou effet réel.
- Chargement sans faux prix, faux droits ni données fictives en production.
- États vide, erreur, interdit, non publié, expiré et indisponible distincts.
- Saisie conservée en cas d’échec ; sauvegarde et conflits visibles.
- Préfixe de langue pour les pages du produit ; traduction et navigation conservant le contexte.
- Public, apprenant et administration partagent les tokens de DESIGN_SYSTEM.md.
- Au clavier et sur mobile, toutes les actions essentielles restent accessibles.
- Les routes de documentation ou de démonstration sont séparées, non publiques en production et non indexables.
- Les autres types de contenus peuvent être des vues filtrées d’E02, sans nouvelle famille artificielle.

## E01 Accueil et orientation par tâche

Routes : /fr et /en. Public, variante connecté. Phase principale P06.

État introduit P06 : accueil SSR alimenté par les publications/facettes réelles, activité gratuite choisie dans l’API, exemples originaux signalés comme fictifs. Sans activité ouverte, le message et le lien catalogue restent honnêtes. La reprise privée attend le service d’apprentissage ; aucune fausse reprise n’est déduite d’une session. Les FAQ affichées proviennent d’une fiche COURSE/GUIDE publiée avec attribution de leur source. Recette navigateur P06 encore en cours.

Présenter le résultat utile de la plateforme, une recherche et des entrées par tâche. Montrer un exemple original de réalisation, les ressources réellement disponibles, quelques parcours et la première activité ouverte. Action principale : « Essayer une activité » ; secondaire : explorer le catalogue. Pour un utilisateur connecté, proposer une reprise réelle.

Le contenu provient des ressources publiées ; les catégories vides ne doivent pas paraître alimentées. Les annonces commerciales viennent de l’offre configurée, pas d’un texte indépendant. En cas de service indisponible, conserver une navigation utile sans inventer des résultats.

Composants : PublicHeader, TaskNavigation, CourseCard, ExampleResult, FAQ et Footer. Le mobile donne accès rapidement à la recherche et à l’essai, sans dépendre d’un grand visuel décoratif.

## E02 Catalogue et recherche transversale

Routes introduites : /fr/catalogue et /en/catalog ; paramètres `q`, `type`, `goal`, `level`, `locale`, `access`, `page`, `pageSize`, `sort`. Page 0-based, tri TITLE/RECENT déterministe ; filtres et retour à la liste conservés dans une URL validée. Phase P06.

Une activité autonome réellement publiée se consulte dans cette famille avec `activity={resourceId}&version={versionId}` ; sa version est obligatoire et ne devient pas implicitement la plus récente. `returnTo` accepte uniquement une URL de catalogue interne avec filtres autorisés. La langue de contenu peut différer de celle de l’interface ; les badges et la requête la conservent explicitement.

Résultats de parcours, exercices, méthodes et guides avec type, objectif, niveau, durée estimée si connue, langue et accès. Filtres combinables et réinitialisables ; tri déterministe ; retour à la liste préservant les paramètres. La recherche initiale peut utiliser PostgreSQL ; aucun moteur externe ni recherche sémantique n’est requis.

Prévoir chargement, résultat, zéro résultat et panne. La panne n’affiche pas un catalogue fictif comme résultat de recherche. Proposer catégories et nouvelle tentative. Les résultats privés/non publiés sont exclus du service public, et non seulement masqués par CSS.

Composants : SearchField, FilterGroup, ActiveFilters, ResultCard, Pagination, EmptyState et RetryState. Panneau de filtres sur mobile.

## E03 Fiche de parcours

Routes : /fr/parcours/{slug} et /en/courses/{slug}. Phase P06, raccord commercial P11/P12.

P06 lit la fiche publiée et son programme de métadonnées. Chaque module/activité conserve la version enregistrée dans la composition, même si une version plus récente existe. Les contenus PROTECTED ne livrent aucun bloc, corrigé ou quiz au HTML public. L’encart d’accès explique l’absence d’offre/paiement ; aucun tarif ou droit n’est inventé. Les langues manquantes, dépassées ou retirées sont présentées comme telles, sans remplacer la ressource.

Ordre : livrable attendu, bénéficiaire, aperçu, programme, prérequis, outils nécessaires, modalités de vérification, langues, conditions de l’offre, FAQ. Le programme expose activités ouvertes, accessibles, verrouillées et prérequis.

L’action dépend du contexte : commencer gratuitement, voir l’offre ou reprendre. L’accès existant rend la reprise prioritaire. Une ressource peut rester consultable par un client existant alors que sa vente est suspendue. Version remplacée et modifications pédagogiques ont une explication et un lien appropriés.

La durée estimée vient d’un champ éditorial vérifié ; elle n’est pas fabriquée pour remplir une carte. Les langues et services disponibles reflètent la configuration réelle.

Composants : CourseHero, Curriculum, AccessNotice, OfferSummary, VersionNotice et ResourceList.

## E04 Guide et démonstration publique

Routes : /{locale}/guides/{slug}. Phase P06, contenu P18.

P06 rend la publication réelle, ses sources CMS et sa date de revue publiée. La consultation textuelle des modèles de méthode utilise aussi `/fr/methodes/{slug}` et `/en/methods/{slug}` ; le générateur et la conservation personnelle restent P07. Les contenus et médias définitifs P18 ne sont pas déduits de la présence d’un écran ou d’une fixture.

Question précise, sommaire, explication, exemple, contrôles et exercice associé. Les références présentes sont réelles et utiles. La date de revue est une preuve éditoriale enregistrée. Les blocs copiables conservent leur source ; le succès de copie dépend de l’action réelle.

Le signalement identifie contenu et version. Un guide archivé ou remplacé explique l’état et oriente vers une ressource pertinente ; il ne renvoie pas silencieusement vers une page sans rapport.

Signalement P06 : préparation et copie d’un contexte resourceId/versionId/revisionId/langue, texte local facultatif, aucun envoi ni persistance support annoncés. Le succès de copie attend l’acquittement réel du presse-papiers.

Composants : ArticleLayout, TableOfContents, CopyBlock, ReferenceList, VersionNotice et ReportIssue.

## E05 Fiche de méthode et générateur

Routes : /fr/methodes/{slug}, /en/methods/{slug}. Phase P07.

Présenter besoin, variables, entrées, résultat attendu, limites, contrôles et exemple. Formulaire avec objectif, contexte, données, destinataire, format et contraintes. Préparer une instruction modifiable, la copier, la réinitialiser et la sauvegarder.

Le générateur assemble du texte ; il ne fait pas croire qu’une IA a exécuté la tâche. La sauvegarde durable requiert un compte ; l’essai temporaire peut être conservé durant l’identification si le navigateur le permet. Le modèle premium est autorisé côté serveur avant exposition de son contenu.

États : champs invalides, copie refusée, sauvegarde en cours/échouée, conflit et accès requis. Composants : MethodBuilder, VariableFields, PromptEditor, SaveStatus et AccessNotice.

## E06 Identification

Routes : connexion/sign-in, inscription/sign-up, récupération/reset sous préfixe de langue. Phase P04.

Connexion, inscription et récupération expliquent le compte, conservent une destination de retour validée et prennent en charge la saisie temporaire. Utiliser uniquement l’identité Spring Security prévue dans ARCHITECTURE.md et API_CONTRACTS.md.

Champs avec labels, messages ciblés, afficher/masquer le mot de passe et soumission maîtrisée. Les erreurs publiques évitent les divulgations inutiles de comptes. Prévoir lien expiré/invalide, session expirée, erreur réseau, token CSRF renouvelé et retour après identification. Une redirection fournie par l’utilisateur ne peut pas conduire vers un domaine arbitraire.

Composants : AuthLayout, FormField, PasswordField, FormError et ResumeContext.

## E07 Offres et récapitulatif

Routes : /fr/offres, /en/offers et étape de récapitulatif ; Stripe Checkout reste le service externe de paiement. Phases P11/P12.

Présenter produit, parcours inclus, langues, durée d’accès, actualisations, accompagnement, total applicable et outils externes. Une offre non complète est visible mais non achetable si cette présentation est utile ; elle précise ce qui manque sans annoncer un faux prix.

Avant création de session, identification puis récapitulatif préparé par le backend. Traiter achat existant, commande en cours, double clic et offre modifiée. Les lignes/conditions acceptées sont figées à l’achat. Aucun formulaire local ne collecte les données de carte.

Composants : OfferCard, OfferDetails, OrderSummary, AvailabilityNotice et CheckoutAction.

## E08 État de commande

Routes : /fr/commandes/{id}/statut et /en/orders/{id}/status. Propriétaire connecté. P12/P13.

Quatre situations : paiement en vérification ; paiement confirmé et accès prêt ; paiement confirmé avec activation retardée ; paiement non confirmé ou interrompu. Chaque vue affiche référence, explication, aide et action adaptée.

La page interroge le serveur ; le paramètre « success » ne crée aucun droit. Un retour « cancel » ne prouve pas un échec financier. La nouvelle tentative intervient après contrôle du statut existant. Email manquant et activation retardée restent deux incidents différents.

Composants : OrderStatus, OrderReference, AccessActivationState et ContextualHelp.

## E09 Mon apprentissage

Routes : /fr/espace/apprentissage et /en/my/learning. Phase P08.

Dernier travail, prochaine activité, parcours acquis/commencés, projets et méthodes récents. Action principale : reprendre. L’état vide propose une activité ouverte et une entrée par objectif.

Afficher des nombres et statuts exacts : lecture/consultation, activité terminée, quiz réussi, projet autoévalué ou revu. Un cours inaccessible temporairement ne fait pas disparaître son historique. Diagnostic court facultatif : règles explicables, aucun achat imposé, résultat modifiable ; son absence ne bloque pas le socle.

Composants : ResumeCard, LearningList, ProgressSummary, ProjectCard et MethodPreview. Utiliser des données privées non mises en cache publiquement.

## E10 Leçon et activité

Routes : /fr/apprendre/{courseSlug}/{activitySlug} et /en/learn/{courseSlug}/{activitySlug}. Lecture textuelle ouverte P06 ; apprentissage/progression P08, médias P10.

P06 ajoute aux liens du programme `resource`, `version` et `courseVersion`. Le loader vérifie que l’activité et sa version appartiennent au programme de cette version de parcours, puis lit la version exacte. Une activité plus récente ne remplace pas un ancien lien de programme. Hors parcours, l’activité autonome utilise E02 avec son couple resourceId/versionId. Texte/exercice/checklist de la publication gratuite sont utilisables ; checklist locale déclarative, sans score calculé, progression, projet ou correction de quiz prétendus. Une activité protégée reste limitée aux informations publiques ; le corps n’est jamais envoyé puis caché.

Programme et prérequis ; objectif et travail attendu ; vidéo si disponible, texte, sous-titres, transcription ; dossier et exercice ; quiz ; aide et signalement. Les notes sont personnelles. L’activité ouverte reste utilisable sans compte ; la conservation durable passe par l’identification.

Quiz incorrect avec explication et nouvelle tentative. Progression attribuée selon le critère, sans valider automatiquement un projet. Position sauvegardée par média, tandis que les acquis équivalents sont communs aux traductions. Sans vidéo, texte utilisable et message honnête.

Les pertes réseau et changements d’activité ne jettent pas la saisie. Le programme devient un panneau mobile ; prochaine action et état de sauvegarde restent accessibles.

## E11 Projets et vérification

Routes : /fr/espace/projets et /en/my/projects, puis {projectId}. Phase P09, pièces jointes P10.

Liste/reprise, recherche simple et état vide. Atelier réunissant dossier fictif, ressources, livrable, texte structuré, grille, corrigé et historique utile. La version textuelle est obligatoire ; dépôt de fichier uniquement lorsqu’il est configuré et sécurisé.

États : brouillon, prêt pour autoévaluation, autoévaluation renseignée, à réviser. L’évaluation conserve révision, grille et provenance. La révélation du corrigé explique son usage et ne termine pas le projet. Une revue humaine est une extension distincte, désactivée tant que l’offre et la capacité ne sont pas définies.

Gérer sauvegarde, échec, copie de secours et conflit sans écrasement. Une révocation de cours ne supprime pas la production du propriétaire.

Composants : ProjectEditor, BriefPanel, RubricChecklist, EvaluationSummary, RevisionConflict et AnswerReveal.

## E12 Mes méthodes

Routes : /fr/espace/methodes et /en/my/methods. Phase P07.

Copies personnelles avec nom, tâche, catégories, langue, note, source et version. Ouvrir, renommer, adapter, dupliquer, copier, supprimer après confirmation. Recherche et état vide utile.

Une source actualisée propose une évolution sans écraser le texte ; une source archivée laisse la copie intacte. Les notes ne suivent pas automatiquement la langue de l’interface. Les écritures sont versionnées et propriétaires.

Composants : SavedMethodCard, MethodEditor, SourceVersionNotice, SaveStatus et ConfirmationDialog.

## E13 Compte, achats et aide

Routes : /fr/compte et /en/account, avec sections profil, achats, attestations et aide. Phase P14, identité P04, commerce P11–P13.

Préférences, langue, commandes, droits, demandes de remboursement, attestations et support. La commande conserve les conditions achetées. Paiement, remboursement et accès sont nommés séparément. La documentation téléchargeable ne se présente pas comme facture légale si ce document n’est pas réellement produit selon la configuration commerciale.

Une attestation indique parcours/version, date et nature des preuves ; elle reste privée par défaut. Le support contextualisé conserve la version de la leçon sans transmettre automatiquement les notes privées. Les demandes relatives au compte/données ont des états et appliquent une politique définie ; ne pas supprimer aveuglément des pièces conservées pour une obligation documentée.

## E14 Administration des contenus

Routes : /{locale}/admin/content ou équivalents centralisés. Phase P05.

Liste de parcours, activités, guides, méthodes et ressources, avec type, statut, langue, version, dernière revue et dépendances. Filtres, recherche, pagination ; créer, éditer, prévisualiser, dupliquer et archiver.

Un contenu déjà utilisé n’est pas effacé silencieusement. Son retrait expose les dépendances et l’effet sur des clients existants. Les permissions sont vérifiées côté serveur. L’administration réelle affiche les données de la base ; les démonstrations restent dans un profil distinct.

## E15 Éditeur et révisions

Routes : /{locale}/admin/content/{id}/edit et variantes d’aperçu autorisées. Phase P05, média P10, contenu P18.

Édition de contenu, ordre des modules/activités, médias, ressources, quiz, grilles, prérequis, traductions, métadonnées, aperçu et historique. Des commandes clavier permettent de réordonner sans dépendre du glisser-déposer.

États éditoriaux : brouillon, à vérifier, prêt, publié, à actualiser, archivé. La revue constate réellement objectif, fichiers, exercice et corrigé ; les traductions dépendantes sont signalées lors d’une révision. Conflit concurrent explicite ; retour à une publication antérieure par nouvelle opération tracée. Publier n’active pas une offre commerciale.

## E16 Exploitation et support

Routes : /{locale}/admin/operations et onglets/sections. Phase P15.

Commandes, droits par origine, remboursements, tickets, emails et traitements en erreur, indicateurs et journal. Les opérations de reprise utilisent les services métier idempotents ; elles n’écrivent pas directement un statut financier souhaité.

Les actions sensibles précisent objet et effet, demandent un motif adapté et conservent auteur/date/résultat. L’éditeur de contenu ne reçoit pas des permissions financières par défaut. Les indicateurs sont calculés sur des sources définies, par devise/période ; coûts inconnus et zéro sont distincts.

Une erreur de leçon ouvre un dossier lié à sa version ; sa correction suit E15 sans modifier les copies personnelles ni les preuves passées.

## Variantes utilitaires

404, erreur générale récupérable, accès refusé, session expirée, ressource indisponible, langue absente, offre suspendue, contact et informations du site sont rattachés aux familles précédentes. Les pages d’information juridique utilisent les données vérifiées du propriétaire et une rédaction à valider ; le code ne fabrique pas une entreprise, une politique de remboursement ou une certification.

