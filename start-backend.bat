@echo off
cd /d F:\App\crm\backend
uvicorn main:app --host 127.0.0.1 --port 8000
