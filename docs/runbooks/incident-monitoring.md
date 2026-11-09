# Observer et traiter un incident

P20 fournit des sondes et une procédure locale vérifiée ; il n'a configuré ni service de surveillance extérieur à l'hôte, ni destinataire d'alerte, ni intégration Sentry/Uptime Kuma ou équivalente. **Aucune alerte n'a été envoyée.** Une sonde exécutée sur l'hôte ne peut pas constater sa propre disparition. La [preuve locale](../evidence/P20-integration-checks.json) et la future recette distante doivent rester distinctes.

## Observations disponibles

- `GET /api/v1/system/health` retourne seulement `{"status":"UP"}` après une lecture PG, ou une erreur expurgée. Il ne valide ni SMTP, S3, vidéo, Stripe, contenu, autorisations d'un apprenant ou intégrité de toutes les données.
- La sonde image API est une classe Java indépendante de Spring ; le serveur normal ne lance pas Flyway. Compose attend PG sain, la migration one-shot terminée, puis API/web/Caddy sains. Un état `healthy` ne constitue pas une recette fonctionnelle complète.
- [monitor.mjs](../../scripts/deployment/monitor.mjs) observe l'HTTPS de santé, l'âge/statut d'un reçu de sauvegarde et l'espace libre du chemin demandé. Il renvoie des codes et compteurs, sans envoyer de notification externe.
- Docker utilise une rotation locale des journaux (`10m`, trois fichiers par service dans Compose). Cette rotation n'est ni une rétention métier, ni une collecte hors hôte. Les mesures ponctuelles mémoire/CPU de P20 ne démontrent pas une capacité de trafic.

Installer seulement les outils du commit vérifié sur une cible autorisée ; le bundle minimal de déploiement ne copie pas automatiquement tous les outils de maintenance. Les exemples suivants utilisent Node 24.22.2 et les scripts du dépôt. Aucune configuration `.env.local` du développeur ne doit être chargée sur l'hôte.

## Commandes de contrôle

Sur une origine réelle autorisée avec certificat vérifié :

```bash
node scripts/deployment/monitor.mjs \
  --origin "$PUBLIC_ORIGIN" \
  --backup-receipt "$BACKUP_RECEIPT" \
  --disk-path "$DATA_DIRECTORY" \
  --max-backup-age-seconds 86400 \
  --min-disk-free-bytes 5368709120
```

En staging, ajouter `--basic-username "$STAGING_USER" --basic-password-file "$STAGING_PASSWORD_FILE"`. Ne pas mettre le mot de passe dans l'argument ni publier le contenu du reçu privé. Pour un certificat issu d'une CA privée autorisée, ajouter `--ca-file "$CA_FILE"` ; ne pas désactiver la validation TLS ou du nom d'hôte. L'option `--local-loopback true` est réservée au harness HTTPS local en `.localhost`, sans changement du magasin de confiance système ; elle ne doit pas détourner une sonde de serveur réel vers la boucle locale.

Les seuils indiqués sont des défauts techniques de travail, à ajuster aux mesures et à la politique décidée ; une absence d'alerte ne prouve ni la validité de l'archive chiffrée, ni une copie hors hôte, ni un RPO. Vérifier séparément SHA, authentification GCM et restauration. Prévoir aussi un contrôle depuis un autre hôte et un canal de notification explicitement autorisé, puis un test de réception ; leur installation/envoi ne sont pas effectués ici.

Interprétation du CLI : sortie 0 sans alerte, 2 si des alertes sont présentes, 1 pour des arguments/configurations invalides ou un échec global du CLI. Conserver le résultat horodaté et le code de sortie réel ; ne pas transformer un échec d'observation en valeur zéro ou en succès. Les codes sont `HTTP_UNAVAILABLE`, `BACKUP_RECEIPT_MISSING`, `BACKUP_STALE_OR_INVALID`, `DISK_SPACE_LOW` et `DISK_CHECK_UNAVAILABLE`. Un reçu futur, invalide, non chiffré-authentifié ou trop ancien est signalé. Une mesure disque impossible reste une alerte explicite. Un problème TLS/Basic peut expliquer le contrôle HTTP sans établir une panne PG : diagnostiquer la chaîne concernée.

Après sélection explicite du projet et de ses fichiers Compose selon [backup-restore.md](backup-restore.md), les lectures suivantes aident l'opérateur :

