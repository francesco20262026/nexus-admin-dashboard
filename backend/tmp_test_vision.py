import asyncio
import os
import json
from dotenv import load_dotenv

load_dotenv("e:/App/crm/backend/.env")

from utils.pdf_parser import parse_invoice_pdf

async def main():
    try:
        with open("e:/App/crm/esempi/0100702txt.pdf", "rb") as f:
            pdf_bytes = f.read()
            
        print("Parsing with GPT-4o Vision...")
        res = await parse_invoice_pdf(pdf_bytes)
        
        print("\n--- RESULTS ---")
        print(json.dumps(res, indent=2))
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
