"""
Fas 1-test: koppla upp mot en lokalt körande eufy-security-ws (se docker-compose.yml
i samma mapp) och skriv ut varje händelse som kommer in, rått.

Krav: pip install websockets

Kör:
    1. docker compose up -d   (i denna mapp, med en ifylld .env)
    2. python watch_events.py
    3. Gå ut och gör testet (rör dig framför kameran) - titta i terminalen.
"""

import asyncio
import json
import sys

import websockets

WS_URL = "ws://localhost:3000"


async def main():
    async with websockets.connect(WS_URL) as ws:
        version_msg = json.loads(await ws.recv())
        print("Ansluten. Serverversion:", version_msg)

        max_schema = version_msg.get("maxSchemaVersion", 0)
        await ws.send(json.dumps({
            "command": "set_api_schema",
            "messageId": "1",
            "schemaVersion": max_schema,
        }))
        print("Schema-svar:", json.loads(await ws.recv()))

        await ws.send(json.dumps({
            "command": "start_listening",
            "messageId": "2",
        }))
        print("start_listening-svar:", json.loads(await ws.recv()))

        print("\nLyssnar på händelser... (Ctrl+C för att avsluta)\n")
        async for raw in ws:
            msg = json.loads(raw)
            print(json.dumps(msg, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
