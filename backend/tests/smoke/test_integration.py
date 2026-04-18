from uuid import UUID


def test_sessions_utterance_finalize_flow(client, silence_wav):
    # /sessions
    r = client.post("/sessions", json={"user_id": "test-user"})
    assert r.status_code == 200, r.text
    session = r.json()
    UUID(session["session_id"])
    UUID(session["recipe_id"])
    session_id = session["session_id"]

    # /utterance (multipart: audio file + session_id form field)
    with silence_wav.open("rb") as audio:
        r = client.post(
            "/utterance",
            data={"session_id": session_id},
            files={"audio": ("silence.wav", audio, "audio/wav")},
        )
    assert r.status_code == 200, r.text
    utt = r.json()
    assert utt["intent"] == "add_ingredient"
    assert utt["ack_audio_url"]
    assert len(utt["current_ingredients"]) >= 1
    assert utt["current_ingredients"][0]["name"] == "olive oil"

    # /finalize
    r = client.post(
        "/finalize",
        json={"session_id": session_id, "recipe_name": "Pasta Aglio e Olio"},
    )
    assert r.status_code == 200, r.text
    fin = r.json()
    UUID(fin["recipe_id"])
    assert set(fin["macros"].keys()) >= {"calories", "protein_g", "fat_g", "carbs_g"}
    assert isinstance(fin["ingredients"], list)


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
