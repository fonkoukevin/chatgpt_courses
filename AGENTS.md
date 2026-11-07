# ChatGPT Courses

## Mission

Développer une plateforme de formation pratique à l’IA : choisir une tâche, apprendre, produire, vérifier, conserver une méthode. Le cahier couvre trois espaces et E01–E16. Les 54 fonctions et leurs priorités sont dans `docs/FUNCTION_MATRIX.md` ; les extensions conditionnelles ne deviennent pas des engagements du lancement.

## Travailler par lot

- Au début d’un lot ou d’une reprise, lire `docs/STATUS.md`, le prompt demandé et les documents nécessaires à ce lot. Inutile de relire tout le dossier pour une correction locale.
- Réaliser le lot, exécuter les vérifications pertinentes, corriger les défauts observés et rapporter les limites. Un plan ou un écran simulé ne termine pas une intégration réelle.
- Préserver les changements existants. Inspecter le dépôt avant toute création. Ne pas réinitialiser le projet, supprimer du travail ni remplacer des instructions pour contourner une contrainte.
- Les choix réversibles ordinaires peuvent être faits et documentés. Demander seulement ce qui change matériellement le produit, engage une dépense non autorisée, détruit des données ou nécessite un accès manquant. Respecter les permissions des outils.
- Séparer les étapes dans des commits cohérents lorsque le dépôt le permet. Ne pas pousser ou publier un contenu externe sans autorisation applicable à la session.

## Sources de référence

| Travail | Documents à consulter |
| --- | --- |
| Périmètre et règles | `docs/PRODUCT.md`, `docs/DECISIONS.md`, `docs/FUNCTION_MATRIX.md` |
| Interface | `docs/SCREENS.md`, `docs/DESIGN_SYSTEM.md` |
| Architecture et API | `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md` |
| Pédagogie | `docs/CONTENT_REFERENCE.md` |
| Tests | `docs/ACCEPTANCE.md` |
| Livraison | `docs/DEPLOYMENT.md` |

Les nouvelles décisions explicites de l’utilisateur priment. Mettre à jour les documents concernés lorsqu’une décision évolue. Une incompatibilité technique doit être expliquée avant de changer une technologie principale.

## Architecture et invariants

- `apps/web` : Next.js App Router, TypeScript, Tailwind, shadcn/ui/Radix. `apps/api` : Java 21, Spring Boot modulaire, Maven Wrapper, PostgreSQL, JPA et Flyway. Versions exactes vérifiées et figées en P00/P01.
- Spring est l’autorité pour identité, permissions, achats, droits et progression. Une origine publique, API `/api/v1`. Sessions Spring persistées JDBC et protection CSRF selon le contrat ; pas de jeton d’authentification dans localStorage.
- Données privées hors cache partagé. Propriété et permissions vérifiées côté serveur, y compris pour les fichiers et chaque action d’administration.
- Paiement, droit, progression, remboursement et attestation sont distincts. Attribution idempotente par origine ; les conditions achetées sont conservées.
- FR/EN partagent les identifiants pédagogiques équivalents. Les notes personnelles restent intactes. Les vidéos ont leur propre position de lecture.
- Une autoévaluation reste déclarative. Un corrigé consulté et une vidéo regardée ne valident pas un projet.
- Le générateur prépare un prompt ; aucune API IA payante n’est nécessaire au socle.
- Les comptes, prix et données de démonstration restent isolés de la production. Aucun faux témoignage, chiffre de clients, engagement commercial ou contenu prétendument tourné.

## Vérification et continuité

Tester les règles sensibles et les parcours affectés. Utiliser PostgreSQL pour les comportements dépendant de PostgreSQL. Ne pas ajouter de tests qui ne font que recopier l’implémentation, ni désactiver un contrôle pour obtenir un résultat vert.

Pour l’interface, examiner réellement le rendu lorsque les outils le permettent ; annoncer une vérification visuelle non effectuée comme telle. Distinguer simulation, intégration locale, recette externe et production observée.

Les commandes font autorité dans le code et le README générés ; vérifier qu’elles existent avant de les citer comme exécutées. Ne jamais journaliser de secrets, mots de passe ou productions privées.

À la fin d’un lot : mettre à jour `docs/STATUS.md` (état, preuve, blocage, prochaine action) et les documents modifiés. Conserver un statut court ; ranger les détails de validation dans `docs/evidence/`. Répondre en français avec résultat, fichiers importants, vérifications et prochaine étape.
