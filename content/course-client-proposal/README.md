# Premier parcours — sources éditoriales

`v1/fr` et `v1/en` contiennent chacun les six leçons développées M01–M06. `v1/resources` contient les dix-huit fichiers Markdown éditables. Les cas R/S et leurs montants sont fictifs ; ils ne fixent aucun prix de formation.

Les JSON sont les sources de rédaction. `scripts/prepare-course-content.mjs` les assemble en documents CMS et manifeste dans `.runtime/content-course-client-proposal`, avec les grilles serveur versionnées BR01/BR02 et les empreintes des fichiers. Ce répertoire généré n’est pas un catalogue parallèle utilisé par le frontend. Le site lit les publications du CMS Spring.

L’import explicite local/test crée des brouillons, avec des clés logiques durables et détection des changements humains. Il ne publie pas, ne marque pas une traduction relue par un humain, ne crée aucun compte ou rôle et n’active aucune offre. Un acteur actif possédant les permissions éditoriales est indispensable. Ne pas substituer un UUID d’apprenant.

Depuis la racine, après build API et préparation du stockage local :

```powershell
.\scripts\courses.cmd run content:prepare
.\scripts\courses.cmd run verify:content
.\scripts\courses.cmd run content:import -- --plan --actor <UUID_EDITEUR_LOCAL> --manifest .runtime/content-course-client-proposal/manifest.json
.\scripts\courses.cmd run content:import -- --apply --actor <UUID_EDITEUR_LOCAL> --manifest .runtime/content-course-client-proposal/manifest.json
```

La classification des fichiers de corrigé est distincte des ressources de dossier : les deux corrigés par langue exigent une révélation explicite P09, puis une autorisation courante de téléchargement. Ils ne sont pas ajoutés à `PublicDocument`. Modifier le rôle d’un fichier existant est interdit ; préparer un nouvel asset si sa nature change.

Les quiz reprennent la politique technique déjà présente :100% pour le statut de quiz réussi, sans limite de tentatives. Ce statut reste distinct du projet ; la grille BR01/BR02 est déclarative,20 points et seuil pédagogique configurable16 sans erreur bloquante. Aucune qualification officielle ou vérification automatique du texte personnel.

La relecture des agents et les essais techniques ne sont pas une revue humaine d’équivalence ou un essai apprenant. Les vidéos, voix et captures réelles ChatGPT sont à produire. Aucune durée de réalisation n’est mesurée. Le format vendu, les langues de lancement et les conditions commerciales restent à décider ; [préparation d’offre](v1/offer-editorial-draft.json). Les preuves effectives et limites figurent dans [P18](../../docs/evidence/P18.md).
