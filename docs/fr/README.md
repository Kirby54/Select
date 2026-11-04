# Select — guide en français

**Faites tourner votre entreprise avec des agents IA qui gagnent leur autonomie.**

Des agents de tout type — développeurs, marketing, support, commercial — travaillent dans une organisation que vous définissez. Chaque résultat est vérifié par du code selon un contrat de livraison, et un agent ne se passe de votre validation qu'une fois que ses résultats vérifiés le justifient, type de tâche par type de tâche, révocable à tout moment.

> **Version 0.2.** Comptes, démarrage guidé, vraies boîtes mail, routines et boucle de vérification fonctionnent et sont testés de bout en bout. Les appels réels aux modèles et la construction des images Docker n'ont pas encore été vérifiés (voir « Limites »).

## Démarrer en cinq minutes

1. **Installez Docker Desktop** (Windows, macOS) et lancez-le. Sous Linux : Docker Engine avec Compose.
2. **Récupérez Select et lancez-le :**
   ```bash
   git clone <URL_DU_DEPOT> select
   cd select
   ./start.sh            # macOS, Linux
   ```
   ```powershell
   .\start.ps1           # Windows PowerShell
   # si Windows bloque les scripts : powershell -ExecutionPolicy Bypass -File .\start.ps1
   ```
   Le script crée le fichier `.env` avec un mot de passe de base de données et une clé de chiffrement aléatoires (**gardez-en une copie** : sans lui, les clés API et mots de passe enregistrés sont illisibles), démarre les conteneurs, attend que Select réponde et ouvre <http://localhost:3000>. Le premier lancement prend quelques minutes.
3. **Créez votre compte.** La première visite crée le compte propriétaire. Ensuite, on n'entre que sur invitation (Settings → People).
4. **Suivez le démarrage guidé :**
   - **Entreprise** : nom et pays. Le pays règle la devise, les taux de TVA, le fuseau horaire et la langue des e-mails.
   - **Équipe** : un modèle d'équipe (tri du courrier, devis, service client, communication) ou partir de zéro. Vous pourrez ajouter n'importe quel type d'agent ensuite.
   - **Modèle d'IA** : une clé Anthropic, OpenAI ou Gemini, ou un Ollama local. « Later » est possible : rien ne tourne sans clé.
   - **Boîte mail** (facultatif) : les e-mails entrants deviennent du travail.
   - **Catalogue** (facultatif) : collez votre liste de prix depuis un tableur ; les devis ne peuvent utiliser que ces prix.

Pas encore de clé API ? Menu du compte (en haut à droite) → **Open the demo company**, puis **Run demo week** : une semaine enregistrée dans un atelier fictif, sans clé.

## Au quotidien

L'interface (en anglais) tient en six entrées :

| Entrée | Ce que vous y faites |
| --- | --- |
| Home | Les agents actifs, le travail en cours, ce qui vous attend, la dépense IA du mois, le taux d'autonomie à côté du taux d'erreurs trouvées après coup |
| Approvals | Décider : chaque résultat arrive vérifié, avec la raison pour laquelle on vous demande et le contenu exact qui partirait |
| Tasks | Toutes les tâches, et en onglets les routines (tâches planifiées), les projets et les objectifs |
| Messages | Les e-mails reçus et envoyés (visible dès qu'une boîte mail est connectée) |
| Team | L'organigramme, les agents, et ce que chacun a gagné le droit de faire seul |
| Settings | Entreprise, automatisation, personnes, politique d'autonomie, catalogue, votre compte, connexions, coûts |

**New task** (en haut de la barre latérale, ou la touche C) : un titre, des détails et un agent. N'importe quel agent peut recevoir une tâche libre ; son résultat passe toujours par une personne.

## Les e-mails

Une fois la boîte connectée (IMAP pour lire, SMTP pour envoyer) :

1. Select lit les nouveaux e-mails toutes les 2 minutes, sans rien marquer comme lu ni rien déplacer. Les e-mails déjà présents au moment de la connexion ne reçoivent pas de réponse (sauf si vous demandez d'importer les derniers jours).
2. Un agent trie chaque e-mail ; le code l'envoie au bon agent : demande de devis → devis, question client → service client, question de facture ou autre → une personne, spam → nulle part.
3. Le devis est calculé depuis votre catalogue avec la bonne TVA ; chaque quantité doit figurer dans l'e-mail du client, sinon le devis est bloqué.
4. Vous voyez **exactement l'e-mail qui partira**. Une adresse qui ne vous a jamais écrit demande toujours une validation humaine.
5. Select l'envoie une seule fois, dans le fil de discussion du client. Si la connexion coupe pendant l'envoi, l'e-mail est marqué « uncertain » et n'est jamais renvoyé sans votre décision.

Gmail : activez la validation en deux étapes et utilisez un mot de passe d'application. Microsoft 365 et Outlook.com ne sont pas encore pris en charge (connexion OAuth nécessaire). Détails : [mail.md](../mail.md).

## Les trois idées clés

1. **Contrats de livraison et reçus** : les contrôles sont exécutés par le système, jamais déclarés par le modèle.
2. **Autonomie gagnée** par agent et par type de tâche : surveillé → échantillonné → autonome, avec rétrogradation immédiate à la première erreur.
3. **Compteur honnête** : le taux d'autonomie est toujours affiché à côté du taux d'erreurs détectées après coup.

Les paiements, signatures, embauches et déclarations fiscales restent toujours sous contrôle humain, quel que soit le score.

## Limites de la version 0.2

- Appels réels aux fournisseurs de modèles non testés (pas de clé dans l'environnement de développement).
- Images Docker non construites dans l'environnement de développement (registres inaccessibles) ; `start.sh` testé avec un faux `docker`, `start.ps1` pas exécuté (pas de PowerShell).
- Boîtes mail testées avec des serveurs IMAP et SMTP locaux, pas encore chez un vrai fournisseur.
- Les agents écrivent du texte et des résultats structurés via les API ; ils ne travaillent pas encore dans un dépôt de code (pas de Claude Code ni de Codex intégrés).
- Pièces jointes non lues, devis envoyés dans le corps de l'e-mail (pas de PDF), pas de facture électronique, franchise en base de TVA pas encore gérée.

La documentation détaillée est en anglais dans le dossier `docs/` : [cinq minutes](../getting-started.md), [installation](../installation.md), [configuration](../configuration.md), [mail](../mail.md), [déploiement](../deployment.md), [sécurité](../security.md), [dépannage](../troubleshooting.md).
