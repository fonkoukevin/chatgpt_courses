# Revenir à des images compatibles

**Procédure préparée ; aucun rollback distant ou restauration de données exécuté ici.** Un retour de release est une nouvelle décision de déploiement portant sur l’ancien manifeste vérifié. Il ne remet pas PostgreSQL, les fichiers, paiements, emails ou travaux personnels à un ancien état.

## Conditions à établir avant l’action

- Identifier l’incident et les conteneurs réellement actifs. Un échec avant le smoke peut laisser de nouvelles images en cours malgré un lien `current` ancien ; ce lien n’est pas la preuve de l’état de tous les services.
- Conserver la précédente paire **de digests**, son commit, son manifeste canonique et sa preuve de recette. Retirer ou reconstruire un tag ne constitue pas un retour à cette paire.
- Lire sur la bonne cible les migrations réussies et le schéma actuellement appliqué. Vérifier que l’ancien code sait fonctionner avec ce schéma et les nouvelles écritures déjà réalisées. Le manifeste actuel documente seulement la compatibilité V019 ; aucune compatibilité V020 ou plus n’est inventée.
- Vérifier sauvegarde et possibilités de correction vers l’avant. Si une migration a été appliquée ou partiellement exécutée, ne pas déduire sa réversibilité de la disponibilité d’une ancienne image. Faire intervenir la procédure d’incident et le propriétaire du schéma.
- Préserver les origines de droits, inbox, opérations et réservations de paiement/remboursement, travaux, sessions et ciphertexts nécessaires. Une ancienne confirmation Stripe ne justifie ni une nouvelle attribution ni un nouveau débit.

Le contrôleur lit réellement dans PostgreSQL la présence/version Flyway et les migrations en échec. `current_schema_version`, déclaré après inspection, doit correspondre à cette valeur observée, dans la plage du manifeste. Cette concordance ne remplace pas la **revue de compatibilité du code et des écritures** : `rollback_schema_reviewed=true` reste requis. Il n’existe ni migration descendante ni restauration automatique.

## Retour explicite par le workflow

1. Reprendre les préconditions et protections de [deploy.md](deploy.md). Suspendre le parcours concerné et arrêter les écrivains du projet autorisé avant la reprise ; le contrôleur exige cette quiescence. Le commerce reste fermé. Garder la configuration et les secrets propres à l’environnement.
2. Choisir le manifeste précédent, sans le reconstruire. Pour production, faire approuver son empreinte exacte dans `APPROVED_STAGING_RELEASE_SHA256` après revue de sa compatibilité avec l’état actuel ; ne pas utiliser cette variable pour contourner la recette ou ses incidents ouverts.
3. Déclencher explicitement **Manual image release** avec `operation=rollback`, environnement, manifeste canonique, SHA-256, version SQL inspectée et `rollback_schema_reviewed=true`. Les protections de branche et l’éventuelle règle de revue de l’environnement restent appliquées. Le contrôleur compare la version SQL réelle à celle déclarée et refuse une version hors de la plage du manifeste.
4. Le contrôleur applique les images par digest, vérifie configuration et labels OCI, puis démarre seulement API/web/Caddy avec `--no-build --no-deps --wait`. Il **ne lance pas migrate** dans ce mode et ne redémarre pas PostgreSQL comme dépendance. Si la base est indisponible, traiter d’abord cet incident : un retour d’image n’est pas une réparation de base.
5. Vérifier la sonde HTTPS, la session/CSRF, un accès autorisé et un refus propriétaire pertinents à l’incident. Le workflow ne doit pas annoncer un effet humain, une vente rouverte ou une réparation d’une cause inconnue à partir du seul smoke. Il actualise `current` après sa sonde, puis libère son verrou.

Un échec conserve le verrou hôte et les logs privés. Ne pas enlever le verrou, tuer des processus, redéployer ou supprimer des volumes à l’aveugle : une annulation GitHub/SSH n’assure pas l’annulation côté serveur. L’opérateur vérifie le propriétaire de l’essai, l’absence d’opération active et les faits Flyway avant la reprise explicite. Un registre indisponible ou une image supprimée reste un blocage ; le workflow ne choisit aucune image de remplacement.

## Si les images anciennes sont incompatibles

Préférer une correction vers l’avant et une nouvelle release vérifiée. Une restauration de données peut perdre des écritures récentes ; elle relève d’une procédure séparée avec cible/point de reprise explicitement choisis, autorisation applicable, sauvegarde des données actuelles et répétition isolée. Ne jamais lancer `compose down --volumes`, supprimer des migrations, modifier une ligne Flyway ou importer un dump de production pour rendre ce rollback possible.

Après une restauration autorisée, rapprocher commandes, droits, remboursements, inbox/outbox et source Stripe avant toute réouverture commerciale. Le statut d’un email ou d’un lien signé n’est pas une preuve de remboursement ou de révocation de tous les accès indépendants.

Références : [Compose et recréation des services](https://docs.docker.com/reference/cli/docker/compose/up/), [version immuable Docker](https://docs.docker.com/reference/cli/docker/image/pull/), [contraintes de changement de version PostgreSQL18](https://www.postgresql.org/docs/18/upgrading.html), [migrations et limites du projet](../DEPLOYMENT.md). Les changements de version majeure PostgreSQL décrits par la source ne sont pas assimilés à un simple retour de schéma applicatif.
