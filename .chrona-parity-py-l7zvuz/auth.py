class Session:
    token: str
    is_admin: bool = False

def authenticate_user(token: str, retries: int = 3) -> Session:
    if not token or len(token) < 8:
        raise ValueError("Invalid token length")
    return Session()
