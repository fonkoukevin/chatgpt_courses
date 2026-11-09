# Familles d’écrans et comportements

Cette carte reprend E01–E16 du cahier fonctionnel V1 et précise les routes introduites au fil des lots. Le registre comprend aussi les familles futures : l’état vérifié reste celui de STATUS et des preuves. P06 implémente E01–E04 et une lecture textuelle publique d’activité/méthode, validées localement avec six scénarios navigateur et 35 captures finales examinées. Le générateur E05 et la bibliothèque E12 de P07 sont également validés localement ; résultats et limites dans [evidence/P07.md](evidence/P07.md). Toute modification doit être répercutée dans les liens, traductions, tests et métadonnées. Les slugs publics sont localisés ; l’identité métier reste indépendante du titre et de l’URL. Les chemins privés n’autorisent jamais leur contenu.

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
| E09 Programme inscrit | `/fr/espace/apprentissage/{enrollmentId}` | `/en/my/learning/{enrollmentId}` |
| E10 Activité | `/fr/apprendre/{courseSlug}/{activitySlug}` | `/en/learn/{courseSlug}/{activitySlug}` |
| E11 Projets et atelier | `/fr/espace/projets`, puis `/{projectId}` | `/en/my/projects`, puis `/{projectId}` |
| E11 Import volontaire du brouillon de projet, P09 | `/fr/espace/projets/nouveau?draft={uuid}` | `/en/my/projects/new?draft={uuid}` |
| E12 Bibliothèque personnelle | `/fr/espace/methodes` | `/en/my/methods` |
| E12 Nouvelle méthode/import explicite | `/fr/espace/methodes/nouvelle`, `?draft={uuid}` facultatif | `/en/my/methods/new`, `?draft={uuid}` facultatif |
| E12 Détail personnel | `/fr/espace/methodes/{methodId}` | `/en/my/methods/{methodId}` |
| E13 Compte | `/fr/compte` | `/en/account` |
| E13 Attestations P14 et détail privé | `/fr/compte/attestations[/{attestationId}]` | `/en/account/attestations[/{attestationId}]` |
| E13 Aide P14 et conversation privée | `/fr/compte/aide[/{ticketId}]` | `/en/account/help[/{ticketId}]` |
| E13 Demandes relatives aux données P14 | `/fr/compte/donnees` | `/en/account/data` |
| E13 Commandes propriétaires, P11 | `/fr/commandes` | `/en/orders` |
| E13 Suivi des remboursements d’une commande, P13 | `/fr/commandes/{orderId}/remboursements` | `/en/orders/{orderId}/refunds` |
| E13 Origines et historique des accès, P13 | `/fr/compte/acces` | `/en/account/access` |
| E14 Contenus | `/fr/admin/content` | `/en/admin/content` |
| E15 Éditeur | `/fr/admin/content/{id}/edit` | `/en/admin/content/{id}/edit` |
| E16 Exploitation | `/fr/admin/operations` | `/en/admin/operations` |
| E16 Suivi des emails P10 | `/fr/admin/notifications` | `/en/admin/notifications` |
| E16 Demandes et exécutions de remboursement, P13 | `/fr/admin/operations/refunds` | `/en/admin/operations/refunds` |
| E16 Examen d’une demande, P13 | `/fr/admin/operations/refunds/{requestId}` | `/en/admin/operations/refunds/{requestId}` |
| E16 Suivi d’une exécution, P13 | `/fr/admin/operations/refunds/operations/{operationId}` | `/en/admin/operations/refunds/operations/{operationId}` |
| Diagnostic technique P01, local/test | `/fr/dev/foundations` | `/en/dev/foundations` |

