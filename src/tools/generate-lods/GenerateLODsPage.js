import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function GenerateLODsPage() {
  return ToolPageShell(getToolById('generate-lods'));
}
