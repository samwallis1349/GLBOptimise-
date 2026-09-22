import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function ConvertFilesPage() {
  return ToolPageShell(getToolById('convert-files'));
}
