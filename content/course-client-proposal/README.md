# Premier parcours — sources éditoriales

`v1/fr` et `v1/en` contiennent chacun les six leçons développées M01–M06. `v1/resources` contient les dix-huit fichiers Markdown éditables. Les cas R/S et leurs montants sont fictifs ; ils ne fixent aucun prix de formation.

La [fiche éditoriale](EDITORIAL_PREPARATION.md) précise cible, productions, outils, formats et décisions avant publication. La [matrice d’alignement](ALIGNMENT_MATRIX.md) relie les six consignes, vingt critères BR01 et dix-huit questions de quiz aux pièces et corrections. La reprise AUD-02 conserve les cinq tarifs existants, rend les corrections de M05 conditionnelles aux écarts réels et ajoute des essais ChatGPT guidés au support de méthode FR/EN. Les corrigés sont explicitement fictifs et ne sont pas attribués à une exécution d’IA.

Les JSON sont les sources de rédaction. `scripts/prepare-course-content.mjs` les assemble en documents CMS et manifeste dans `.runtime/content-course-client-proposal`, avec les grilles serveur versionnées BR01/BR02 et les empreintes des fichiers. Ce répertoire généré n’est pas un catalogue parallèle utilisé par le frontend. Le site lit les publications du CMS Spring.

Pour la revue humaine, `scripts/courses.cmd run content:review` produit un [lecteur HTML local](../../.runtime/course-editorial-review/review.html) avec les douze leçons et dix-huit supports, corrigés inclus et réponses repliées. Les sources et empreintes figurent dans son manifeste ; cette commande ne crée aucun compte, import, approbation ou publication. Le [dossier de relecture](LAUNCH_REVIEW.md) précise les six points de contrôle et les décisions attendues. Les [contrôles FINAL-01](../../docs/evidence/FINAL-01.md) distinguent les sources du paquet auteur des versions pédagogiques publiées en recette ; les preuves historiques [REVIEW-01](../../docs/evidence/REVIEW-01.md) restent conservées. Pour une nouvelle campagne, choisir une nouvelle référence de preuve prise en charge par `verify-course-content.mjs` afin de ne pas écraser un résultat historique.

L’import explicite local/test crée des brouillons, avec des clés logiques durables et détection des changements humains. Il ne publie pas, ne marque pas une traduction relue par un humain, ne crée aucun compte ou rôle et n’active aucune offre. Un acteur actif possédant les permissions éditoriales est indispensable. Ne pas substituer un UUID d’apprenant.

Depuis la racine, après build API et préparation du stockage local :

```powershell
.\scripts\courses.cmd run content:prepare
.\scripts\courses.cmd run verify:content
.\scripts\courses.cmd run content:import -- --plan --actor <UUID_EDITEUR_LOCAL> --manifest .runtime/content-course-client-proposal/manifest.json
.\scripts\courses.cmd run content:import -- --apply --actor <UUID_EDITEUR_LOCAL> --manifest .runtime/content-course-client-proposal/manifest.json
```

Pour préparer et vérifier les sources de la reprise sans réécrire les rapports P18/P19 :

```powershell
.\scripts\courses.cmd run content:prepare -- AUD-02
.\scripts\courses.cmd run verify:content -- AUD-02
```

Ces deux commandes n’importent rien et ne publient rien. La recette navigateur `scripts/verify-browser.mjs AUD02` utilise le scénario de parcours P18 avec ses propres bases/services éphémères ; ses preuves sont séparées dans `docs/evidence/AUD02-browser`. Son lancement et ses résultats effectifs sont décrits dans [AUD-02](../../docs/evidence/AUD-02.md). Les brouillons P18 partagés restent inchangés tant qu’un import distinct n’est pas exécuté.

La classification des fichiers de corrigé est distincte des ressources de dossier : les deux corrigés par langue exigent une révélation explicite P09, puis une autorisation courante de téléchargement. Ils ne sont pas ajoutés à `PublicDocument`. Modifier le rôle d’un fichier existant est interdit ; préparer un nouvel asset si sa nature change.

Les quiz reprennent la politique technique déjà présente :100% pour le statut de quiz réussi, sans limite de tentatives. Ce statut reste distinct du projet ; la grille BR01/BR02 est déclarative,20 points et seuil pédagogique configurable16 sans erreur bloquante. Aucune qualification officielle ou vérification automatique du texte personnel.

La relecture des agents et les essais techniques ne sont pas une revue humaine d’équivalence ou un essai apprenant. Aucune vidéo, voix ou capture réelle ChatGPT n’est actuellement livrée ; tout média retenu dans une promesse de vente devra être produit et vérifié avant cette vente. Aucune durée de réalisation n’est mesurée. Le format vendu, les langues de lancement et les conditions commerciales restent à décider ; [préparation d’offre](v1/offer-editorial-draft.json). Les preuves effectives et limites figurent dans [P18](../../docs/evidence/P18.md).
