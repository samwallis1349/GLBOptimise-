import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function GLBBuilderPage() {
  return ToolPageShell(getToolById('glb-builder'));
}
