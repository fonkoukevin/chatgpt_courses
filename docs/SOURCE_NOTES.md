# Sources et provenance du kit

Préparation : 7 novembre 2026. Ce document distingue les décisions propres au projet et les références externes. Les versions logicielles exactes seront vérifiées dans l'environnement réel pendant P00/P01.

## Références du projet

Le périmètre résulte du cahier fonctionnel ChatGPT Courses V1, de l'analyse fonctionnelle antérieure, du planning et des échanges du projet. Les décisions récentes et le cahier détaillé priment sur une ancienne proposition générale. La matrice F01–F54 conserve les priorités ; elle ne transforme pas les options en engagements commerciaux.

Le prompt Figma préparé auparavant sert de contexte de conception. Le présent kit précise le fonctionnement réel, les contrats, les migrations et la livraison nécessaires au développement. Les anciennes maquettes ne sont pas une base visuelle validée.

Les dossiers Client R, BR01, TR01 et BR02 sont des exemples pédagogiques fictifs. Leurs données et montants ne constituent ni une offre réelle de formation ni des témoignages.

## Conception visuelle

Les interfaces publiques suivantes ont été examinées visuellement lors de la préparation :
- https://chatgpt.com/
- https://chatgpt.fr/

La charte proposée reprend des principes observables : surfaces sobres, hiérarchie, navigation et accents de couleur. Les tokens, composants et dispositions du kit sont une proposition originale pour ce produit ; ils ne prétendent pas reproduire les valeurs CSS internes de ces sites.

## Travail avec Codex

- Instructions de dépôt AGENTS.md : https://developers.openai.com/codex/guides/agents-md
- Bonnes pratiques de travail : https://developers.openai.com/codex/learn/best-practices

Ces pages ont été consultées et redirigent actuellement vers la documentation ChatGPT Learn. Le kit conserve un AGENTS.md court, des références ciblées, un périmètre par tâche et des résultats vérifiables. Les capacités, quotas et écrans d'un environnement Codex particulier ne sont pas supposés ; P00 constate ce qui est réellement disponible.

## Frontend, langues et accessibilité

- Authentification Next.js : https://nextjs.org/docs/app/guides/authentication
- Internationalisation Next.js : https://nextjs.org/docs/app/guides/internationalization
- Hébergement Next.js : https://nextjs.org/docs/app/guides/self-hosting
- Versions localisées, Google Search Central : https://developers.google.com/search/docs/specialty/international/localized-versions
- Référence rapide WCAG 2.2 : https://www.w3.org/WAI/WCAG22/quickref/

Les choix Spring pour l'authentification et les sessions appartiennent à l'architecture du projet. Une bibliothèque frontend d'identité supplémentaire n'est pas requise pour suivre la documentation Next.js.

Le bilinguisme est une architecture éditoriale et technique. Les URL et annotations aident les moteurs à comprendre les variantes ; elles ne garantissent pas un niveau de trafic. La cible d'accessibilité du kit n'est pas une certification obtenue par la rédaction de ce document.

## Backend, paiement et livraison

Les références détaillées sont regroupées dans docs/ARCHITECTURE.md et docs/DEPLOYMENT.md : Spring Security et Session, PostgreSQL, Stripe, Docker, GitHub Actions, Caddy, stockage et outils de test.

Lors de l'implémentation, vérifier les pages correspondant aux versions installées, particulièrement pour Spring Security, la mise en cache de Next.js, les webhooks Stripe et les formats de configuration. Un exemple de contrat dans le kit devient fiable par son implémentation, ses tests et sa revue ; il n'est pas une déclaration qu'un fournisseur a déjà été configuré.

## Ce qui relève d'une proposition

L'organisation du monorepo, la session JDBC, la stratégie de contrats, les tokens graphiques et l'ordre des lots sont des décisions d'implémentation proposées pour rendre la stack cohérente. Les prix, conditions commerciales, langues réellement publiées, prestataires et capacités de support restent à renseigner selon docs/DECISIONS.md. Toute modification explicite du propriétaire doit être répercutée dans les documents concernés.

