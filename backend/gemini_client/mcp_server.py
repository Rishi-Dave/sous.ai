"""Standalone MCP server exposing the Edamam nutrition tool.

Run with:
    uv run python -m gemini_client.mcp_server

Compatible with Claude Desktop, Claude Code, and any MCP client.
For Groq tool-calling integration, import from nutrition_tool directly.
"""

from mcp.server.fastmcp import FastMCP

from .nutrition_tool import fetch_nutrition

mcp = FastMCP("sous-chef-nutrition")


@mcp.tool()
async def get_nutrition(ingredient: str) -> dict:
    """Get calories, protein, fat, and carbs for an ingredient phrase.

    Args:
        ingredient: Ingredient with quantity/unit, e.g. '2 cups pasta'.
    """
    return await fetch_nutrition(ingredient)


if __name__ == "__main__":
    mcp.run()
