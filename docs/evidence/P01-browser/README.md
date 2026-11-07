# Recette navigateur P01 — référence validée

Validation locale du **8 novembre 2026**, Windows 11, Node 24.22.2, Playwright **1.65.0**, Chromium/Chrome for Testing **158.0.8127.18** (révision 1254). L’utilisateur a autorisé explicitement cette méthode avec un navigateur isolé ; aucun onglet personnel utilisé.

Code correspondant : **`e1616bd`**. [Rapport brut](2026-11-07T23-49-32-593Z-7a970fd1-4ccf-4f31-8849-ce172e161f4a/results.json), [session et confirmation d’arrêt](2026-11-07T23-49-32-593Z-7a970fd1-4ccf-4f31-8849-ce172e161f4a/session.json).

Le nom du dossier utilise UTC ; le début des tests à `2026-11-07T23:49:44Z` correspond au **8 novembre à 00:49:44 à Paris**.

## Résultat exécuté

`.\scripts\courses.cmd run verify:browser` : **7 réussis, 0 échec, 0 ignoré, 0 instable, sans retry**, durée **18,929 s**. Nettoyage confirmé pour Next, les deux processus Spring successifs et le runner ; aucun écouteur restant sur 3101/8181.

- FR/EN à **1440 × 1000**, **390 × 844** et **320 × 844** : lien d’évitement, focus de la zone principale puis boutons, requêtes réelles et état visible.
- Réponse Spring/PostgreSQL `UP`, véritable 404 Problem, focus conservé et contour visible après traitement ; pas de défilement horizontal ni d’exception JavaScript.
- Arrêt réel de Spring, Next toujours disponible avec le même PID, message d’indisponibilité dans les deux langues, redémarrage et « Réessayer » confirmant la reprise avec transfert de focus approprié.

## Revue réelle des captures

Les **16 PNG** ont été ouverts et examinés. Marque dégagée, textes et boutons lisibles sans troncature/chevauchement, états distincts et traductions cohérentes ; contour bleu visible après les actions clavier. Aucun défaut supplémentaire observé sur ce périmètre. Ce contrôle ne constitue pas un audit WCAG global ni un test de téléphone physique ou de tous les navigateurs.

Exemples de référence :

- [FR 390 — connexion et focus](2026-11-07T23-49-32-593Z-7a970fd1-4ccf-4f31-8849-ce172e161f4a/fr-390-healthy.png)
- [EN 320 — erreur 404 et focus](2026-11-07T23-49-32-593Z-7a970fd1-4ccf-4f31-8849-ce172e161f4a/en-320-http404.png)
- [FR ordinateur — erreur 404](2026-11-07T23-49-32-593Z-7a970fd1-4ccf-4f31-8849-ce172e161f4a/fr-1440-http404.png)
- [FR — API indisponible](2026-11-07T23-49-32-593Z-7a970fd1-4ccf-4f31-8849-ce172e161f4a/fr-api-unavailable.png)
- [FR — reprise](2026-11-07T23-49-32-593Z-7a970fd1-4ccf-4f31-8849-ce172e161f4a/fr-api-recovered.png)

## Corrections et interprétation

Le focus perdu quand un bouton devenait `disabled` a été confirmé dans le DOM. La correction conserve les contrôles focalisables avec `aria-disabled` et garde synchrone contre les doubles appels. « Réessayer » reste monté pendant le chargement ; son retrait après réussite rend le focus à « Vérifier » seulement si nécessaire. La cible du lien d’évitement est focalisable.

Le lien fixe apparaissant sur les premières captures mobiles était un artefact de capture pleine page après défilement : son rectangle DOM était hors du viewport. La capture revient maintenant en haut sans modifier le focus. Le soupçon de contact entre paragraphes a été écarté après zoom et mesure : environ 33 px séparaient réellement leurs lignes ; aucun espacement arbitraire ajouté.

Les deux exécutions d’investigation précédentes sont conservées localement dans `.runtime/browser-investigation`, hors des références validées ; aucun fichier utilisateur ou volume n’a été supprimé. Les rapports/captures ci-dessus correspondent à la suite renforcée et au correctif de focus.
