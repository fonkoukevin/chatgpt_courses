# Charte graphique et règles d’interface

## Statut de cette charte

Proposition de réalisation du 7 novembre 2026, fondée sur la préférence exprimée pour ChatGPT et ChatGPT.fr. Les deux pages publiques ont été examinées sur ordinateur. Les valeurs ci-dessous constituent notre système de design ; elles ne sont pas présentées comme les tokens exacts de ces sites.

Références : https://chatgpt.com/ et https://chatgpt.fr/. ChatGPT inspire la sobriété, les repères latéraux et la place accordée au travail. ChatGPT.fr inspire la présentation éditoriale claire, les appels à l’action et un accent bleu nuit. Ne reprendre ni logos, ni témoignages, ni statistiques, ni programmes commerciaux des références. Les anciens écrans proposés dans cette conversation ne sont pas un modèle à reproduire.

## Intention

Une plateforme calme et utile, avec des contenus qui se lisent et des actions qui se comprennent. Les pages publiques permettent de choisir une tâche ; l’espace apprenant facilite la reprise et la rédaction ; l’administration privilégie les listes et les contrôles. Le même vocabulaire visuel relie les trois espaces.

Le premier rendu est clair. Les variables permettent une évolution ultérieure du thème ; ne pas afficher un sélecteur de thème non implémenté. La priorité est une version claire complète et cohérente.

## Palette proposée

| Token | Valeur | Usage |
| --- | --- | --- |
| background | #FFFFFF | Fond principal |
| surface | #FFFFFF | Panneaux et formulaires |
| surface-subtle | #F7F7F8 | Navigation latérale, zones secondaires |
| surface-hover | #EFEFF1 | Survol discret |
| foreground | #202123 | Texte principal, bouton neutre |
| muted-foreground | #60656C | Informations secondaires lisibles |
| border | #E3E5E8 | Séparation décorative |
| control-border | #8A8F98 | Contour nécessaire à l’identification d’un champ |
| brand | #12345B | Accent bleu nuit, CTA commercial, repère actif |
| brand-hover | #0B2545 | Survol du CTA de marque |
| brand-soft | #EDF2F8 | Sélection ou notice de marque légère |
| link | #244F85 | Liens dans le contenu |
| focus | #275DAD | Contour de focus clairement visible |
| success | #176B48 | Réussite accompagnée d’un libellé |
| success-soft | #ECF6F0 | Fond de confirmation |
| warning | #855500 | Attention accompagnée d’un libellé |
| warning-soft | #FFF6DF | Fond d’attention |
| danger | #B42318 | Erreur et action destructrice |
| danger-soft | #FEF0EE | Fond d’erreur |

Le bleu nuit donne une identité propre ; les surfaces et les textes restent majoritairement neutres. Employer le vert pour un état de réussite, pas comme couleur dominante de la marque. Centraliser chaque couleur. Vérifier les contrastes de leurs combinaisons réelles, en particulier les textes petits et les contrôles. Une bordure décorative claire ne remplace pas le repère visuel nécessaire à un champ.

## Typographie