- Locales autorisées : `fr` et `en`. `/` oriente vers la préférence autorisée ou la langue par défaut configurée. FR est la valeur de développement, sans décision sur les langues de l’offre réelle.
- L’API reste sous `/api/v1`, sans préfixe de langue. Les noms d’administration `content`, `edit`, `operations` sont conservés dans les deux langues ; leurs libellés d’interface sont traduits.
- Les UUID métier et versions pédagogiques ne dépendent pas des slugs. Le sélecteur résout un équivalent via cette identité, pas par substitution de texte dans l’URL. Une traduction absente propose une alternative explicite.
- `returnTo` n’accepte qu’une destination interne validée ; aucun domaine externe ni donnée sensible. Les routes privées restent contrôlées côté Spring.
- Les sections du compte, aperçus privés et variantes de récupération seront précisées dans leur lot, dans ce registre. Aucun aperçu ne devient indexable. Le récapitulatif est privé et ne confirme pas un paiement.
- En P06, `/fr` et `/en` sont les accueils publics ; l’ancienne sonde d’interface P01 est déplacée dans `/{locale}/dev/foundations`, gardée en local/test avec les autres démonstrations.
- Les détails publics acceptent `?version={versionId}` pour conserver une version publiée déterminée. Les liens d’activité E10 du programme ajoutent `resource={activityId}`, `version={activityVersionId}` et `courseVersion={courseVersionId}` ; les slugs seuls ne remplacent pas cette identité/version.
- P06 garde les lectures publiques `no-store`, sans cookie et sans personnalisation privée. Canonical et équivalents sont préparés ; **noindex/nofollow reste actif jusqu’à P16**. Aucun prix, achat ou paiement opérationnel avant P11/P12.
- P07 valide les retours d’identification E12 par famille de route, UUID et paramètres autorisés, puis traduit `/fr/espace/methodes/nouvelle` en `/en/my/methods/new`. Le query `draft` ne contient qu’un UUID temporaire, jamais le texte ou un propriétaire. Filtres de liste `q/category/page/pageSize` bornés ; pas de paramètres d’identité, doublons, traversées ou domaines externes.
- P13 ajoute les retours privés exacts de remboursement et d’origines d’accès. Les listes acceptent `page/pageSize` ; l’administration ajoute `view=requests|operations`, `state` cohérent avec cette vue et `orderId` UUID. Les détails refusent tout paramètre. Le passage FR/EN conserve les mêmes identifiants, sans changer de dossier ni inclure de motif dans l’URL.

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

État introduit P06 : accueil SSR alimenté par les publications/facettes réelles, activité gratuite choisie dans l’API, exemples originaux signalés comme fictifs. Sans activité ouverte, le message et le lien catalogue restent honnêtes. La reprise privée attend le service d’apprentissage ; aucune fausse reprise n’est déduite d’une session. Les FAQ affichées proviennent d’une fiche COURSE/GUIDE publiée avec attribution de leur source. Recette P06 validée localement et régression publique réussie en P07 ; voir [preuve P07](evidence/P07.md).

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

P06 rend la publication réelle, ses sources CMS et sa date de revue publiée. La consultation textuelle des modèles de méthode utilise aussi `/fr/methodes/{slug}` et `/en/methods/{slug}` ; générateur et conservation personnelle sont complétés en P07 ci-dessous. Les contenus et médias définitifs P18 ne sont pas déduits de la présence d’un écran ou d’une fixture.

Question précise, sommaire, explication, exemple, contrôles et exercice associé. Les références présentes sont réelles et utiles. La date de revue est une preuve éditoriale enregistrée. Les blocs copiables conservent leur source ; le succès de copie dépend de l’action réelle.

Le signalement identifie contenu et version. Un guide archivé ou remplacé explique l’état et oriente vers une ressource pertinente ; il ne renvoie pas silencieusement vers une page sans rapport.

Signalement P06 : préparation et copie d’un contexte resourceId/versionId/revisionId/langue, texte local facultatif, aucun envoi ni persistance support annoncés. Le succès de copie attend l’acquittement réel du presse-papiers.

Composants : ArticleLayout, TableOfContents, CopyBlock, ReferenceList, VersionNotice et ReportIssue.

## E05 Fiche de méthode et générateur

Routes : `/fr/methodes/{slug}`, `/en/methods/{slug}`, avec `?version={versionId}` pour le snapshot publié exact. Interface P07 validée localement ; voir [evidence/P07.md](evidence/P07.md).

La publication réelle fournit objectif, prérequis et version, puis sa `MethodDefinition` localisée : cas d’usage, entrées nécessaires, étapes, instruction de départ, exemple, vérifications et limites. Cette définition appartient au document éditorial, sans extraction de paragraphes. Un article historique sans définition reste lisible avec un générateur explicitement non configuré ; une nouvelle publication de modèle exige sa complétude. Une source PROTECTED ou indisponible ne livre pas la définition réservée et ne propose pas un faux achat avant P11.

