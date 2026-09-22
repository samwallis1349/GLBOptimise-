import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function AssetComparePage() {
  return ToolPageShell(getToolById('asset-compare'));
}