```bash
"${DC[@]}" ps
"${DC[@]}" logs --since 15m --tail 200 api web caddy postgres
mapfile -t SERVICE_IDS < <("${DC[@]}" ps -q)
if ((${#SERVICE_IDS[@]})); then docker stats --no-stream "${SERVICE_IDS[@]}"; fi
```

Limiter l'analyse aux conteneurs du projet vérifié. Les logs bruts restent dans un espace opérateur privé : ne pas les joindre à une issue ou à un artefact public sans examen/expurgation. Ne pas afficher secrets montés, configurations résolues, cookies, jetons CSRF, prompts, notes, messages support, données bancaires ou URLs signées. Les sorties publiques attendues sont des codes, identifiants techniques nécessaires, comptes et empreintes autorisés, jamais un corps privé.

## Décider sans effacer les faits

| Signal | Réponse opérateur |
| --- | --- |
| HTTP/TLS/Basic indisponible | Conserver code/heure et version active. Vérifier DNS/certificat, garde staging, Caddy→Next→Spring et santé PG sur le projet concerné. Ne pas mettre TLS en mode permissif pour faire passer le smoke. |
| Sauvegarde absente/ancienne/invalide | Vérifier le dernier reçu réel, les fichiers, SHA et clé séparée, puis la copie hors hôte. Une nouvelle date ou un reçu fabriqué ne remplace pas une sauvegarde. Suspendre une migration risquée tant que sa précondition n'est pas établie. |
| Disque faible ou mesure impossible | Inspecter le bon volume et les journaux avant action. Ne pas supprimer un volume PG/S3 ni des sauvegardes sans politique et autorisation applicables. Les journaux tournants ne garantissent pas de l'espace pour une nouvelle sauvegarde. |
| Migration en échec | Garder API/web arrêtés, conserver faits Flyway et logs privés. Ne pas modifier les migrations appliquées, vider l'historique ou déclencher un `repair` pour masquer la cause. Préférer une correction vers l'avant, après sauvegarde et revue. |
| Paiement/remboursement UNKNOWN ou NEEDS_REVIEW | Consulter l'opération et les incidents autorisés, puis le rapprochement existant. Ne pas refaire un POST financier, attribuer manuellement un droit ou déclarer PAID à partir d'une URL de retour. Paiement, attribution et email restent distincts. |
| Email en panne | Traiter l'outbox et son transport autorisé sans refaire l'achat ou l'attribution. Préserver la clé de chiffrement existante ; ne pas envoyer le contenu privé du payload pour diagnostiquer. |

Pour toute perte d'accès inattendue après `PAID/READY`, arrêter le parcours et la réouverture commerciale. Les [deux occurrences historiques P12](../evidence/P12-access-follow-up.md) et les [deux occurrences P15](../evidence/P15-access-follow-up.md) restent de cause inconnue. Avant tout nettoyage, relever une fois les états autoritaires, le propriétaire/contexte attendu et les prédicats expurgés de période/langue/version/publication/chaîne/origine ; aucun corps privé. Ne pas réessayer le refus jusqu'à obtenir 200, antidater un droit ou présenter un succès ultérieur comme un correctif.

Conserver également l'historique du premier timeout de rapprochement remboursement P19 : la dernière recette 6/6 n'a pas observé de bail abandonné actif, donc n'a pas démontré cette hypothèse ni exécuté sa branche d'attente prolongée. Ne pas effacer arbitrairement un bail, une réservation ou une opération pour obtenir un statut vert.

## Reprise et limites d'exploitation

Identifier la release et les conteneurs **réellement actifs** : le lien `current` peut encore désigner la dernière release saine après un échec partiel. Respecter le verrou de déploiement ; une rupture SSH ou un timeout n'assure pas la fin de l'opération distante. Inspecter la propriété et l'activité avant de lever un verrou. Ne pas arrêter des processus utilisateur ou des piles voisines par approximation.

La reprise d'images suit [rollback.md](rollback.md), une restauration de données suit [backup-restore.md](backup-restore.md). Aucune ne reconstitue automatiquement l'état financier externe. Garder commerce et envois réels fermés jusqu'aux contrôles nécessaires, sans effacer productions personnelles, origines indépendantes, inbox/outbox ou preuves d'incident.

Restent à confirmer avant exploitation : fréquence effective des observations, objectifs RPO/RTO, politique de rétention, responsable/canal d'alerte autorisé et disponibilité d'un observateur extérieur à l'hôte. Il n'existe à ce stade ni alerte reçue, ni surveillance distante observée, ni garantie de disponibilité déduite du seul exercice local.