Le formulaire présente objectif, contexte, données disponibles, destinataire, format, contraintes et points à clarifier. Objectif/données/format sont requis à l’assemblage ; contexte facultatif. Le texte final reste éditable et indépendant du dernier jeu de paramètres assemblé. Changer un champ signale l’écart sans effacer une retouche ; reconstruction et réinitialisation sont explicites. La copie attend le succès du presse-papiers et propose une sélection manuelle en cas de refus. Aucun bouton ne prétend exécuter l’instruction dans ChatGPT.

Un visiteur peut pratiquer et copier. L’action de sauvegarde peut conserver un essai non sensible pendant deux heures dans `sessionStorage`, puis revenir à E12 après identification ; stockage indisponible et expiration sont expliqués. L’import sous le compte effectivement affiché demande une action volontaire. Une saisie déjà associée à un compte n’est pas transformée en brouillon anonyme après changement de session. L’enregistrement durable appelle le serveur sous CSRF et contexte de compte attendu ; après une création confirmée, les sauvegardes suivantes mettent à jour la même copie avec son ETag.

États implémentés : chargement d’identité, visiteur, compte connu/changé, définition absente, accès réservé, champs invalides, copie refusée, modification, sauvegarde/échec, conflit personnel ou source actualisée. Le travail est conservé en cas de refus pour copie/comparaison ; aucune réponse 201 ancienne ne doit confirmer une autre version ou un autre compte. Composants : `PublicMethodSource`, `MethodGenerator`, contrôles de copie et confirmation, états d’accès et de source. La recette Chromium et l’examen des captures sont consignés séparément des tests client simulés dans la preuve P07.

## E06 Identification

Routes : connexion/sign-in, inscription/sign-up, récupération/reset sous préfixe de langue. Phase P04.

Connexion, inscription et récupération expliquent le compte, conservent une destination de retour validée et prennent en charge la saisie temporaire. Utiliser uniquement l’identité Spring Security prévue dans ARCHITECTURE.md et API_CONTRACTS.md.

Champs avec labels, messages ciblés, afficher/masquer le mot de passe et soumission maîtrisée. Les erreurs publiques évitent les divulgations inutiles de comptes. Prévoir lien expiré/invalide, session expirée, erreur réseau, token CSRF renouvelé et retour après identification. Une redirection fournie par l’utilisateur ne peut pas conduire vers un domaine arbitraire.

Composants : AuthLayout, FormField, PasswordField, FormError et ResumeContext.

## E07 Offres et récapitulatif

Routes : /fr/offres, /en/offers et étape de récapitulatif ; Stripe Checkout reste le service externe de paiement. Phases P11/P12.

P11 est vérifié localement : listes/détails d’offres, conditions versionnées, préparation idempotente après consentement, récapitulatifs `/fr/commandes/{id}/recapitulatif` et `/en/orders/{id}/summary`, listes privées et refus d’un autre propriétaire. Offre changée et configuration incomplète demandent une revue explicite ; couverture existante et chevauchement de pack restent distincts du total. Checkout désactivé avec explication avant P12. Huit scénarios Chromium et vingt captures examinées ; [preuves et limites](evidence/P11.md).

Présenter produit, parcours inclus, langues, durée d’accès, actualisations, accompagnement, total applicable et outils externes. Une offre non complète est visible mais non achetable si cette présentation est utile ; elle précise ce qui manque sans annoncer un faux prix.

Avant création de session, identification puis récapitulatif préparé par le backend. Traiter achat existant, commande en cours, double clic et offre modifiée. Les lignes/conditions acceptées sont figées à l’achat. Aucun formulaire local ne collecte les données de carte.

Composants : OfferCard, OfferDetails, OrderSummary, AvailabilityNotice et CheckoutAction.

## E08 État de commande

Routes : /fr/commandes/{id}/statut et /en/orders/{id}/status. Propriétaire connecté. P12/P13.

Quatre situations : paiement en vérification ; paiement confirmé et accès prêt ; paiement confirmé avec activation retardée ; paiement non confirmé ou interrompu. Chaque vue affiche référence, explication, aide et action adaptée.

La page interroge le serveur ; le paramètre « success » ne crée aucun droit. Un retour « cancel » ne prouve pas un échec financier. La nouvelle tentative intervient après contrôle du statut existant. Email manquant et activation retardée restent deux incidents différents.

