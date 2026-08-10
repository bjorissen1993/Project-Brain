import type { BalanceFocusNode } from "./balance-model";
import { flattenBalanceNodes } from "./balance-model";

export { getBalanceSnapshot, recalculateProjectBalance } from "./balance-engine";
export {
  flattenBalanceNodes,
  summarizeTargetPool,
  type TargetPoolSummary,
} from "./balance-model";

export function flattenBalanceLines(roots: BalanceFocusNode[]) {
  return flattenBalanceNodes(roots).map((n) => ({
    id: n.id,
    name: n.name,
    parentId: n.parentId,
    targetImportance: n.normalizedTargetWeight,
    actualWeight: n.actualWeight,
    confidence: n.confidence,
    status: n.status,
    difference: n.difference,
    directionLabel: n.directionLabel,
  }));
}
