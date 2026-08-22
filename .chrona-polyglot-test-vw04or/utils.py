
def format_currency(val: float) -> str:
    if val < 0:
        raise ValueError("Amount cannot be negative")
    return f"${val:.2f}"