Composants : OrderStatus, OrderReference, AccessActivationState et ContextualHelp.

P12 implémente `PersonalOrderPaymentStatus` et `CheckoutAction` : lectures privées bornées à douze contrôles espacés de deux secondes, reprise volontaire, refus d’un autre propriétaire et invalidation des réponses après changement de compte. PAID sans READY montre une activation retardée ; seul PAID/READY propose les ressources comprises. Un conflit d’offre, de conditions ou d’ETag retire le formulaire Checkout et demande une revue. La notification possède son propre état NONE/PENDING/SENT/ISSUE ; SENT signifie acceptation SMTP, pas lecture par le destinataire. Le niveau réellement vérifié et les limites fournisseur sont consignés dans [P12](evidence/P12.md).

## E09 Mon apprentissage

Routes P08 : `/fr/espace/apprentissage`, `/en/my/learning` et détail d’inscription par UUID selon le registre. Interface/services implémentés ; état réel des validations dans [evidence/P08.md](evidence/P08.md).

Le tableau de bord lit reprise accessible, parcours commencés, compteurs distincts et cinq méthodes récentes autorisées au plus. P09 ajoute une section indépendante de trois projets récents via la liste propriétaire réelle : titre, état déclaré, source/version, date et lien vers la bibliothèque. Chargement, erreur et indisponibilité restent distincts du vide ; les réponses d’un ancien compte ne remplacent pas les données courantes. Un compte neuf reçoit un état vide utile, sans activité ou pourcentage inventé. Action principale : reprendre la dernière activité accessible de la version inscrite ; si elle est retirée, choisir une autre activité accessible de ce même snapshot. Le détail conserve programme, ordre, versions et dénominateur. « Commencé » ne signifie jamais « acquis » : aucune donnée commerciale n’est déduite de l’inscription avant les droits P11/P12.

Lecture déclarée, activité déclarée terminée et quiz réussi ont des compteurs séparés. `ProgressTotals.projectAvailability=NOT_AVAILABLE` reste le fait agrégé non défini ; il ne signifie pas que les projets personnels P09 sont indisponibles et ne produit aucun taux de compétence. Le total est figé par versions d’activité distinctes, partagé FR/EN, y compris les activités protégées ou retirées. Un accès indisponible ne supprime pas historique, notes ou tentatives. ACTIVE/PROTECTED/UNAVAILABLE reflètent l’état réel ; aucun achat ou accès commercial expiré/révoqué n’est fabriqué. Diagnostic facultatif non activé.

Composants : `LearningDashboard`, `LearningEnrollment`, résumés de progrès/méthodes et états d’accès. SSR privé sans cache partagé, propriétaire recontrôlé par Spring. Retour d’identification et langue du détail d’inscription utilisent un UUID validé ; aucun texte privé dans les paramètres.

## E10 Leçon et activité

Routes : `/fr/apprendre/{courseSlug}/{activitySlug}` et `/en/learn/{courseSlug}/{activitySlug}`. Lecture ouverte P06 complétée par apprentissage, quiz et notes P08 ; médias réels P10.

P06 ajoute aux liens du programme `resource`, `version` et `courseVersion`. Le loader vérifie que l’activité et sa version appartiennent au programme de cette version de parcours, puis lit la version exacte. Une activité plus récente ne remplace pas un ancien lien. Hors parcours, l’activité autonome utilise E02 avec son couple resourceId/versionId. La checklist reste locale et déclarative ; P08 ajoute séparément quiz et faits persistés. Une activité protégée reste limitée aux informations publiques. Le contrôle P08 agrège aussi parcours/module/activité : un parent retiré ou sa traduction absente neutralise le corps enfant, sans masquer l’indisponibilité par une publication plus ancienne.

Programme, position, objectif, prérequis, explication, exemple, pratique, ressources et navigation précédente/suivante sont raccordés au programme publié ; sur mobile, le programme utilise un panneau accessible. La première activité FREE reste utilisable avant compte : correction formative réelle après soumission, explicitement non conservée, aucune bonne réponse dans la lecture initiale. L’action authentifiée de conservation crée une tentative durable liée à l’inscription, sous contexte de compte attendu ; aucune réponse ou score client ne fait autorité.

