import asyncio
import json
from dotenv import load_dotenv

load_dotenv('e:/App/crm/backend/.env')
from utils.pdf_parser import parse_invoice_pdf

async def main():
    res = await parse_invoice_pdf(open('e:/App/crm/esempi/0100702txt.pdf', 'rb').read())
    with open('e:/App/crm/backend/tmp_vision_out.json', 'w', encoding='utf-8') as f:
        json.dump(res, f, indent=2)
    print('DONE')

asyncio.run(main())
