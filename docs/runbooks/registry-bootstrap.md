# Préparer les paquets privés avant la première image applicative

**10 novembre 2026 : création du dépôt privé et installation des six fichiers autorisées puis observées. Aucun job lancé.** L’exécution du bootstrap, la suppression du paquet public et les accès supplémentaires restent hors de cet accord. Ce document complète le [runbook de livraison](deploy.md) ; il ne débloque pas P21 à lui seul.

**Décision ultérieure : l’utilisateur autorise explicitement les images publiques.** Le chemin courant revient donc au dépôt applicatif public et à son environnement protégé existant. Ce mécanisme privé reste conservé, inactif, sans job ni secret supplémentaire. Les étapes ci-dessous décrivent la piste préparée et ne sont plus nécessaires à P21 dans le choix actuel.

## Motif et niveau de preuve

Le propriétaire confirme n’avoir jamais changé manuellement la visibilité des images. Deux premières créations depuis le workflow du dépôt public ont néanmoins produit un paquet web public. Les métadonnées authentifiées, le registre anonyme et la lecture manuelle des réglages concordent. Aucun secret applicatif connu n’a été trouvé dans l’audit borné du dernier digest ; cela n’exclut pas les secrets inconnus ou transformés.

La [documentation spécifique à Actions](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions#default-permissions-and-access-settings-for-packages-modified-through-workflows) indique qu’un paquet créé avec `GITHUB_TOKEN` hérite par défaut du modèle de visibilité et de permissions du dépôt du workflow, y compris pour les registres à permissions granulaires. Ce comportement fournit une explication probable cohérente avec les deux créations depuis la source publique. La [documentation générale](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility) annonce au contraire une visibilité initiale privée et sépare l’héritage des permissions de la visibilité. Cette divergence ne permet pas d’attribuer avec certitude chaque événement interne à GitHub.

Le garde applicatif `f58a34b` reste strict : les deux paquets doivent exister et être positivement privés avant tout nettoyage, credential Docker, build ou push. Le bootstrap ne lui ajoute aucune exception.

## Périmètre concret proposé

- Dépôt autorisé et créé : **[`fonkoukevin/chatgpt_courses_registry`](https://github.com/fonkoukevin/chatgpt_courses_registry)**, privé, branche `main`, commit initial `89eb2ece001f1b0127aa74d96f3c3e478650b75a`.
- Préfixe des images : **`ghcr.io/fonkoukevin/chatgpt_courses-private`**, uniquement `/web` et `/api`. Aucun troisième nom choisi automatiquement.
- Contenu du dépôt : contrôleur autonome, workflow manuel avec `plan` par défaut, Dockerfile `FROM scratch`, marqueur inerte et tests. Aucun code Courses, configuration privée, donnée, clé Stripe, accès SSH ou fichier `.env`.
- Authentification : jeton `GITHUB_TOKEN` éphémère du seul job ; aucun nouveau PAT ou secret durable.
- Précontrôles avant création : connecteur puis CLI retournent404 ; l’identité CLI `fonkoukevin` est vérifiée. La création privée est ensuite confirmée avant l’envoi, avec dépôt vide. Aucun dépôt existant écrasé.

Les six fichiers sont conservés dans [le candidat local](../../infra/registry-bootstrap/README.md). Son workflow reste imbriqué sous `infra/registry-bootstrap/.github/workflows` et ne s’exécute donc pas dans le dépôt applicatif. Ses dix tests de politique sont importés dans le groupe CI scripts existant : **89/89 sous Windows Node24.22.2**, lint ciblé et actionlint passent. Réseau et Docker sont simulés dans ces tests ; aucun bootstrap GHCR ou nettoyage Linux réel n’est validé. [Preuve](../evidence/P21-private-bootstrap-preparation.json).

L’installation distante reprend exactement ces six fichiers, sans historique applicatif. Arbre Git et octets des six blobs relus, SHA256 concordants ; métadonnées privées avant/après push, relecture indépendante du connecteur et GET anonyme404. Un workflow manuel est enregistré, **zéro exécution observée**. [Preuve d’installation](../evidence/P21-private-bootstrap-installation.json). L’en-tête du README installé conserve l’état du candidat préparé ; cette preuve date l’installation ultérieure autorisée.

Le paquet `/web` actuel est public. **Aucune opération de bootstrap ne peut le remplacer ou le modifier.** Sa suppression éventuelle constitue une nouvelle action à autoriser, distincte du nettoyage ancien déjà terminé. Cible connue : version1538137158, tag `sha-8138ae03fede797087224c72efa2a50c856e01dd-42877515322-1`, digest `sha256:1eab5f2bc954e4736bf3f2c83286f0c0b99035d411b2ad35c4cb36da30df43db`. Avant toute suppression, refaire un inventaire authentifié complet des versions ; cette proposition n’autorise aucun DELETE.

## Séquence à vérifier après autorisation

1. **Création et transfert terminés**, sans changement du dépôt applicatif, de ses protections ou des services existants. Aucun job n’est autorisé par cet accord. Vérifier à nouveau le quota et les limites applicables avant un éventuel job ultérieurement autorisé ; ne souscrire ni augmenter un budget automatiquement.
2. Après accord distinct seulement, lancer d’abord `plan` : identité du dépôt, caractère privé, branche et contexte du workflow, puis états des deux paquets. Un paquet existant, public ou privé, ou une réponse ambiguë bloque la création. Le paquet web actuel bloque donc ce plan tant que son traitement distinct n’est pas décidé.
3. Après résolution autorisée de ce blocage, lancer explicitement le bootstrap. Créer uniquement deux images inertes, sans couche ou contexte applicatif, et vérifier après chaque push : source du dépôt privé, métadonnée `private`, identité exacte, digest et refus de lecture anonyme structuré. Un échec arrête avant le paquet suivant ; aucun nettoyage distant automatique, aucune release Courses produite.
4. Pour chaque paquet privé observé, préparer sa migration vers `fonkoukevin/chatgpt_courses` par l’interface officielle : retirer l’héritage des accès si nécessaire, délier le dépôt de bootstrap, relier le dépôt applicatif sans activer l’héritage, puis régler explicitement l’accès Actions requis. La [migration de source](https://docs.github.com/en/packages/learn-github-packages/connecting-a-repository-to-a-package#migrating-a-package-to-another-repository) et la conservation des permissions lors d’une liaison après publication sont documentées. L’API REST Packages consultée ne fournit pas d’opération correspondante ; ne pas inventer d’endpoint ni réutiliser les cookies du navigateur.
5. Vérifier à nouveau la confidentialité après chaque changement de source ou d’accès. L’accès du dépôt applicatif aux paquets privés est une décision distincte : la documentation avertit qu’un dépôt public autorisé peut aussi permettre un accès depuis ses forks. Ni le libellé `private`, ni le refus anonyme, ni la désactivation de l’héritage ne prouvent l’exclusion de tous les forks.
6. Faire passer le correctif du garde dans la CI et la branche protégée, puis seulement reprendre la publication applicative selon le runbook. Les images inertes ne sont pas des images de release et ne doivent pas être déployées.

## Limites et conditions d’arrêt

Le dépôt privé et l’installation des six fichiers sont seuls autorisés et réalisés. Cette installation ne vaut pas autorisation d’exécuter un job ou de créer des paquets. Le changement de source et l’accès Actions restent à autoriser et à observer séparément. Aucun coût, délai de reprise ou confidentialité future n’est garanti par ce document. Une suppression/recréation du même nom ne garantit pas la remise à zéro de sa visibilité ; l’observation réelle prime. Si une coquille inerte devient publique, arrêter et conserver le reçu : aucun code applicatif ne doit avoir été envoyé.

Si ce chemin ne peut pas être vérifié ou si l’accès potentiel des forks est incompatible avec le besoin, demander une clarification fournisseur ou une autre décision explicite. GitHub [prévoit le support Packages](https://docs.github.com/en/packages/learn-github-packages/introduction-to-github-packages#contacting-support) pour les comportements contraires à la documentation. Aucun ticket ni message n’est envoyé sans instruction de l’utilisateur.