Le résultat explique chaque réponse et affiche points/politique réels ; nouvelle tentative selon règle éditoriale, limite commune FR/EN de cette version. Historique : questions, correction, politique, version, langue et date conservées malgré nouvelle publication. Une réussite ne coche ni activité terminée ni projet. Visite de reprise, lecture déclarée et fin déclarée restent explicites et indépendantes, sans blocage par un temps vidéo ou un score.

Les notes sont propriétaires, uniques par version d’activité et gardent leur langue originale. Sauvegarde confirmée par ETag propre, saisie maintenue sur panne/expiration/412 ; comparer, copier, recharger ou conserver volontairement face à la nouvelle révision. Les réponses retardées et changements de compte suivent les garanties P07 ; aucune mutation automatique sous un autre compte. Les favoris restent différés.

P10 raccorde `LearningMediaPort` au registre vidéo et ajoute les ressources éditoriales à accès temporaire. Le fournisseur `local-test`, désactivé par défaut, sert seulement un MP4 importé explicitement côté serveur ; le lecteur indique clairement ce statut. Texte, transcription et sous-titres fournis restent accessibles lorsque le fournisseur manque. La position se conserve volontairement par propriétaire/mediaId et langue, avec reprise explicite et conflit de révision ; elle ne valide aucune activité ni projet. Aucune durée ou transcription n’est fabriquée pour un média absent. Ce raccordement est validé en intégration locale P10 ; aucun fournisseur vidéo de production ou film de formation n’est validé par cette recette : [preuve et limites](evidence/P10.md).

P09 raccorde l’atelier de projet quand l’activité FREE publiée possède une politique complète : préparation textuelle avant compte, puis conservation volontaire dans l’espace propriétaire. Un ancien contenu sans politique ne reçoit pas une fausse grille par défaut. Composants : `LearningActivity`, `ActivityProgramme`, `ActivityNavigation`, `ActivityProgress`, `ActivityNotes`, `ActivityQuiz` et historique/résultat de quiz. Les preuves P08 restent historiques ; le périmètre technique du raccordement P09 est validé localement, avec ses limites dans [evidence/P09.md](evidence/P09.md).

## E11 Projets et vérification

Routes : `/fr/espace/projets` et `/en/my/projects`, puis `/{projectId}` ; import `nouveau`/`new` avec UUID de brouillon selon le registre. Périmètre technique des interfaces et services P09 validé localement ; résultats, limites et refus d’accusé isolé non reproduit sont conservés dans [evidence/P09.md](evidence/P09.md). Pièces jointes TXT P10 validées en intégration locale, PDF indisponible ; contenu final P18 encore à fournir.

La liste propriétaire est paginée, recherchable par texte et filtrable par état déclaré ou activité/version. Elle expose des résumés, sans charger toutes les productions. L’atelier sépare dossier, rédaction, vérification et corrigé. Sept sections structurées et texte collé indépendant restent modifiables sans insérer un exemple à leur place. Le dossier suit la version exacte ; changement de langue d’interface conserve le même projet et sa langue personnelle. Un anonyme peut préparer un texte et conserver volontairement un brouillon non sensible deux heures dans l’onglet ; l’identification présente le compte et exige un import explicite, sans création automatique.

Le stade sauvegardé distingue brouillon et prêt pour autoévaluation ; prêt exige du texte, sans contrôle automatique de qualité. L’état dérivé ajoute autoévaluation renseignée ou à réviser. La grille capturée expose vingt critères à un point en cinq catégories, quatre déclarations d’erreurs et un seuil explicite configurable. Les commentaires restent personnels. Le résultat affiche score déclaré, seuil, erreurs, date et provenance ; il ne prétend pas vérifier les montants ou la vérité de la proposition. Une nouvelle rédaction conserve les anciennes évaluations en historique, avec avertissement lorsqu’elles concernent une autre révision.

L’ETag couvre le texte et son stade, séparément du statut courant et du contexte. Une sauvegarde identique peut garder le même tag. Les retouches faites pendant une requête restent modifiées ; panne, session expirée et compte changé conservent la saisie avec copie de secours. Un conflit propose lecture de la version serveur, comparaison et choix explicites, sans écrasement automatique ni retry sous un autre compte. Les historiques paginés chargent d’abord des résumés, puis le détail choisi de production ou d’évaluation.

