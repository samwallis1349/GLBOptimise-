import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function AnimationInspectorPage() {
  return ToolPageShell(getToolById('animation-inspector'));
}
