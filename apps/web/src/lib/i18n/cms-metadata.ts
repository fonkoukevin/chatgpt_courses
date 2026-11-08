import type { Locale } from "./locales";

const fr = {
  open: "Métadonnées publiques", title: "Préparer les informations publiques", close: "Fermer les métadonnées",
  help: "Ces informations appartiennent à une révision. Les enregistrer crée un brouillon ; la publication actuelle reste inchangée jusqu’à une nouvelle revue et publication.",
  goals: "Tâches couvertes", goalsHelp: "Sélectionner uniquement les tâches réellement couvertes par ce contenu.",
  goal: { "understand-brief": "Comprendre un brief", "define-scope": "Définir une prestation", "prepare-prompt": "Préparer une demande", "build-proposal": "Construire une proposition", "check-output": "Contrôler un résultat", "reuse-method": "Réutiliser une méthode" },
  level: "Niveau", none: "Non renseigné", levels: { BEGINNER: "Débutant", INTERMEDIATE: "Intermédiaire", ADVANCED: "Avancé" },
  audience: "Public concerné", lines: "Une entrée par ligne, dix au maximum.", tools: "Outils utiles", toolName: "Nom de l’outil", url: "Lien", optionalUrl: "Lien facultatif", addTool: "Ajouter un outil",
  sources: "Sources publiques", sourceLabel: "Libellé de la source", addSource: "Ajouter une source", faq: "Questions fréquentes", question: "Question", answer: "Réponse", addFaq: "Ajouter une question",
  evaluation: "Modalités publiques de vérification", evaluationHelp: "Décrire la vérification sans révéler les réponses, le corrigé ou une certification non fournie.",
  reason: "Motif de cette révision", remove: "Retirer", save: "Enregistrer les métadonnées", saving: "Enregistrement…", saved: "Métadonnées enregistrées dans un brouillon. La publication actuelle reste inchangée.",
  dirty: "Des métadonnées non enregistrées sont conservées ici. Rouvrez ce panneau pour les enregistrer ou les abandonner avant de modifier le contenu.",
  required: "Renseignez le champ indiqué.", tooLarge: "Ces métadonnées dépassent 16 Ko. Réduisez leur taille avant de réessayer.",
  copy: "Copier la saisie", copied: "Saisie copiée.", copyFailed: "La copie a échoué. Vous pouvez sélectionner le texte ci-dessous.",
  discard: "Abandonner les modifications", discardHelp: "Les métadonnées locales et leur motif seront remplacés par la dernière version connue du serveur.", confirm: "Confirmer", cancel: "Annuler",
  conflict: "Les métadonnées ont changé sur le serveur. Votre saisie est conservée.", local: "Votre saisie", server: "Version serveur", reload: "Recharger le serveur", retry: "Relire la version serveur",
  keep: "Conserver ma saisie sur cette révision", keepHelp: "La saisie reste locale. Une nouvelle sauvegarde explicite sera nécessaire avec la révision serveur affichée.",
  busyParent: "Terminez les modifications du contenu principal avant d’enregistrer ces métadonnées.",
};
const en: typeof fr = {
  open: "Public metadata", title: "Prepare the public information", close: "Close metadata",
  help: "This information belongs to a revision. Saving creates a draft; the current publication stays unchanged until another review and publication.",
  goals: "Tasks covered", goalsHelp: "Select only the tasks this content actually covers.",
  goal: { "understand-brief": "Understand a brief", "define-scope": "Define the scope", "prepare-prompt": "Prepare a prompt", "build-proposal": "Build a proposal", "check-output": "Check an output", "reuse-method": "Reuse a method" },
  level: "Level", none: "Not provided", levels: { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" },
  audience: "Intended audience", lines: "One entry per line, up to ten.", tools: "Useful tools", toolName: "Tool name", url: "Link", optionalUrl: "Optional link", addTool: "Add a tool",
  sources: "Public sources", sourceLabel: "Source label", addSource: "Add a source", faq: "Frequently asked questions", question: "Question", answer: "Answer", addFaq: "Add a question",
  evaluation: "Public description of the checks", evaluationHelp: "Describe the checks without revealing answers, solutions or a certification that has not been provided.",
  reason: "Reason for this revision", remove: "Remove", save: "Save metadata", saving: "Saving…", saved: "Metadata saved in a draft. The current publication stays unchanged.",
  dirty: "Unsaved metadata is kept here. Reopen this panel to save or discard it before editing the content.",
  required: "Complete the indicated field.", tooLarge: "This metadata exceeds 16 KB. Reduce its size before trying again.",
  copy: "Copy local input", copied: "Input copied.", copyFailed: "Copy failed. You can select the text below.",
  discard: "Discard changes", discardHelp: "Local metadata and its reason will be replaced with the latest known server version.", confirm: "Confirm", cancel: "Cancel",
  conflict: "The server metadata has changed. Your input has been kept.", local: "Your input", server: "Server version", reload: "Reload the server", retry: "Read the server version again",
  keep: "Keep my input against this revision", keepHelp: "The input stays local. Another explicit save will be required against the displayed server revision.",
  busyParent: "Finish editing the main content before saving this metadata.",
};
export function getCmsMetadataDictionary(locale: Locale): typeof fr { return locale === "fr" ? fr : en; }