Le corrigé s’ouvre sur action volontaire selon EXPLICIT ou après autoévaluation de la révision personnelle précise selon AFTER_SUBMISSION, sans score minimal imposé. Sa consultation est tracée et ne termine pas le projet. Publication et accès sont revérifiés à chaque lecture/rejeu ; pour un projet lié à une inscription, la chaîne parcours/module/activité est aussi contrôlée. Retrait, traduction indisponible ou protection peut bloquer dossier/corrigé, tout en conservant production, grille et anciennes preuves du propriétaire. Une activité explicitement FREE reste permise dans un parcours PROTECTED selon P08. La revue humaine reste désactivée.

L’onglet fichiers P10 charge sa politique serveur avant dépôt. Choix en mémoire, autorisation/transfert et confirmation sont distincts ; un résultat REJECTED, EXPIRED ou une réponse impossible à vérifier n’annonce jamais un fichier prêt. La pièce jointe ne remplace pas le texte. Le téléchargement contrôlé utilise un blob temporaire sans cookie S3 ; propriété et compte attendu sont revérifiés. Si le stockage n’est pas configuré, formats/limites et indisponibilité sont affichés, le texte reste utilisable.

Composants présents : `ProjectList`, `ProjectPreparation`, `ProjectDraftImport`, `ProjectEditor`, `ProjectBriefPanel`, `ProjectAssessment`, `EvaluationSummary`, `ProjectHistory` et `ProjectSolution`. Le dossier contextuel utilise un panneau sur écran étroit ; sa recette visuelle finale n’est pas déduite de la présence de ces composants.

## E12 Mes méthodes

Routes : bibliothèque `/fr/espace/methodes` et `/en/my/methods`, création `nouvelle`/`new`, détail par UUID selon le registre. Interface et services P07 validés localement.

Liste/recherche paginée sur titre, notes ou catégorie du seul propriétaire, filtre de catégorie exact et ordre stable ; les cartes ne livrent ni texte ni notes. Le détail permet renommer, adapter les sept paramètres et le texte indépendant, modifier notes/catégorie/langue du texte, copier, dupliquer vers un nouvel UUID et supprimer après confirmation. Vide, chargement, panne, accès refusé et objet absent restent distincts ; les routes directes n’accordent aucun droit.

La copie conserve son origine versionnée, son texte et ses notes si la source est corrigée, réservée ou archivée. La notice séparée signale source actuelle, nouvelle copie possible ou indisponibilité, sans modifier l’ETag personnel. Le changement de langue d’interface ouvre le même UUID et ne traduit pas les données personnelles. Les écritures restent propriétaires, sous CSRF, `X-Account-Context` et If-Match ; un changement de compte bloque la mutation et n’importe pas automatiquement l’ancienne saisie.

« Enregistré » suit uniquement la confirmation du dernier contenu envoyé. Une saisie modifiée pendant une réponse lente reste modifiée ; un 412 permet comparer, copier, recharger ou conserver volontairement la version locale face à la nouvelle révision. L’éditeur privé ne promet aucune synchronisation par stockage local ; il garde le texte en mémoire et propose sa copie sur panne/expiration. L’import de brouillon montre d’abord un chargement réel, puis disponibilité/expiration, le compte courant et une action d’import ou d’abandon ; aucune création serveur automatique. Logout purge les clés personnelles ciblées.

Composants : `PersonalMethodsList`, `PersonalMethodEditor`, `MethodDraftImport`, `MethodGenerator`, notice source, confirmations et état de sauvegarde. Le global **78 tests Java** couvre notamment propriété, seconde session et concurrence ; les **42 tests client** comprennent des doubles réseau/stockage. La recette navigateur finale réussit **7/7 en 46,1 s**, avec **24 captures examinées** ; périmètre observé et limites dans [evidence/P07.md](evidence/P07.md).

## E13 Compte, achats et aide

Routes : /fr/compte et /en/account ; commandes P11, remboursements et origines d’accès P13 aux chemins du registre. P14 raccorde profil, préférences et sécurité aux services d’identité existants, puis aide, demandes relatives aux données et attestations aux routes privées ci-dessus. Le niveau de vérification reste celui de [STATUS](STATUS.md) et des preuves de chaque lot.

Préférences, langue, commandes, droits, demandes de remboursement, attestations et support. La commande conserve les conditions achetées. Paiement, remboursement et accès sont nommés séparément. La documentation téléchargeable ne se présente pas comme facture légale si ce document n’est pas réellement produit selon la configuration commerciale.

