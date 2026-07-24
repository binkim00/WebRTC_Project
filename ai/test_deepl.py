import httpx, os
from dotenv import load_dotenv
load_dotenv()

key = os.environ['DEEPL_API_KEY']
print(f'키 끝: ...{key[-10:]}')

resp = httpx.post(
    'https://api.deepl.com/v3/voice/realtime',
    headers={
        'Authorization': f'DeepL-Auth-Key {key}',
        'Content-Type': 'application/json',
    },
    json={
        'source_language': 'ko',
        'target_languages': ['en'],
        'source_media_content_type': 'audio/pcm;encoding=s16le;rate=48000',
    },
    timeout=10.0,
)
print(f'status: {resp.status_code}')
print(f'body: {resp.text}')