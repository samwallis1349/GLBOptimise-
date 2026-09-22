import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function AssetReportPage() {
  return ToolPageShell(getToolById('asset-report'));
}
