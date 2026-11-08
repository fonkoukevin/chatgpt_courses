export type ProgrammeActivity<T> = { node: T; module: T | null };

export function programmeActivities<T extends { kind: string; versionId: string; children: T[] }>(nodes: T[]): ProgrammeActivity<T>[] {
  const activities: ProgrammeActivity<T>[] = [], seen = new Set<string>();
  function visit(children: T[], module: T | null) {
    for (const node of children) {
      if (node.kind === "ACTIVITY") {
        if (!seen.has(node.versionId)) { seen.add(node.versionId); activities.push({ node, module }); }
      } else visit(node.children, node.kind === "MODULE" ? node : module);
    }
  }
  visit(nodes, null);
  return activities;
}
