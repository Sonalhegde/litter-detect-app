from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ApiProblem(Exception):
    status_code: int
    code: str
    message: str
    headers: dict[str, str] = field(default_factory=dict)


class ModelUnavailable(ApiProblem):
    def __init__(self, message: str = "The selected model is not available for inference.") -> None:
        super().__init__(status_code=503, code="model_unavailable", message=message)
