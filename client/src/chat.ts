import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

interface ChatMessage {
  user: { 
    id: string;
    address?: string;
  };
  message: string;
  timestamp?: string;
  messageType?: 'user' | 'system';
}

let messageCount = 0;
const MAX_MESSAGES = 100;

export function initChat() {
  const chatMessages = document.getElementById('chatMessages');
  
  if (!chatMessages) {
    console.error('Chat messages container not found');
    return;
  }

  // Listen for new chat messages
  socket.on('newChatMessage', (message: ChatMessage) => {
    addMessageToChat(message);
  });

  // Listen for connection status
  socket.on('connect', () => {
    console.log('Connected to chat server');
    addSystemMessage('Connected to chat');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from chat server');
    addSystemMessage('Disconnected from chat');
  });

  // Add welcome message
  addSystemMessage('Welcome to The Colosseum! Chat with other spectators.');
}

export function sendMessage(userId: string, message: string) {
  if (!message.trim()) return;
  
  // Basic message validation
  if (message.length > 200) {
    addSystemMessage('Message too long (max 200 characters)');
    return;
  }

  // Emit message to server
  socket.emit('chatMessage', { userId, message: message.trim() });
}

function addMessageToChat(message: ChatMessage) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  // Create message element
  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message';
  
  // Create message header
  const headerElement = document.createElement('div');
  headerElement.className = 'chat-message-header';
  
  // Create user element
  const userElement = document.createElement('span');
  userElement.className = 'chat-message-user';
  userElement.textContent = formatUserName(message.user);
  
  // Create timestamp element
  const timeElement = document.createElement('span');
  timeElement.className = 'chat-message-time';
  timeElement.textContent = formatTimestamp(message.timestamp);
  
  headerElement.appendChild(userElement);
  headerElement.appendChild(timeElement);
  
  // Create message content
  const contentElement = document.createElement('div');
  contentElement.className = 'chat-message-content';
  contentElement.textContent = message.message;
  
  // Assemble message
  messageElement.appendChild(headerElement);
  messageElement.appendChild(contentElement);
  
  // Add to chat
  chatMessages.appendChild(messageElement);
  messageCount++;
  
  // Remove old messages if we have too many
  if (messageCount > MAX_MESSAGES) {
    const firstMessage = chatMessages.firstElementChild;
    if (firstMessage) {
      chatMessages.removeChild(firstMessage);
      messageCount--;
    }
  }
  
  // Scroll to bottom
  scrollToBottom();
}

function addSystemMessage(message: string) {
  const systemMessage: ChatMessage = {
    user: { id: 'system' },
    message,
    messageType: 'system',
    timestamp: new Date().toISOString()
  };
  
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message system-message';
  messageElement.style.borderLeftColor = 'var(--info)';
  messageElement.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
  
  const contentElement = document.createElement('div');
  contentElement.className = 'chat-message-content';
  contentElement.textContent = message;
  contentElement.style.color = 'var(--info)';
  contentElement.style.fontStyle = 'italic';
  
  messageElement.appendChild(contentElement);
  chatMessages.appendChild(messageElement);
  messageCount++;
  
  // Remove old messages if we have too many
  if (messageCount > MAX_MESSAGES) {
    const firstMessage = chatMessages.firstElementChild;
    if (firstMessage) {
      chatMessages.removeChild(firstMessage);
      messageCount--;
    }
  }
  
  scrollToBottom();
}

function formatUserName(user: { id: string; address?: string }): string {
  if (user.id === 'system') return 'System';
  
  // If we have an address, truncate it for display
  if (user.address) {
    return `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
  }
  
  // Otherwise, truncate the ID
  return user.id.length > 10 ? `${user.id.slice(0, 10)}...` : user.id;
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Rate limiting for sending messages
let lastMessageTime = 0;
const MESSAGE_COOLDOWN = 2000; // 2 seconds

export function canSendMessage(): boolean {
  const now = Date.now();
  if (now - lastMessageTime < MESSAGE_COOLDOWN) {
    const remainingTime = Math.ceil((MESSAGE_COOLDOWN - (now - lastMessageTime)) / 1000);
    addSystemMessage(`Please wait ${remainingTime} seconds before sending another message`);
    return false;
  }
  lastMessageTime = now;
  return true;
}

// Enhanced sendMessage with rate limiting
export function sendMessageWithRateLimit(userId: string, message: string) {
  if (!canSendMessage()) return;
  sendMessage(userId, message);
}

// Export for debugging
(window as any).chatDebug = {
  addSystemMessage,
  messageCount,
  scrollToBottom
};