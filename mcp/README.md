# AssetBench MCP server

Lets Claude, Cursor, VS Code and other AI agents use [AssetBench](https://www.assetbench.co.uk) on your files: check 3D models against phone, Quest and web budgets, make them game-ready for your engine, and build app icons and store screenshots. Results are saved next to your files.

## Set up

You need an API key: your All Access licence key, or a free key (100 operations a month, checks are free) from [assetbench.co.uk/docs](https://www.assetbench.co.uk/docs/).

**Claude Code**

```sh
claude mcp add assetbench -e ASSETBENCH_API_KEY=your-key -- npx -y assetbench-mcp
```

**Claude Desktop, Cursor, VS Code** (in the app's MCP settings file)

```json
{
  "mcpServers": {
    "assetbench": {
      "command": "npx",
      "args": ["-y", "assetbench-mcp"],
      "env": { "ASSETBENCH_API_KEY": "your-key" }
    }
  }
}
```

Needs Node.js 18 or newer.

## Tools

| Tool | What it does | Cost |
|---|---|---|
| `check_model` | Score a GLB for every device class and list what to fix first | Free |
| `make_game_ready` | Merge, reduce, fit textures, fix the pivot, plus LODs, collision and KTX2, with import notes for Unity, Unreal, Godot, Roblox or the web | 1 op |
| `make_app_assets` | One image becomes every iOS, Android and watchOS app icon | 1 op |
| `make_store_screenshots` | Screenshots resized for every App Store and Google Play size | 1 op |
| `optimize_model` | Reduce, downscale textures and compress towards a target | 1 op |
| `reduce_model` | Polygon reduction only | Free |
| `generate_lods` | A chain of lower-detail GLBs | 1 op |
| `convert_model` | FBX, OBJ or glTF to GLB; GLB to glTF or OBJ | 1 op |
| `compress_textures` | KTX2 for an image or every texture in a GLB | 1 op |
| `resize_texture` | Resize to a power of two as PNG, JPEG or WebP | 1 op |
| `explain_target` | What "Roblox on a low-end phone" means in triangles and texture sizes | Free |
| `account_status` | Your plan and operations left this month | Free |

Targets can be plain English: *"make robot.glb ready for Unity on mid-range phones"*, *"under 5k tris, 512px textures"*.

Files go to the AssetBench API to be processed and are never stored. ZIP results are unzipped into a folder beside the ZIP. Nothing is overwritten: a clash gets `-1`, `-2` added to the name.

## Options

| Variable | |
|---|---|
| `ASSETBENCH_API_KEY` | Your key (required) |
| `ASSETBENCH_API_URL` | Another API host, e.g. a local `wrangler dev` (default `https://www.assetbench.co.uk`) |
