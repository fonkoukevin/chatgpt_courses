import { record } from "./auth-validation";
import { validMethodText } from "../methods/validation";
import { projectBlockingKeys } from "../projects/schema";
import type { ProjectPolicy } from "./generated/types.gen";

export function isProjectPolicy(value: unknown): value is ProjectPolicy {
  if (!record(value) || Object.keys(value).length !== 4 || Object.keys(value).some((key) => !["caseCode", "passPoints", "revealPolicy", "blockingIssues"].includes(key))) return false;
  return (value.caseCode === "BR01" || value.caseCode === "BR02") && typeof value.passPoints === "number" && Number.isInteger(value.passPoints) && value.passPoints >= 1 && value.passPoints <= 20
    && (value.revealPolicy === "EXPLICIT" || value.revealPolicy === "AFTER_SUBMISSION") && Array.isArray(value.blockingIssues) && value.blockingIssues.length <= 4
    && value.blockingIssues.every((issue) => record(issue) && Object.keys(issue).length === 2 && Object.keys(issue).every((key) => ["key", "label"].includes(key))
      && projectBlockingKeys.includes(issue.key as typeof projectBlockingKeys[number]) && validMethodText(issue.label, 1000))
    && new Set(value.blockingIssues.map((issue: { key: string }) => issue.key)).size === value.blockingIssues.length;
}
export function isCompleteProjectPolicy(value: unknown): value is ProjectPolicy {
  return isProjectPolicy(value) && value.blockingIssues.length === 4 && value.blockingIssues.every((issue) => validMethodText(issue.label, 1000, 1));
}