Le récapitulatif et le statut de commande renvoient au suivi privé des remboursements. Celui-ci présente montant payé, confirmé remboursé, réservé et disponible tels que fournis par l’API, puis demande et exécutions dans des historiques séparés. Le formulaire apprenant contient seulement un motif, avec compte attendu ; aucune saisie de montant, PaymentIntent ou conséquence d’accès. L’accusé « demande enregistrée » ne vaut pas remboursement. Motif local conservé en cas de panne/conflit/changement de compte, actions bloquées et copie réelle possible ; aucune nouvelle mutation automatique après réponse ambiguë.

La page des accès expose chaque origine de commande, version, langues, période, état ACTIVE/NOT_STARTED/EXPIRED/REVOKED et raison de retrait connue. Un même parcours peut conserver une autre origine active après le remboursement d’un pack. Elle renvoie à la commande et au suivi sans afficher de corps pédagogique protégé. Les états d’email restent distincts des états financiers ; aucun délai de réception bancaire ou recours légal n’est inventé. Un lien permet de retrouver le travail personnel conservé ; le retrait d’un contenu premium ne supprime pas notes, projets, méthodes ou tentatives.

P14 propose uniquement une attestation de **participation déclarée**, réellement téléchargeable en HTML autonome imprimable. L’écran distingue nom non vérifié, activités déclarées terminées, quiz automatiques et autoévaluations ; il ne présente ni achèvement global, certification officielle ou revue humaine. L’inscription/version, la langue du document, la date et les faits émis restent immuables. Le choix d’inscription est paginé, y compris pour l’historique. Une simple lecture/vidéo ne rend pas éligible.

L’aide conserve demandes, messages, états et événements. Un contexte de commande, projet, inscription ou ressource/version est choisi explicitement ; les fichiers existants READY du projet sont sélectionnés par l’utilisateur, jamais joints avec ses notes ou productions automatiquement. La prise en charge SMTP d’une réponse est distincte de son enregistrement. Les opérateurs ne reçoivent que les pièces sélectionnées ; leur interface étendue relève de P15.

Le contexte garde sa langue source : le paramètre interne autorisé `contextLocale=fr|en`, accompagné d’une cible, est conservé lors du changement d’interface et du retour d’identification. Une révision FR peut ainsi être signalée depuis l’interface EN. Le contexte affiche des libellés humains et sa langue ; aucun message ou texte personnel n’entre dans cette URL.

Les demandes EXPORT/ERASURE/ACCOUNT_CLOSURE sont enregistrées en WAITING_POLICY et peuvent être annulées avec historique. Il n’existe ni export prêt, ni traitement irréversible activé avant validation de la conservation. Les justificatifs commerciaux affichent une absence explicite tant qu’aucun document vérifié n’est publié ; le récapitulatif de commande ne devient pas une facture.

## E14 Administration des contenus

Routes : /{locale}/admin/content ou équivalents centralisés. Phase P05.

Liste de parcours, activités, guides, méthodes et ressources, avec type, statut, langue, version, dernière revue et dépendances. Filtres, recherche, pagination ; créer, éditer, prévisualiser, dupliquer et archiver.

Un contenu déjà utilisé n’est pas effacé silencieusement. Son retrait expose les dépendances et l’effet sur des clients existants. Les permissions sont vérifiées côté serveur. L’administration réelle affiche les données de la base ; les démonstrations restent dans un profil distinct.

## E15 Éditeur et révisions

Routes : /{locale}/admin/content/{id}/edit et variantes d’aperçu autorisées. Phase P05, média P10, contenu P18.

Le panneau P10 d’ingestion propose PNG/JPEG/TXT, leur contrôle réel puis l’ajout volontaire d’une référence au brouillon. Le transfert ne publie rien et ne modifie pas seul la révision pédagogique. Les médias obligatoires doivent être prêts dans le registre et disponibles ; un UUID fourni arbitrairement ne suffit pas à leur revue. Transfert, confirmation, ajout explicite, sauvegarde et image publique FR/EN sont validés en intégration locale P10 ; un contrôle de format ne constitue pas une analyse antivirus.

