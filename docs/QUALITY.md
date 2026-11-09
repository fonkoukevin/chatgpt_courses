# Qualité vérifiée et limites

Les preuves par lot font autorité. WCAG2.2 AA est un objectif de travail ; les contrôles locaux ne constituent pas une certification.

La recette `verify:quality` utilise les builds de production locaux, PostgreSQL et S3 isolés, sans paiement externe. Elle contrôle clavier/focus/dialogues, erreurs, perte réseau, confirmation de sauvegarde, concurrence412, expiration réelle de session, deux propriétaires, CSRF, redirections et intégration dans un cadre. Les scénarios conservent les échecs et ne réessaient pas pour fabriquer une réussite.

Le catalogue et l’atelier sont examinés en FR/EN, aux largeurs1440,1024,768,390,320 et avec texte doublé à390. L’agrandissement porte sur la taille de texte calculée, pas sur un zoom navigateur. Les contrôles de contraste portent sur les jetons effectivement utilisés ; `verify:contrast -- P17` enregistre19 paires et leur seuil texte ou contrôle/focus.

Les [budgets](performance-budgets.json) proviennent de douze navigations Chromium sans cache navigateur, sur HTTP loopback, CPU sans ralentissement et serveurs déjà lancés. Ils contrôlent JavaScript encodé384KiB, décodé1,25MiB, CSS décodé48KiB, médiane de disponibilité1500ms, maximum2500ms, instantané LCP1500ms et CLS0,05. Trois mesures par page/langue ne sont ni un percentile visiteur ni une mesure mobile réelle. Un dépassement exige une analyse ; aucun seuil n’est relevé automatiquement.

Les mesures SQL comptent les exécutions terminales du JdbcTemplate de service sur un vrai PostgreSQL. Elles excluent authentification/session HTTP, préparation des fixtures et sérialisation. Les tailles de réponse sont mesurées séparément ; une taille égale ne prouve pas une identité de contenu. Les optimisations conservent propriétaire, version, langue, origine, période et chaîne publiée, sans cache partagé privé.

Login et inscription sont limités par session CSRF existante, respectivement20/300s et5/900s, avec429 et Retry-After. Une nouvelle session possède un nouveau compteur : ce mécanisme ne prétend pas être une protection antibot globale. Les quotas d’email et de fichiers restent indépendants.

Les refus d’accès historiques P12/P15 restent ouverts. Une récidive après READY impose de garder les faits minimisés avant nettoyage et d’arrêter la validation du parcours concerné. Les succès ultérieurs ne démontrent pas un correctif de cause inconnue.
