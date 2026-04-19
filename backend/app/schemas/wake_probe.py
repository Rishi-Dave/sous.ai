from pydantic import BaseModel


class WakeProbeResponse(BaseModel):
    wake: bool
