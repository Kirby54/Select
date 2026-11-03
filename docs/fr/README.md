# Select — présentation en français

**Faites tourner votre entreprise avec des agents IA qui gagnent leur autonomie.**

Des agents de n'importe quel fournisseur travaillent dans une organisation que vous définissez. Chaque résultat est vérifié par du code selon un contrat de livraison, et un agent ne se passe de votre validation qu'une fois que ses résultats vérifiés le justifient, type de tâche par type de tâche, révocable à tout moment.

## Démarrer

```bash
git clone <URL_DU_DEPOT> select
cd select
docker compose up --build
```

Ouvrez <http://localhost:3000>, cliquez sur **Open the demo**, puis **Run demo week** : une semaine enregistrée dans un atelier fictif, sans clé API.

## Les trois idées clés

1. **Contrats de livraison et reçus** : les contrôles sont exécutés par le système, jamais déclarés par le modèle.
2. **Permis d'autonomie** par agent et par type de tâche : surveillé → échantillonné → autonome, avec rétrogradation immédiate à la première erreur.
3. **Compteur honnête** : le taux d'autonomie est toujours affiché à côté du taux d'erreurs détectées après coup.

Les opérations à risque légal (paiements, contrats, impôts, embauche) restent toujours sous supervision humaine, quel que soit le score.

## Limites de la version 0.1

Appels réels aux fournisseurs non testés, image Docker non construite de bout en bout au moment de la publication, aucun envoi externe réel, pas de facture électronique conforme. Voir le [README anglais](../../README.md#limits).

La documentation détaillée est en anglais dans le dossier `docs/`.
