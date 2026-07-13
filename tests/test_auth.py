from httpx import AsyncClient, Response

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/me"

EMAIL = "player@example.com"
PASSWORD = "hunter22"


async def _register(client: AsyncClient, email: str = EMAIL, password: str = PASSWORD) -> Response:
    response = await client.post(
        REGISTER_URL,
        json={"email": email, "password": password, "display_name": "Игрок"},
    )
    assert response.status_code == 201, response.text
    return response


async def _login(client: AsyncClient, email: str = EMAIL, password: str = PASSWORD) -> Response:
    response = await client.post(LOGIN_URL, json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response


async def test_register_creates_user_with_email_unverified(client: AsyncClient) -> None:
    response = await _register(client)

    body = response.json()
    assert body["email"] == EMAIL
    assert body["email_verified"] is False
    assert body["is_admin"] is False
    assert "password" not in body
    assert "password_hash" not in body


async def test_register_duplicate_email_is_rejected(client: AsyncClient) -> None:
    await _register(client)

    response = await client.post(
        REGISTER_URL,
        json={"email": EMAIL, "password": "anotherpass", "display_name": "Другой"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_already_registered"


async def test_login_with_wrong_password_is_rejected(client: AsyncClient) -> None:
    await _register(client)

    response = await client.post(LOGIN_URL, json={"email": EMAIL, "password": "wrongpass"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


async def test_login_with_unknown_email_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        LOGIN_URL, json={"email": "nobody@example.com", "password": PASSWORD}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


async def test_login_success_returns_access_token_and_sets_cookie(client: AsyncClient) -> None:
    await _register(client)

    response = await _login(client)

    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert "refresh_token" in response.cookies


async def test_refresh_rotates_tokens(client: AsyncClient) -> None:
    await _register(client)
    login_response = await _login(client)
    original_access_token = login_response.json()["access_token"]
    original_refresh_cookie = login_response.cookies["refresh_token"]

    refresh_response = await client.post(REFRESH_URL)

    assert refresh_response.status_code == 200
    new_access_token = refresh_response.json()["access_token"]
    assert new_access_token != original_access_token
    assert refresh_response.cookies["refresh_token"] != original_refresh_cookie


async def test_refresh_without_cookie_is_rejected(client: AsyncClient) -> None:
    response = await client.post(REFRESH_URL)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_refresh_token"


async def test_me_with_valid_token_returns_current_user(client: AsyncClient) -> None:
    await _register(client)
    login_response = await _login(client)
    access_token = login_response.json()["access_token"]

    response = await client.get(ME_URL, headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 200
    assert response.json()["email"] == EMAIL


async def test_me_without_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get(ME_URL)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


async def test_me_with_garbage_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get(ME_URL, headers={"Authorization": "Bearer not-a-real-token"})

    assert response.status_code == 401


async def test_logout_clears_refresh_cookie(client: AsyncClient) -> None:
    await _register(client)
    await _login(client)

    logout_response = await client.post(LOGOUT_URL)
    assert logout_response.status_code == 204

    refresh_response = await client.post(REFRESH_URL)
    assert refresh_response.status_code == 401
