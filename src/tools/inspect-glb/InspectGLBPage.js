import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function InspectGLBPage() {
  return ToolPageShell(getToolById('inspect-glb'));
}
