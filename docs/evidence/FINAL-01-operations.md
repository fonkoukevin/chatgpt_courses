# FINAL-01 — préparation de P22 et P23

État au 27 novembre 2026 : **préparation locale, aucune nouvelle livraison ni exploitation planifiée exécutée**. Les observations de cible et la revue du protocole sont distinguées dans [l’inventaire de préparation](FINAL-01-delivery-preparation.json). Le staging observé reste au schéma 21 ; les dernières corrections locales attendent leur CI et leur livraison. Aucun passage en production, paiement LIVE, cron ou envoi d’alerte n’est revendiqué.

## P22 — promotion conditionnée par une cible réelle

La procédure de référence est [deploy.md](../runbooks/deploy.md), complétée par [backup-restore.md](../runbooks/backup-restore.md) et [rollback.md](../runbooks/rollback.md). Les paragraphes historiques de ces runbooks décrivent leurs anciennes releases ; la livraison préparée ici est **21→21**, sans nouveau schéma ni réutilisation d’un manifeste historique limité à 20.

| Étape | Résultat concret attendu avant de poursuivre |
| --- | --- |
| Achever la recette actuelle | Nouvelle PR intégrée par les protections main, CI push/main réussie pour ce commit exact, images publiées une seule fois et manifeste canonique conservé. Sauvegarde actuelle, copie PC/retour, authentification et restauration isolée réellement réussies avant déploiement. Comparaison des 85 tables hors sessions, objets, cinq services, 26 autres conteneurs et quatre anciens hôtes après livraison. |
| Clore la fenêtre de livraison | Retour exact des octets Caddy initiaux dans le même inode, nouvelle release saine et verrou de cette fenêtre libéré après preuve. Le P18 FREE temporaire reste conservé pendant cette comparaison. Une éventuelle publication éditoriale v2 vient ensuite, avec sa propre sauvegarde actuelle et une fenêtre CMS distincte ; elle ne peut être intercalée dans la preuve de conservation des 85 tables. |
| Établir la cible production | Fournir la cible autorisée, origine HTTPS/DNS, projet et volumes distincts, stockage privé, secrets référencés et sauvegarde hors hôte. Aucun environnement GitHub production ni installation sous la racine production attendue n’a été trouvé dans les périmètres inspectés ; cela ne prouve pas l’absence de toute infrastructure ailleurs. Aucun hébergement ou compte n’est créé par cette préparation. |
| Préparer les protections | Créer/configurer l’environnement production sur des faits réels, avec branche protégée et politique du runbook. Ne pas recopier la configuration TEST de staging. Fixer `APPROVED_STAGING_RELEASE_SHA256` à l’empreinte exacte du manifeste effectivement reçu et validé en recette. |
| Planifier puis déployer | Exécuter d’abord le précontrôle `operation=plan` sur cette cible réellement configurée. Promouvoir ensuite les **mêmes digests**, sans rebuild. Pour une base existante : nouvelle sauvegarde vérifiée, quiescence et version SQL observée. La dispense `first_install_empty_database=true` exige une base réellement observée vide. |
| Observer le résultat | Smoke HTTPS, chaîne session/CSRF et accès/refus pertinents, état SQL/objets, isolation et conservation des autres projets ; conserver les reçus. Un lien `current` ou un état healthy seul ne démontre pas cette réception. |

La réouverture commerciale reste distincte : revue humaine, auteur/contact, format/langues/conditions/prix réels et réserves d’accès doivent être traités sans transformer une autoévaluation ou un succès ultérieur en correction d’une cause inconnue. Le code courant refuse LIVE en production ; une clé ou une configuration ne constitue pas une activation. Aucun choix commercial manquant n’est inventé ici.

## P23 — observation et sauvegardes vérifiables

Références : [incident-monitoring.md](../runbooks/incident-monitoring.md), [backup-restore.md](../runbooks/backup-restore.md), [monitor.mjs](../../scripts/deployment/monitor.mjs). Le compte de déploiement inspecté n’avait pas de crontab ; les timers accessibles ne montraient aucun timer Courses. Les autres comptes et les ordonnanceurs extérieurs n’ont pas été exclus. Aucune fréquence opérationnelle existante n’est donc revendiquée.

Les outils de maintenance et leurs imports doivent être copiés depuis un commit contrôlé dans un nouvel espace privé : le bundle de déploiement minimal ne les transporte pas tous. Après une livraison et une sauvegarde réelles, le contrôle ponctuel préparé est :

```bash
"$NODE_BIN" "$TOOLS_ROOT/scripts/deployment/monitor.mjs" \
  --origin "$PUBLIC_ORIGIN" \
  --backup-receipt "$VERIFIED_BACKUP_RECEIPT" \
  --disk-path "$DATA_DIRECTORY" \
  --max-backup-age-seconds 86400 \
  --min-disk-free-bytes 5368709120
```

Cette commande est **préparée, non exécutée ici**. Les paramètres désignent la cible vérifiée et un vrai reçu ; aucun chemin d’infrastructure privé n’est publié. Le staging actuellement observé a Basic désactivé : ne pas lui ajouter de credentials Basic. TLS et le nom d’hôte restent vérifiés. Conserver l’heure, le code de sortie et les champs expurgés : **0** sans alerte, **2** avec alertes, **1** pour un échec global/configuration. Le moniteur vérifie HTTPS/santé PG, âge/statut du reçu et espace libre ; il ne vérifie pas à lui seul les archives, leur copie hors hôte ou les droits d’un apprenant.

| Action à mettre en place sur une décision réelle | Preuve de mise en service nécessaire |
| --- | --- |
| Sauvegarde cohérente et copie indépendante | Fenêtre exclusive bornée, écrivains exclus, dump/objets cohérents, chiffrement authentifié, copie vérifiée et clé séparée. Conserver le vrai SHA de reçu ; ne pas changer sa date pour satisfaire un seuil. |
| Répétition de restauration | Nouvelle cible PG/S3 isolée, toutes les tables et tous les objets comparés, clé outbox conservée, limites des payloads réellement testés ; durée de reprise de service mesurée sur une volumétrie représentative. |
| Fréquence et conservation | Le runbook propose 02:00 et 14:00 UTC, puis un dimensionnement de sept points quotidiens et quatre hebdomadaires. Ce sont des hypothèses à confirmer avec fenêtres, capacité et conservation des données ; aucun timer, purge, RPO ou SLA n’en est déduit. |
| Observation hors de l’hôte | Choisir une cible extérieure existante, une fréquence et un responsable. Une sonde sur le serveur ne constate pas sa disparition. |
| Notification autorisée | Définir le destinataire/canal puis observer un test reçu avant de déclarer l’alerte en service. Le CLI n’envoie aucune notification et aucun message n’a été envoyé par ce lot. |

En incident, conserver les codes et faits autoritaires avant nettoyage. Une connexion imprévue, une écriture ou une échéance dépassée arrête le protocole et conserve les verrous/preuves ; aucun retour d’image, redémarrage, retrait de gate ou effacement de volume n’est automatique. Le workflow de livraison ne connaît pas l’échéance privée de l’opérateur : une nouvelle lecture de readiness juste avant dispatch est requise ; une attente excessive en file ou une expiration impose un diagnostic avant reprise. Une restauration de données et un retour d’images compatibles restent deux opérations distinctes. Aucun rejeu financier, attribution manuelle ou import P18 n’est nécessaire pour cette préparation d’exploitation.
