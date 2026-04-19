import json
import pytest
import httpx
from unittest.mock import AsyncMock, patch

from gemini_client.nutrition_tool import fetch_nutrition, dispatch_tool_call

MOCK_EDAMAM = {
    "ingredients": [{
        "parsed": [{
            "nutrients": {
                "ENERC_KCAL": {"quantity": 320.0},
                "PROCNT":     {"quantity": 11.2},
                "FAT":        {"quantity": 1.4},
                "CHOCDF":     {"quantity": 64.0},
            }
        }]
    }]
}


def _mock_response(data: dict, status: int = 200):
    resp = AsyncMock(spec=httpx.Response)
    resp.status_code = status
    resp.json.return_value = data
    resp.raise_for_status = AsyncMock(side_effect=None if status == 200 else httpx.HTTPStatusError(
        "error", request=AsyncMock(), response=resp
    ))
    return resp


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("EDAMAM_APP_ID", "test_id")
    monkeypatch.setenv("EDAMAM_APP_KEY", "test_key")


@pytest.fixture
def mock_get():
    with patch("gemini_client.nutrition_tool.httpx.AsyncClient") as mock_cls:
        client_instance = AsyncMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=client_instance)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        yield client_instance


async def test_fetch_nutrition_happy_path(mock_get):
    mock_get.get = AsyncMock(return_value=_mock_response(MOCK_EDAMAM))
    result = await fetch_nutrition("2 cups pasta")
    assert result["calories"] == 320
    assert result["protein_g"] == 11.2
    assert result["fat_g"] == 1.4
    assert result["carbs_g"] == 64.0


async def test_fetch_nutrition_ingredient_echoed(mock_get):
    mock_get.get = AsyncMock(return_value=_mock_response(MOCK_EDAMAM))
    result = await fetch_nutrition("3 cloves garlic")
    assert result["ingredient"] == "3 cloves garlic"


async def test_fetch_nutrition_missing_nutrients(mock_get):
    mock_get.get = AsyncMock(return_value=_mock_response({"ingredients": [{"parsed": [{"nutrients": {}}]}]}))
    result = await fetch_nutrition("salt")
    assert result["calories"] == 0
    assert result["protein_g"] == 0.0
    assert result["fat_g"] == 0.0
    assert result["carbs_g"] == 0.0


async def test_dispatch_tool_call_routes_correctly(mock_get):
    mock_get.get = AsyncMock(return_value=_mock_response(MOCK_EDAMAM))
    raw = await dispatch_tool_call("get_nutrition", json.dumps({"ingredient": "1 cup rice"}))
    data = json.loads(raw)
    assert data["calories"] == 320


async def test_dispatch_tool_call_unknown_tool():
    with pytest.raises(ValueError, match="Unknown tool"):
        await dispatch_tool_call("nonexistent_tool", "{}")