Police principale : Inter auto-hébergée si sa licence et sa disponibilité sont vérifiées, sinon pile système `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Le site doit rester utilisable si une police distante est inaccessible ; aucun achat de police requis.

| Élément | Ordinateur | Mobile |
| --- | --- | --- |
| Titre d’accueil | 48–52 px, 600, interligne 1.1 | 32–36 px |
| Titre de page publique | 36–40 px, 600 | 28–32 px |
| Titre de page apprenant/admin | 28–32 px, 600 | 24–28 px |
| Titre de section | 22–26 px, 600 | 20–24 px |
| Texte courant | 16 px, interligne 1.55–1.7 | 16 px |
| Labels et navigation | 14–15 px | 14–15 px |
| Métadonnées secondaires | 13 px minimum courant | 13 px |

Titres avec espacement de lettres légèrement resserré, sans compression excessive. Éviter de construire une hiérarchie sur des textes minuscules en capitales. Réserver une police monospace aux prompts et extraits techniques ; les longs prompts reviennent à la ligne.

## Grilles et espaces

- Échelle commune : 4, 8, 12, 16, 24, 32, 48, 64 et 80 px. Utiliser des tokens plutôt que des valeurs différentes dans chaque écran.
- Conteneur public : largeur maximale de 1200 px environ, marges 24–32 px sur ordinateur et 16–20 px sur mobile.
- Largeur de lecture d’une leçon : 680–760 px. Les tableaux ou éditeurs peuvent utiliser davantage d’espace.
- En-tête public : 64–72 px. En-tête de travail : environ 64 px.
- Navigation apprenant : 248–264 px sur grand écran. Sous 1024 px, panneau repliable avec titre et fermeture accessibles.
- Atelier : zone de rédaction principale et dossier de référence 280–320 px si l’espace le permet. Sur mobile, référence dans un panneau/bouton clairement nommé.
- Grille de catalogue : trois colonnes au large, deux au format intermédiaire, une sur mobile. Le contenu réel détermine le nombre de cartes.
- Espacement entre sections publiques : 48–80 px, sans grands écrans vides qui repoussent les informations importantes.

Contrôler 1440, 1024, 768 et 390 px ; vérifier aussi l’absence de rupture à 320 px. Les points de rupture découlent du contenu, pas seulement des tailles de téléphones.

## Formes et effets

Rayons : 8 px pour un champ, 10–12 px pour un bouton ou un petit panneau, 16 px pour une grande carte. Le rayon capsule peut servir au filtre de tâche ; éviter de transformer tous les éléments en pastilles.

Bordures fines ; ombres seulement pour les surfaces surélevées comme menu, dialogue et panneau. Aucun effet de verre, dégradé décoratif ou animation indispensable à la compréhension. Transitions de 120–180 ms ; respecter `prefers-reduced-motion`.

Icônes : une seule famille cohérente, par exemple Lucide si disponible dans les dépendances retenues, taille usuelle 18–20 px. Les actions ambiguës ont un libellé visible. Les icônes décoratives sont ignorées par les lecteurs d’écran.

## Boutons et formulaires

- Un seul appel principal clairement dominant par zone de décision. Bouton de marque bleu nuit pour « Essayer une activité » ou « Voir l’offre » ; bouton neutre ou même variante cohérente pour les actions de travail.
- Variantes : primary, secondary, ghost, destructive, link. Taille tactile recommandée 44–48 px ; une action compacte de tableau reste utilisable au clavier et au toucher.
- Le chargement conserve la largeur du bouton et explique l’action en cours. Désactiver un double envoi sans enfermer un formulaire après échec.
- Champs avec label persistant, aide éventuelle, indication requis/facultatif et erreur associée. Le placeholder complète le label.
- Un formulaire invalide amène le focus vers une explication ou un premier champ pertinent. Les erreurs sont compréhensibles et conservent la saisie.
- La réinitialisation d’un brouillon ou suppression d’une méthode demande une confirmation proportionnée ; une erreur réseau propose réessayer et copier le texte.

## Composition des pages publiques

Accueil : en-tête sobre, promesse liée à une tâche, explication courte, accès à une activité complète, recherche/orientation par besoin, réalisations attendues, parcours réellement disponibles, méthode pédagogique, questions fréquentes, pied de page.

Le premier écran doit permettre de comprendre le produit et d’agir. Une illustration est utile uniquement si elle explique un résultat réel. La fiche de formation ne devient pas un grand visuel décoratif. Une barre de chiffres n’apparaît qu’avec des données justifiables.

Catalogue : titre et recherche, filtres compréhensibles, résultats de densité régulière, état des filtres partageable. Sur mobile, bouton « Filtres » avec nombre actif ; garder accès au reset et aux résultats.

Fiche : résultat, bénéficiaire, aperçu, programme, prérequis, outils, vérification, langues, conditions d’offre, FAQ. La carte d’offre ne cache pas le programme. Un client possédant un accès voit d’abord « Reprendre ».

Guide : lecture confortable, table des matières si longueur utile, exemples originaux, contrôles et lien vers une activité du même sujet. Les informations de source/date reflètent une vraie revue.

## Composition de l’espace apprenant

Tableau de bord : « Reprendre » et dernier travail avant les indicateurs secondaires. Montrer des compteurs observables, pas un score de compétence déduit arbitrairement.

Leçon : programme latéral, objectif, explication textuelle/vidéo, pratique, vérification, ressources et prochaine étape. La transcription est facilement accessible. Le rendu du prompt et les zones de texte restent lisibles à largeur réduite.

Atelier : distinguer Brief, Rédiger, Vérifier et Corrigé. Le statut de sauvegarde reste visible. Lors d’un conflit, comparer/choisir de manière explicite sans écraser le travail. Ne pas masquer le brouillon derrière une pleine page d’erreur.

Méthodes : recherche, catégories, cartes ou liste orientées besoin, édition lisible, source/version et copie personnelle clairement différenciées. Une mise à jour du modèle n’efface pas le texte adapté.

## Composition de l’administration

Utiliser une structure d’administration distincte, dense mais cohérente : navigation, titre, action principale, filtres, tableau, pagination et panneau de détail. Les colonnes les plus importantes restent visibles sur formats réduits.

Afficher séparément contenu publié, traduction prête, offre commercialisable, paiement et accès. Une cellule financière n’est pas un interrupteur éditable sans règle métier. Pour les opérations sensibles : contexte, conséquences, motif, confirmation et résultat observé.

## États à matérialiser

Composants : Button, Input, Textarea, Select, Checkbox, RadioGroup, Dialog, Sheet, Tabs, Accordion, Alert, Toast, Badge, Card, Table, Pagination, Skeleton, EmptyState, ErrorState, ConfirmDialog.

Métier : CourseCard, AccessNotice, CourseSidebar, LessonPlayer, QuizBlock, ProjectEditor, RubricChecklist, SaveStatus, MethodBuilder, LanguageSwitch, OfferSummary, OrderStatus, VersionNotice, TranslationStatus, AdminContentTable.

Chaque élément supporte ses états pertinents. Distinguer `login_required`, `payment_required`, `access_expired`, `access_revoked`, `not_published`, `not_found`, `temporarily_unavailable` et `translation_missing`.

Statut de travail : modifications en cours → enregistrement → enregistré ou échec. L’état enregistré correspond à un acquittement du serveur dans l’application finale. Le mode démonstration éventuel est signalé hors du parcours produit normal et exclu de la publication.

## Accessibilité et contrôle visuel

Objectif de réalisation : WCAG 2.2 niveau AA pour le périmètre construit, sans déclaration de conformité globale sans audit. Vérifier structure, intitulés, contraste, focus, clavier, dialogues, alternatives aux médias, zoom et reflow. Les seuils de contraste et critères appliqués doivent être vérifiés dans la référence W3C lors de l’implémentation : https://www.w3.org/WAI/WCAG22/quickref/.

À P02 puis sur les pages intégrées : ouvrir réellement accueil, catalogue, leçon, atelier et tableau d’administration ; examiner ordinateur et mobile, FR et EN. Conserver des captures de référence de notre produit quand l’outil le permet. Une capture seule ne démontre pas le fonctionnement des permissions ou paiements.

Acceptation visuelle : aucun texte tronqué essentiel, aucune superposition involontaire, navigation mobile utilisable, contrôles clairement nommés, densité cohérente et état réel visible. Corriger les défauts constatés avant d’étendre les mêmes composants.

## Mise en œuvre

Le fichier `references/design-tokens.css` fournit un point de départ. Adapter l’intégration à la version Tailwind/shadcn retenue, sans mélanger des conventions incompatibles. Les classes sémantiques et composants sont la référence, pas des couleurs recopiées dans chaque JSX.

Toutes les chaînes produit sont externalisées. Une variante anglaise n’est pas une interface française avec seulement le menu traduit. Les noms des composants et propriétés restent stables et explicites.

## Réalisation P02 — 8 novembre 2026

- Tailwind **4.3.5** : `@theme inline` dans `apps/web/src/app/globals.css` référence les couleurs de `references/design-tokens.css`. Les composants emploient `surface`, `control`, `brand`, `danger`, etc. Les alias de rayons `input`, `button`, `panel` évitent une autoréférence CSS aux tokens sources.
- Convention shadcn source : `apps/web/components.json`, alias `@/components/ui` et utilitaire `cn`. Wrappers adaptés manuellement sur **Radix 1.8.1**, pas de génération CLI revendiquée. Select natif pour les choix simples ; Dialog/Sheet, confirmation, onglets, accordéon, radio, checkbox, infobulle et notification utilisent Radix.
- Une seule famille d’icônes : **Lucide 1.70.0**. Police système prévue par la charte, sans téléchargement de police ni logo tiers. Pas de thème sombre ou sélecteur non réalisé.
- Boutons et champs : cible de 44 px ; cases/radios dans un label tactile de 44 px. Focus avec contour/anneau et espace de séparation. Métadonnées et badges : au moins 13 px. Animations et transitions supprimées sous `prefers-reduced-motion: reduce`.
- Administration mobile : état placé sous le titre du contenu sous 640 px ; colonnes secondaires masquées, action de détail conservée. Détail dans une section nommée avec transfert de focus. Navigation apprenant/admin dans un Sheet sous 1024 px ; dossier de référence dans un Sheet sous 1280 px.
- `SaveStatus` n’affiche « enregistré » qu’avec une confirmation horodatée explicite. La démonstration utilise l’état local, jamais une fausse réponse serveur. Progression et autoévaluation ont des libellés distincts ; aucun état inconnu n’est interprété comme une réussite.
- Textes FR/EN centralisés dans `lib/i18n/{gallery,showcase,domain}.ts`. Fixtures isolées dans `components/demos/fixtures.ts`. Routes techniques stables `/{locale}/dev/{components,public,learning,admin}` ; elles ne remplacent pas les routes produit du registre `SCREENS.md`.

Mesures des combinaisons de contraste, recette exécutée, captures et limites : [preuve P02](evidence/P02.md). Les contrôles ciblés ne constituent pas un audit WCAG complet.
