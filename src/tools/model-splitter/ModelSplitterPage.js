import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function ModelSplitterPage() {
  return ToolPageShell(getToolById('model-splitter'));
}
