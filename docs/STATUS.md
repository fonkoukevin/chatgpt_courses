# État réel du projet

Dernière mise à jour : **8 novembre 2026**. **P05 validé localement**. Autorisation utilisateur : enchaîner **P04 à P12**, dans l’ordre, en passant au lot suivant seulement après validation du précédent. Aucun ancien prototype repris ni déploiement externe.

## Situation courante

- Dernière phase réalisée : P05, validée localement ; prochaine phase P06, autorisée sans nouvelle confirmation.
- Git local : branche `main`, code P05 **`5dab875`**, P04 **`ba63356`**, P03 **`6a53c19`** ; aucun remote/push. Les 49 fichiers initiaux restent présents.
- Outils : Windows/PowerShell 5.1, Node portable 24.22.2/npm 11.19.1, Temurin 21.0.13+9, Wrapper Maven 3.10.0 ; Docker Linux 29.8.0/Compose 5.5.1.
- Schéma : V001–V003 conservées ; V004 ajoute le workflow éditorial. Upgrade local : 13 comptes, 3 ressources et 6 révisions conservés, aucun compte EDITOR attribué. [DATA_MODEL.md](DATA_MODEL.md).
- Démarrage : `.\scripts\courses.cmd run dev` applique Flyway ; `run seed:local` charge explicitement un dossier fictif en brouillon. [Commandes](../README.md). Applications de vérification arrêtées ; PostgreSQL/Mailpit disponibles pour la suite, volumes et données conservés.
- Preuves [P05](evidence/P05.md) : **52 tests Java**, **25 tests du client**, OpenAPI validé et 17 fichiers générés identiques ; lint/types et builds web/API réussis. CI enrichie du contrôle TypeScript navigateur, YAML analysé ; aucun run GitHub.
- Chromium P05 : **5/5 en 44,8 s**, création/publication/correction/archivage FR/EN, catalogue, ordre clavier, panne Spring, réponse retardée et conflit réel à 390 px. Captures bureau/mobile et sections d’éditeur examinées. PostgreSQL tmpfs de recette et tous les processus supervisés arrêtés ; preuves P00–P04 conservées.
- Blocage P05 : aucun. Dépendances informatives avant archivage, médias non vérifiés bloquants jusqu’à P10, contenu final P18 restant. T04/T15–T18 se complètent dans les lots consommateurs ; aucune validation anticipée des projets/achats/attestations.
- Suite : `prompts/P06_SITE_PUBLIC_CATALOGUE.txt`, puis P07 à P12 automatiquement si chaque lot passe. L’utilisateur prévoit de renseigner les clés Stripe de test dans `.env.local` ; présence à revérifier en P12 sans afficher les valeurs. Prix, conditions et médias commerciaux restent ouverts.

## Phases

| Phase | État | Preuve ou blocage |
| --- | --- | --- |
| P00 | Validé localement | Audit, versions documentaires et préparation P01 ; voir `evidence/P00.md` |
| P01 | Validé localement | Technique et navigateur vérifiés, captures examinées ; voir `evidence/P01.md` |
| P02 | Validé localement | Composants, trois structures, 54 captures et recette ; voir `evidence/P02.md` |
| P03 | Validé localement | Migration, modèles, OpenAPI/client généré, 24 tests Java et intégration réelle ; voir `evidence/P03.md` |
| P04 | Validé localement | Identité, SMTP, session/CSRF, 37 tests Java et 13 scénarios Chromium ; voir `evidence/P04.md` |
| P05 | Validé localement | CMS, publication, 52 tests Java, 25 tests client et 5 scénarios Chromium ; voir `evidence/P05.md` |
| P06 | À faire | Site public |
| P07 | À faire | Méthodes et générateur |
| P08 | À faire | Apprentissage et quiz |
| P09 | À faire | Projets et autoévaluation |
| P10 | À faire | Médias, stockage et emails |
| P11 | À faire | Offres et commandes |
| P12 | À faire | Stripe et attribution |
| P13 | À faire | Remboursements et droits |
| P14 | À faire | Compte, aide et attestations |
| P15 | À faire | Administration d’exploitation |
| P16 | À faire | FR/EN et SEO |
| P17 | À faire | Qualité transversale |
| P18 | À faire | Contenus et offre prête |
| P19 | À faire | Recette et CI complète |
| P20 | À faire | Infrastructure de production |
| P21 | À faire | Déploiement de recette |
| P22 | À faire | Déploiement de production |
| P23 | À faire | Exploitation après lancement |

États permis : à faire, en cours, bloqué, implémenté non vérifié, validé localement, validé en recette, publié et observé. Employer seulement le niveau démontré. Un fournisseur indisponible n’empêche pas les tests locaux mais reste un blocage pour le résultat externe correspondant.

## Dernier lot

CMS réel, versions/traductions, revue, publication, projections et E14/E15 intégrés. Ancien texte conservé, conflits et réponses tardives vérifiés ; défauts observés corrigés puis revérifiés. Aucune publication de production, offre ni compte administrateur connu créé.

Garder ce suivi court ; détailler les commandes et limites dans `docs/evidence/Pxx.md`. Une reprise part des fichiers et preuves présents, sans supposer l’historique de conversation.
