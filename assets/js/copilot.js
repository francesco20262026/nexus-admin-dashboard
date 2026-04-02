class NovaCopilot {
  constructor() {
    this.isOpen = false;
    this.init();
  }

  init() {
    if (document.getElementById('nova-copilot-container')) return;

    // Inject styles
    if (!document.getElementById('nova-copilot-style')) {
      const style = document.createElement('style');
      style.id = 'nova-copilot-style';
      style.innerHTML = `
        #nova-copilot-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          font-family: 'Inter', sans-serif;
        }
        .copilot-trigger {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          color: white;
          border: none;
        }
        .copilot-trigger:hover {
          transform: scale(1.05);
          box-shadow: 0 15px 30px -5px rgba(99, 102, 241, 0.5);
        }
        .copilot-window {
          position: absolute;
          bottom: 70px;
          right: 0;
          width: 380px;
          height: 520px;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
          transform: translateY(20px) scale(0.95);
          transform-origin: bottom right;
          transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .copilot-window.open {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0) scale(1);
        }
        .copilot-header {
          background: #f8fafc;
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .copilot-title {
          font-weight: 600;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .copilot-close {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 4px; border-radius: 4px;
        }
        .copilot-close:hover { background: #e2e8f0; color: #0f172a; }
        .copilot-messages {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #fafaf9;
        }
        .c-msg {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.4;
          white-space: pre-wrap;
        }
        .c-msg.bot {
          align-self: flex-start;
          background: #fff;
          color: #334155;
          border: 1px solid #e2e8f0;
          border-bottom-left-radius: 4px;
        }
        .c-msg.user {
          align-self: flex-end;
          background: #6366f1;
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .copilot-input-area {
          padding: 16px;
          background: #fff;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 8px;
        }
        .copilot-input {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 20px;
          padding: 10px 16px;
          outline: none;
          font-family: inherit;
          font-size: 14px;
          transition: border-color 0.2s;
        }
        .copilot-input:focus { border-color: #6366f1; }
        .copilot-send {
          background: #6366f1;
          color: #fff;
          border: none;
          width: 40px; height: 40px;
          border-radius: 50%;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .copilot-send:hover { background: #4f46e5; }
        .copilot-send:disabled { background: #94a3b8; cursor: not-allowed; }
      `;
      document.head.appendChild(style);
    }

    // Inject DOM
    const container = document.createElement('div');
    container.id = 'nova-copilot-container';
    container.innerHTML = `
      <div class="copilot-window" id="copilot-window">
        <div class="copilot-header">
          <div class="copilot-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#6366f1"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Nova Copilot
          </div>
          <button class="copilot-close" id="copilot-close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="copilot-messages" id="copilot-messages">
          <div class="c-msg bot">Ciao! Sono il tuo assistente intelligente interno a Nova CRM.\nPuoi chiedermi di eseguire azioni come "Riportami il preventivo PREV-2026 in bozza" o chiedermi informazioni sul database.</div>
        </div>
        <div class="copilot-input-area">
          <input type="text" class="copilot-input" id="copilot-input" placeholder="Scrivi un comando..." autocomplete="off">
          <button class="copilot-send" id="copilot-send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
      <button class="copilot-trigger" id="copilot-trigger" aria-label="Open Copilot">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </button>
    `;
    document.body.appendChild(container);

    // Bind events
    document.getElementById('copilot-trigger').addEventListener('click', () => this.toggle());
    document.getElementById('copilot-close').addEventListener('click', () => this.toggle());
    
    const input = document.getElementById('copilot-input');
    const sendBtn = document.getElementById('copilot-send');
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
    sendBtn.addEventListener('click', () => this.sendMessage());
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const win = document.getElementById('copilot-window');
    const triggerIcon = document.querySelector('#copilot-trigger svg');
    if (this.isOpen) {
      win.classList.add('open');
      document.getElementById('copilot-input').focus();
      triggerIcon.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
    } else {
      win.classList.remove('open');
      triggerIcon.innerHTML = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>';
    }
  }

  appendMessage(text, type = 'bot') {
    const msgDiv = document.createElement('div');
    msgDiv.className = `c-msg ${type}`;
    msgDiv.textContent = text;
    const messages = document.getElementById('copilot-messages');
    messages.appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
  }

  // Gets contextual data to send to LLM (e.g., current URL, ID parameter)
  getContext() {
    const params = new URLSearchParams(window.location.search);
    return {
      url: window.location.pathname,
      quote_id: params.get('id') || null,
      client_id: params.get('client_id') || null
    };
  }

  async sendMessage() {
    const input = document.getElementById('copilot-input');
    const text = input.value.trim();
    if (!text) return;

    // UI Feedback
    input.value = '';
    this.appendMessage(text, 'user');
    const sendBtn = document.getElementById('copilot-send');
    sendBtn.disabled = true;

    try {
      // Create typing indicator
      const typingDiv = document.createElement('div');
      typingDiv.className = 'c-msg bot typing-indicator';
      typingDiv.innerHTML = '<span style="opacity:0.5">Scrivendo...</span>';
      typingDiv.id = 'copilot-typing';
      document.getElementById('copilot-messages').appendChild(typingDiv);

      const token = localStorage.getItem('nexus_token');
      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          message: text,
          context: this.getContext()
        })
      });
      
      document.getElementById('copilot-typing')?.remove();
      
      const data = await response.json();
      if (response.ok) {
        this.appendMessage(data.reply, 'bot');
      } else {
        this.appendMessage('Errore di comunicazione: ' + (data.detail || 'Impossibile contattare backend'), 'bot');
      }
    } catch (e) {
      document.getElementById('copilot-typing')?.remove();
      this.appendMessage('Errore di connessione al serve IA.', 'bot');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }
}

// Auto-initialize when loaded
document.addEventListener('DOMContentLoaded', () => {
  window.novaCopilot = new NovaCopilot();
});
