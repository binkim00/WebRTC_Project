import asyncio
from livekit.api import LiveKitAPI, CreateAgentDispatchRequest

async def dispatch():
    async with LiveKitAPI('ws://localhost:7880', 'devkey', 'melly-local-dev-secret-1234567890abcdef') as lk:
        res = await lk.agent_dispatch.create_dispatch(
            CreateAgentDispatchRequest(
                agent_name='subtitle-agent',
                room='test-room',
                metadata='{"host_lang": "ko"}'
            )
        )
        print('dispatch 성공', res)

asyncio.run(dispatch())