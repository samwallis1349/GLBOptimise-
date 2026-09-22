import { getToolById } from '../../shared/config/tools.js';
import { ToolPageShell } from '../../shared/components/ToolPageShell.js';

export function ThumbnailMakerPage() {
  return ToolPageShell(getToolById('thumbnail-maker'));
}