Édition de contenu, ordre des modules/activités, médias, ressources, quiz, grilles, prérequis, traductions, métadonnées, aperçu et historique. Des commandes clavier permettent de réordonner sans dépendre du glisser-déposer.

P09 ajoute la configuration de projet BR01/BR02, le seuil et la règle de révélation. Les préparations FR/EN proviennent d’une route serveur administrateur ; remplacer une grille existante exige confirmation. Cette opération prépare une révision sans la publier. Une politique incomplète peut rester en brouillon ; la publication contrôle grille/corrigé et équivalence des traductions. Les libellés pédagogiques des préparations ne sont pas embarqués dans le bundle public.

États éditoriaux : brouillon, à vérifier, prêt, publié, à actualiser, archivé. La revue constate réellement objectif, fichiers, exercice et corrigé ; les traductions dépendantes sont signalées lors d’une révision. Conflit concurrent explicite ; retour à une publication antérieure par nouvelle opération tracée. Publier n’active pas une offre commerciale.

## E16 Exploitation et support

Routes : /{locale}/admin/operations et onglets/sections prévus pour P15 ; le suivi d’emails P10 et les trois chemins de remboursement P13 du registre sont déjà écrits. La route générale seule ne devient pas disponible par la présence de ses sous-pages.

Commandes, droits par origine, remboursements, tickets, emails et traitements en erreur, indicateurs et journal. Les opérations de reprise utilisent les services métier idempotents ; elles n’écrivent pas directement un statut financier souhaité.

P10 introduit uniquement le suivi d’emails sur `/fr/admin/notifications` et `/en/admin/notifications` : état, tentatives, dates, code expurgé et reprise après contrôle, sous permissions `notifications.read/manage`. Un résultat SMTP indéterminé exige la reconnaissance du risque de doublon. Aucun destinataire, corps, jeton, clé métier ou ciphertext affiché ; les autres opérations d’exploitation restent à leurs lots respectifs. Lecture FR/EN et reprise volontaire après interruption réelle de Mailpit sont validées localement ; « accepté par le transport » ne garantit pas la réception dans une boîte externe.

P13 implémente une liste réelle de demandes ou d’exécutions, filtrée par état/commande et paginée. L’examen d’une demande affiche son motif et les faits financiers, puis un montant proposé et des allocations de lignes explicites avec KEEP/REVOKE. La prévisualisation réelle présente montant, versions/langues et effets, sans prix par cours fabriqué. Toute modification impose un nouvel aperçu ; approbation et refus motivés ont leur propre confirmation. APPROVE affiche ensuite le lien vers l’exécution préparée, sans prétendre qu’un remboursement a déjà réussi.

La page d’exécution sépare état fournisseur, effet sur les droits et notification. Les actions autorisées par le serveur et les permissions sont distinctes : exécuter, annuler PREPARED jamais transmise, demander un rapprochement, ou décider les effets d’accès d’un remboursement externe déjà confirmé. Chaque confirmation rappelle objet, montant, lignes et motif ; une relecture explicite est requise après un résultat ambigu/conflit. UNKNOWN/PENDING ne s’affichent pas comme « remboursé ». Un partiel Dashboard sans décision affiche le besoin d’examen ; une confirmation intégrale peut appliquer le retrait sans inventer d’allocations monétaires inconnues. Le travail personnel reste conservé et les autres origines d’accès restent indépendantes. Les pages privées sont `noindex`, `no-store`, sous session et contrôles Spring ; les permissions de l’éditeur ne donnent aucun pouvoir financier. Les tests de recette P13 restent à consolider avant une validation de ces vues.

Les actions sensibles précisent objet et effet, demandent un motif adapté et conservent auteur/date/résultat. L’éditeur de contenu ne reçoit pas des permissions financières par défaut. Les indicateurs sont calculés sur des sources définies, par devise/période ; coûts inconnus et zéro sont distincts.

Une erreur de leçon ouvre un dossier lié à sa version ; sa correction suit E15 sans modifier les copies personnelles ni les preuves passées.

## Variantes utilitaires

404, erreur générale récupérable, accès refusé, session expirée, ressource indisponible, langue absente, offre suspendue, contact et informations du site sont rattachés aux familles précédentes. Les pages d’information juridique utilisent les données vérifiées du propriétaire et une rédaction à valider ; le code ne fabrique pas une entreprise, une politique de remboursement ou une certification.

