# AUD-01 à AUD-05 : livraison sur la recette

État au **22 novembre 2026** : **la release est déployée et vérifiée sur la recette**, source `07f4fc6`, schéma **21**. Les cinq services sont sains. Le gate temporaire des fichiers est retiré et le verrou global de la fenêtre opérateur est libéré.

**P18 est publié et sélectionné sur la recette** : 14 identités, 28 traductions publiées, 18 fichiers READY et 26 sélections confirmées. Sept cartes de catalogue sont observées par langue ; l’accueil et le cours pointent vers l’essai M01 exact. Les quatre parcours navigateur FR/EN sur ordinateur et mobile passent ; vingt captures originales sont examinées.

[Résumé public observé](AUD-01-05-staging-observed.json) · [Manifeste canonique](AUD-01-05-release-manifest.json)

## Périmètre autorisé

L’utilisateur autorise le déploiement pour ses essais, puis P18 en français et en anglais avec ouverture gratuite temporaire des six modules **sur la recette uniquement**. Cette adaptation FREE est séparée des sources éditoriales. La production, P22 et le commerce LIVE restent hors périmètre. Les paramètres Stripe TEST historiques sont préservés ; aucune nouvelle activation commerciale n’est effectuée. La publication technique ne constitue pas une revue pédagogique humaine.

## Release et vérifications

