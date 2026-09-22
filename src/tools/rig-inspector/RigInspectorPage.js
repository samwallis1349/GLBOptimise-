import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function RigInspectorPage() {
  return ToolPageShell(getToolById('rig-inspector'));
}
