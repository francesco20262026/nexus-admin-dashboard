import logging
import httpx
from pydantic import BaseModel
from typing import Optional, Dict, Any
from config import settings

logger = logging.getLogger(__name__)

class ZohoSignService:
    def __init__(self):
        # OAuth endpoint and Sign endpoint based on DC
        self.dc = settings.zoho_dc.lower()
        self.oauth_url = f"https://accounts.{self.dc}/oauth/v2/token"
        self.sign_api_url = f"https://sign.{self.dc}/api/v1"
        self.client_id = settings.zoho_client_id
        self.client_secret = settings.zoho_client_secret
        self.refresh_token = settings.zoho_refresh_token
        self._access_token: Optional[str] = None

    async def _get_access_token(self) -> str:
        """Fetch a fresh access token using the refresh token."""
        if not self.client_id or not self.client_secret or not self.refresh_token:
            raise ValueError("Zoho Sign credentials are not fully configured in the environment.")

        params = {
            "refresh_token": self.refresh_token,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "refresh_token"
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(self.oauth_url, params=params)
            
            if resp.status_code != 200:
                logger.error(f"Zoho OAuth failed: {resp.text}")
                raise RuntimeError("Failed to refresh Zoho Access Token")
            
            data = resp.json()
            if "access_token" not in data:
                logger.error(f"Zoho OAuth unexpected response: {data}")
                raise RuntimeError("Invalid response from Zoho OAuth")

            self._access_token = data["access_token"]
            return self._access_token

    async def _get_headers(self) -> Dict[str, str]:
        token = await self._get_access_token()
        return {
            "Authorization": f"Zoho-oauthtoken {token}"
        }

    async def send_document_for_signature(
        self, 
        pdf_bytes: bytes, 
        file_name: str, 
        client_name: str, 
        client_email: str,
        provider_name: Optional[str] = None,
        provider_email: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload the PDF and create a signature request for one or two recipients.
        """
        headers = await self._get_headers()
        url = f"{self.sign_api_url}/requests"

        import json

        actions = [
            {
                "recipient_name": client_name,
                "recipient_email": client_email,
                "action_type": "SIGN",
                "private_notes": "Ti invitiamo a firmare il presente contratto.",
                "signing_order": 1,
                "verify_recipient": False
            }
        ]

        if provider_name and provider_email:
            actions.append({
                "recipient_name": provider_name,
                "recipient_email": provider_email,
                "action_type": "SIGN",
                "private_notes": "Firma del fornitore richiesta per il contratto.",
                "signing_order": 1, # Both can sign at the same time
                "verify_recipient": False
            })

        # Data map matching Zoho Sign Requirements
        data_payload = {
            "requests": {
                "request_name": file_name.replace(".pdf", ""),
                "is_sequential": False, # Important: Allow parallel signing
                "actions": actions
            }
        }

        files = {
            "file": (file_name, pdf_bytes, "application/pdf")
        }

        data = {
            "data": json.dumps(data_payload)
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, data=data, files=files, timeout=30.0)
            
            if resp.status_code != 200:
                logger.error(f"Zoho Sign create request failed: {resp.status_code} - {resp.text}")
                raise RuntimeError(f"Failed to create Zoho Sign request: {resp.text}")
            
            json_resp = resp.json()
            if json_resp.get("status") != "success":
                logger.error(f"Zoho Sign API Error: {json_resp}")
                raise RuntimeError(f"Zoho Sign error: {json_resp.get('message')}")

            req_id = json_resp.get("requests", {}).get("request_id")
            if req_id:
                # Zoho requires an explicit '/submit' call to actually dispatch the email to clients
                submit_url = f"{self.sign_api_url}/requests/{req_id}/submit"
                submit_resp = await client.post(submit_url, headers=headers)
                if submit_resp.status_code != 200:
                    logger.error(f"Zoho Sign submit request failed: {submit_resp.status_code} - {submit_resp.text}")
                    raise RuntimeError(f"Failed to submit Zoho Sign request: {submit_resp.text}")

            return json_resp

    async def download_signed_document(self, request_id: str) -> bytes:
        """
        Download the completion certificate and signed PDF from Zoho Sign.
        Returns the raw PDF bytes.
        """
        headers = await self._get_headers()
        url = f"{self.sign_api_url}/requests/{request_id}/pdf"

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=60.0)
            
            if resp.status_code != 200:
                logger.error(f"Zoho Sign document download failed: {resp.status_code} - {resp.text}")
                raise RuntimeError(f"Failed to download Zoho Sign document: {resp.status_code}")
                
            return resp.content

zoho_sign_service = ZohoSignService()