- [PR 13 fusionnée](https://github.com/fonkoukevin/chatgpt_courses/pull/13), commit `07f4fc6e5dc38560d4a7f02358471f7ed909d663`.
- [CI main 45003601899](https://github.com/fonkoukevin/chatgpt_courses/actions/runs/45003601899) réussie : 283 tests API dans 42 suites, sans échec, erreur ni saut ; 190 tests de scripts, 133 tests client, quatre parcours navigateur et 12 contrôles de configuration production isolée. Les premières attentes de migration restées sur 20 ont été corrigées pour 21 ; aucun contrôle n’a été désactivé.
- [Plan 45003620998](https://github.com/fonkoukevin/chatgpt_courses/actions/runs/45003620998), [publication 45004256922](https://github.com/fonkoukevin/chatgpt_courses/actions/runs/45004256922) et [déploiement 45005512270](https://github.com/fonkoukevin/chatgpt_courses/actions/runs/45005512270) réussis. Migration invoquée, images publiées promues sans reconstruction pendant le déploiement, smoke réussi et pointeur actif avancé.
- Manifeste de **399 octets**, source et digests relus, schéma `21..21`, SHA256 `c2e104d0db69433fe67bfdabd055c58ab495f0d98092c9fa5f045d55106087fc`.
- **11 sondes depuis le PC réussies**, TLS vérifié et absence de challenge HTTP Basic. L’origine de recette est [staging.chatgpt-courses.com](https://staging.chatgpt-courses.com).

## Sauvegarde et préservation

Avant la migration, le gate a été limité aux méthodes d’écriture de l’origine fichiers. Les seuls API et web de la cible ont été arrêtés. Le TTL effectif de 300 secondes et les horloges JVM/PG ont été mesurés ; l’expiration des anciennes autorisations d’upload a été constatée avant drainage gracieux et redémarrage du même S3.

La sauvegarde chiffrée porte le reçu `51a8388b47cec229281e86faeb9bc61796201af9ad041d96905995beeb1a1381`. La copie PC, le retour de ses **14 fichiers** et tous les tags d’authentification ont été vérifiés. Une restauration réelle sur des volumes et un réseau isolés a validé **83 tables, 10 objets**, leurs métadonnées et l’empreinte de la clé outbox. Les deux cibles de contrôle sont arrêtées et conservées avec leurs preuves.

Limite maintenue : aucun payload outbox non nul n’était disponible. Le déchiffrement d’un message historique n’a donc pas été exercé (`no-non-null-sample`).

La vérification après déploiement porte sur les 83 tables antérieures : **81 sont strictement identiques**. L’historique des 20 premières migrations Flyway conserve son empreinte complète et la migration 21 est ajoutée. Les deux tables de sélection V021 étaient vides à ce stade, **avant l’import P18**.

Les seules autres différences concernent les deux mêmes jobs de `refund_reconciliation_jobs` : `state`, `lease_id`, `lease_until`, `next_attempt_at` et `updated_at`. Identités, faits stables, tentatives et erreurs restent identiques. Ce diagnostic opérationnel est séparé des empreintes strictes ; aucune tolérance n’a été appliquée à la capture ou à la restauration.

Les 10 objets S3 et leurs octets, empreintes, MIME et dispositions ont été comparés de nouveau avant P18. Les **24 autres conteneurs et quatre autres sites** sont préservés.

## Incident du vérificateur et complément V2

L’observation `deployed` du runner initial a échoué à 09:04:24 UTC avec `AUD_BACKUP_COMMAND_FAILED` : Compose avait recréé PostgreSQL et supprimé l’ancien identifiant attendu. Le bind relatif du script initroles pointe sur le nouveau dossier de release ; l’image 18.6, le volume de données, les secrets et les octets du script sont conservés. Le périmètre historique du même runner aurait aussi refusé les nouveaux identifiants API/web. Les échecs et verrous de phase originaux restent conservés.

Les inspections indépendantes ont ensuite attribué les différences de représentation : ordre des entrées Env et des tableaux Binds/Mounts de PostgreSQL, puis ordre des six Mounts API. Les valeurs sont inchangées ; les empreintes complètes Config et HostConfig antérieures sont **reconstruites exactement**. Le HostConfig web est brut identique. Les contrôles d’image, de volume, de secrets, de réseau et de configuration effective restent stricts.

La famille distincte `AUD_STAGING_POSTDEPLOY_COMPLEMENT_V2` a réellement réussi ses phases de vérification et de retrait du gate. Le reçu natif de retrait est `d7ea67afe9d48ab1bbf459c57efc9bdea4ad83968b011cf395003b233686892c`. Il atteste la source 21, les données et objets, les services, Caddy et les sites préservés. Les octets Caddy originaux sont restaurés dans le même inode, avec reload seulement. Le contenu du verrou global exact est archivé, puis sa disparition est constatée : `globalWindowReleased=true`.

L’ancien reçu `deployed` demeure en échec. Aucun ancien passage n’a été fabriqué, aucun rollback de schéma, repair ou redémarrage des anciens API/web n’a été effectué.

## P18 : finalisation et recette navigateur réussies

Deux tentatives d’import ont été interrompues lors de la persistance d’un checkpoint du journal local. Le code système et le mécanisme précis de la première interruption restent inconnus. La seconde a retourné `EPERM` lors d’un renommage du journal, depuis un répertoire privé **hors OneDrive**. Les journaux, états déjà commis et échecs sont conservés.

La réconciliation SQL réellement exécutée en lecture seule **avant le finaliseur** a confirmé 18 historiques de sélection ; l’intention concernant le **module M04 en français** était `NOT_APPLIED`, avec zéro historique pour cette intention. L’acteur technique de cette tentative interrompue était `DISABLED`, avec zéro rôle actif. Ce relevé historique est conservé séparément du résultat final.

Le finaliseur a réellement complété les huit sélections manquantes. Son journal par ajout comporte **146 instantanés durables** ; l’empreinte du dernier est `77b0b98d234e8b055dd27a9ebd73d99f350585a7e200a815001787e54b61112c`. Le résultat confirmé est de **28 traductions PUBLISHED, 18 fichiers READY et 26 sélections**, pour 14 identités et sept cartes par langue. Aucune offre ni aucun droit d’accès n’a été créé pour cette opération.

Les octets des **14 fichiers RESOURCE** ont été vérifiés par téléchargement anonyme. Les **quatre fichiers SOLUTION** restent protégés : les demandes anonymes reçoivent un refus 404. Le cours, le catalogue et la mise en avant de l’essai M01 exact ont été vérifiés par les contrats publics. L’acteur technique du finaliseur est désactivé, ses rôles actifs sont à zéro et son ancienne session est rejetée avec 401.

La recette navigateur externe est réellement effectuée avec Chromium, TLS vérifié, quatre contextes vierges : FR/EN en1440×1000 et390×844. Chaque parcours suit les vrais liens accueil → cours → M01, contrôle les six liens du programme, le contexte de langue et les quatre moments de l’atelier. L’essai commence vide, avec copie/export désactivés. Une saisie fictive est ensuite copiée dans le vrai presse-papiers et téléchargée en Markdown : **quatre copies et quatre exports réels**, sans consigne ni corrigé dans les exports, langue de rédaction FR conservée même depuis l’interface EN. Les octets téléchargés et les vingt captures sont hashés et relus.

Les **vingt captures originales sont ouvertes et examinées individuellement**, dix FR par l’agent principal et dix EN par l’agent de revue. Aucun défaut visuel bloquant, débordement horizontal, erreur JavaScript, erreur console ou HTTP inattendue n’est observé. Le reçu navigateur conserve son état automatique `passed-awaiting-visual-review` ; deux reçus de revue distincts apportent le verdict visuel sans réécrire l’observation initiale. Empreinte de cette observation : `ff372f828ffbfba3757f70103bff173677df9a2aa6c024c01de3795a2c4e61f0`.

Le premier passage navigateur s’est arrêté sur la comparaison littérale du presse-papiers, après quatre captures et sans export. Un diagnostic réel prouve que le champ contient112 caractères avec LF et le presse-papiers113 avec CRLF ; le texte est strictement identique après cette seule conversion de fin de ligne Windows. Seule la garde du test navigateur est adaptée, avec six tests réussis dont le refus d’une différence de texte réelle. Le nouveau passage explicite4/4 réussit ; l’échec et le diagnostic restent conservés, aucun changement produit ni nouveau déploiement n’est nécessaire.

Limites de cette recette : parcours anonymes, sans compte créé, progression durable, production privée ni paiement exercé. Les longues captures complètes de M01 sont réduites par l’outil d’affichage ; les vues originales de l’essai au format du viewport sont également examinées. La revue visuelle ne constitue pas une validation pédagogique humaine. Les captures historiques restent des preuves distinctes.

Les vérifications locales du finaliseur comprennent37 gardes/transport/reprise, six tests d’écriture immuable et cinq tests de finalisation, dont l’arrêt avant sélection si une révision publiée dérive. Le SQL minimal de l’acteur conserve ses12 contrôles sur PostgreSQL isolé avec21 migrations réelles. Ces contrôles complètent les preuves distantes, sans s’y substituer.

Les refus historiques P12/P15 et les décisions pédagogiques et commerciales avant lancement restent ouverts. Aucun paiement LIVE, vidéo tournée, durée ou validation humaine n’est inventé. Le fichier Next utilisateur reste préservé et exclu des commits.
