import './style.css'
import { handleConnectWallet, checkWalletConnection } from './auth';
import { initChat, sendMessageWithRateLimit } from './chat';
import { initializePlayer } from './video';
import { initializeBetting } from './betting';
import { type User } from "@supabase/supabase-js";

console.log('Colosseum frontend script is running.');

// Initialize the application
async function initializeApp() {
  // Check for existing wallet connection first
  await checkWalletConnection();
  
  // Set up connect wallet button
  const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
  if (connectWalletBtn) {
    connectWalletBtn.addEventListener('click', async () => {
      const user = await handleConnectWallet();
      if (user) {
        await initializeUserFeatures(user);
      }
    });
  }

  // Initialize chat for all users immediately
  initChat();
  
  // If user is already connected, initialize features
  const userInfo = document.querySelector<HTMLDivElement>('#userInfo');
  if (userInfo && userInfo.style.display !== 'none') {
    // User is already connected, get user data from auth module
    const { authData } = await import('./auth');
    if (authData) {
      await initializeUserFeatures(authData);
    }
  }
  
  // Initialize chat input functionality
  setupChatInput();
  
  
  // Update viewer count (placeholder)
  updateViewerCount();

  // Initialize video player
  initializePlayer();
}

async function initializeUserFeatures(user: User) {
  try {
    // Chat is now initialized globally, so we don't need to do it here.
    
    // Initialize betting with current battle
    const battleResponse = await fetch('/api/betting/battle/current');
    if (battleResponse.ok) {
      const battle = await battleResponse.json();
      if (battle) {
        initializeBetting(user.id, battle.id);
      }
    } else {
      console.log('No current battle found');
      // Set placeholder battle data
      updateBattleInfo('Gladiator Arena', 'Maximus', 'Commodus');
    }
  } catch (error) {
    console.error('Error initializing user features:', error);
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

function updateBattleInfo(title: string, fighterA: string, fighterB: string) {
  const battleTitle = document.querySelector<HTMLHeadingElement>('#battleTitle');
  const constituentAName = document.querySelector<HTMLSpanElement>('#constituentAName');
  const constituentBName = document.querySelector<HTMLSpanElement>('#constituentBName');
  
  if (battleTitle) battleTitle.textContent = title;
  if (constituentAName) constituentAName.textContent = fighterA;
  if (constituentBName) constituentBName.textContent = fighterB;
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
  updateBattleInfo
};
