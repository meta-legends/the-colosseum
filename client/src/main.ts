import './style.css'
import { handleConnectWallet, checkWalletConnection, setAuthData } from './auth';
import { initChat, sendMessageWithRateLimit } from './chat';
import { initializePlayer } from './video';
import { type User } from "@supabase/supabase-js";
import { BettingArenaUI, type Battle } from './ui/BettingArenaUI';

console.log('Colosseum frontend script is running.');

// Initialize the application
async function initializeApp() {
  // Check for existing wallet connection first
  await checkWalletConnection();
  
  // Set up connect wallet button
  const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
  if (connectWalletBtn) {
    connectWalletBtn.addEventListener('click', async () => {
      await handleConnectWallet();
    });
  }

  // Set up test login button
  const testLoginBtn = document.querySelector<HTMLButtonElement>('#testLoginBtn');
  if (testLoginBtn) {
    testLoginBtn.addEventListener('click', async () => {
      try {
        const response = await fetch('/api/users/test-user');
        if (response.ok) {
          const testUser = await response.json();
          setAuthData(testUser); // Use the new function to set auth state
        } else {
          alert('Failed to log in as test user. Make sure you have seeded the database.');
        }
      } catch (error) {
        console.error('Error during test login:', error);
        alert('An error occurred during test login.');
      }
    });
  }

  // Initialize chat for all users immediately
  initChat();
  
  // Initialize chat input functionality
  setupChatInput();
  
  // Update viewer count (placeholder)
  updateViewerCount();

  // Initialize video player
  initializePlayer();

  // Initialize Betting Arena UI
  const bettingPanel = document.querySelector<HTMLElement>('.betting-content');
  if (bettingPanel) {
    const bettingArena = new BettingArenaUI('betting-arena-container');
    try {
      const response = await fetch('/api/battles/current');
      if (response.ok) {
        const battle: Battle = await response.json();
        bettingArena.loadBattle(battle);
        
        const battleTitle = document.querySelector<HTMLHeadingElement>('#battleTitle');
        if (battleTitle) battleTitle.textContent = battle.title;

      } else {
        console.log('No current battle found.');
      }
    } catch (error) {
      console.error('Failed to load initial battle data:', error);
    }
  }
}

function setupChatInput() {
  const sendChatBtn = document.querySelector<HTMLButtonElement>('#sendChatBtn');
  const chatInput = document.querySelector<HTMLInputElement>('#chatInput');

  if (sendChatBtn && chatInput) {
    // Handle send button click
    sendChatBtn.addEventListener('click', () => {
      sendChatMessage();
    });
    
    // Handle Enter key press
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    
    // Handle input changes for button state
    chatInput.addEventListener('input', () => {
      const message = chatInput.value.trim();
      sendChatBtn.disabled = message.length === 0 || message.length > 200;
      
      // Update character count (could add a counter later)
      if (message.length > 180) {
        chatInput.style.borderColor = 'var(--warning)';
      } else if (message.length > 200) {
        chatInput.style.borderColor = 'var(--error)';
      } else {
        chatInput.style.borderColor = '';
      }
    });
  }
}

function sendChatMessage() {
  const chatInput = document.querySelector<HTMLInputElement>('#chatInput');
  const sendChatBtn = document.querySelector<HTMLButtonElement>('#sendChatBtn');
  
  if (chatInput && sendChatBtn) {
    const message = chatInput.value.trim();
    if (message && message.length <= 200) {
      // Get user data
      import('./auth').then(({ authData }) => {
        if (authData) {
          // Use authData.id, which is the Supabase user ID
          sendMessageWithRateLimit(authData.id, message);
          chatInput.value = '';
          sendChatBtn.disabled = true;
          
          // Reset input styling
          chatInput.style.borderColor = '';
        } else {
          console.error('User not authenticated');
        }
      });
    }
  }
}

function updateViewerCount() {
  const viewerNumber = document.querySelector<HTMLSpanElement>('#viewerNumber');
  if (viewerNumber) {
    // This would be updated via WebSocket in a real app
    viewerNumber.textContent = `${Math.floor(Math.random() * 200) + 50}`;
  }
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Page became visible, refresh data
    updateViewerCount();
  }
});

// Handle window resize for responsive adjustments
window.addEventListener('resize', () => {
  // Could trigger layout adjustments here if needed
  console.log('Window resized:', window.innerWidth, 'x', window.innerHeight);
});

// Initialize the app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Export for debugging
(window as any).colosseumApp = {
  initializeApp,
  updateViewerCount,
};
