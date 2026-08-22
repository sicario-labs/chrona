
from .utils import format_currency

def render_summary(total: float) -> str:
    return format_currency(total)
