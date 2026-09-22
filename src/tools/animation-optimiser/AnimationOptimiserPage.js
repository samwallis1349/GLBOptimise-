import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function AnimationOptimiserPage() {
  return ToolPageShell(getToolById('animation-optimiser'));
}
