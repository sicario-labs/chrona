from .auth import authenticate_user, Session

def handle_payment(token: str, amount: float) -> dict:
    session = authenticate_user(token)
    if not session.is_admin:
        raise PermissionError("Admin role required")
    return {"success": True}
