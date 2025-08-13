import { supabase } from './supabase';

interface ChatMessage {
  id: string;
  userId: string;
  message: string;
  createdAt: string;
  user: {
    walletAddress: string;
    username?: string | null;
  };
}

let messageCount = 0;
const MAX_MESSAGES = 100;

export async function initChat() {
  const chatMessagesContainer = document.getElementById('chatMessages');
  if (!chatMessagesContainer) {
    console.error('Chat messages container not found');
    return;
  }

  // Fetch initial chat messages
  await fetchInitialMessages();

  // Listen for new messages in real-time
  supabase
    .channel('public:ChatMessage')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ChatMessage' },
      (payload) => {
        // We need to fetch the user data for the new message
        fetchMessageWithUser(payload.new.id);
      }
    )
    .subscribe();

  addSystemMessage('Welcome to The Colosseum! Chat with other spectators.');
}

async function fetchMessageWithUser(messageId: string) {
    const { data, error } = await supabase
        .from('ChatMessage')
        .select(`
            *,
            user:User (
                walletAddress,
                username
            )
        `)
        .eq('id', messageId)
        .single();

    if (error) {
        console.error('Error fetching new message with user:', error);
        return;
    }

    if (data) {
        // The 'user' property will be an object, not an array
        const message: ChatMessage = {
            id: data.id,
            userId: data.userId,
            message: data.message,
            createdAt: data.createdAt,
            user: data.user as { walletAddress: string; username?: string | null }, // Type assertion
        };
        addMessageToChat(message);
    }
}


export async function sendMessage(userId: string, message: string) {
  if (!message.trim()) return;

  if (message.length > 200) {
    addSystemMessage('Message too long (max 200 characters)');
    return;
  }

  const { error } = await supabase
    .from('ChatMessage')
    .insert([{ userId, message }]);

  if (error) {
    console.error('Error sending message:', error);
    addSystemMessage('Failed to send message.');
  }
}

async function fetchInitialMessages() {
  const { data: messages, error } = await supabase
    .from('ChatMessage')
    .select(`
        *,
        user:User (
            walletAddress,
            username
        )
    `)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching initial messages:', error);
    return;
  }

  if (messages) {
    // Clear existing messages
    const chatMessagesContainer = document.getElementById('chatMessages');
    if(chatMessagesContainer) {
        chatMessagesContainer.innerHTML = '';
    }
    
    // Add the new messages in the correct order
    messages.reverse().forEach(message => {
        const chatMessage: ChatMessage = {
            id: message.id,
            userId: message.userId,
            message: message.message,
            createdAt: message.createdAt,
            user: message.user as { walletAddress: string; username?: string | null },
        };
        addMessageToChat(chatMessage)
    });
  }
}


function addMessageToChat(message: ChatMessage) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message';

  const headerElement = document.createElement('div');
  headerElement.className = 'chat-message-header';

  const userElement = document.createElement('span');
  userElement.className = 'chat-message-user';
  // Use username if available, otherwise format wallet address
  userElement.textContent = formatUserName(message.user.walletAddress, message.user.username);

  const timeElement = document.createElement('span');
  timeElement.className = 'chat-message-time';
  timeElement.textContent = formatTimestamp(message.createdAt);

  headerElement.appendChild(userElement);
  headerElement.appendChild(timeElement);

  const contentElement = document.createElement('div');
  contentElement.className = 'chat-message-content';
  contentElement.textContent = message.message;

  messageElement.appendChild(headerElement);
  messageElement.appendChild(contentElement);

  chatMessages.appendChild(messageElement);
  messageCount++;

  if (messageCount > MAX_MESSAGES) {
    const firstMessage = chatMessages.firstElementChild;
    if (firstMessage) {
      chatMessages.removeChild(firstMessage);
      messageCount--;
    }
  }

  scrollToBottom();
}

function updateOnlineCount(count: number) {
  const onlineCountEl = document.getElementById('onlineCount');
  if (onlineCountEl) {
    onlineCountEl.textContent = `${count} online`;
  }
}

const presenceChannelName = 'online-users';
let presenceChannel = supabase.channel(presenceChannelName);

export function trackPresence(walletAddress: string) {
    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            const count = Object.keys(state).length;
            updateOnlineCount(count);
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
            console.log('New users have joined', newPresences);
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            console.log('Users have left', leftPresences);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({
                    online_at: new Date().toISOString(),
                    wallet_address: walletAddress,
                });
            }
        });
}

export function untrackPresence() {
    supabase.removeChannel(presenceChannel);
}

export function addSystemMessage(message: string) {
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
  
  if (messageCount > MAX_MESSAGES) {
    const firstMessage = chatMessages.firstElementChild;
    if (firstMessage) {
      chatMessages.removeChild(firstMessage);
      messageCount--;
    }
  }
  
  scrollToBottom();
}

function formatUserName(walletAddress: string, username?: string | null): string {
  if (username) {
    return username;
  }
  if (!walletAddress) return 'Anonymous';
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
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

let lastMessageTime = 0;
const MESSAGE_COOLDOWN = 2000; // 2 seconds

export function sendMessageWithRateLimit(userId: string, message: string) {
  const now = Date.now();
  if (now - lastMessageTime < MESSAGE_COOLDOWN) {
    const remainingTime = Math.ceil((MESSAGE_COOLDOWN - (now - lastMessageTime)) / 1000);
    addSystemMessage(`Please wait ${remainingTime} seconds before sending another message`);
    return;
  }
  lastMessageTime = now;
  sendMessage(userId, message);
}