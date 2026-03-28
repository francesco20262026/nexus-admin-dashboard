import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

from modules.onboarding.router import list_onboarding

class DummyUser:
    active_company_id = 'fbadd8d0-2f92-4a00-abaf-c9710f6dd96b'

def run():
    try:
        res = getattr(asyncio, 'run')(list_onboarding(status_filter=None, client_id=None, page=1, page_size=50, user=DummyUser()))
        print(res['data'])
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(run())
