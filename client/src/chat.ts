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

// Track which messages are already rendered to prevent duplicates
const displayedMessageIds = new Set<string>();
// Track latest message timestamp to fetch only new messages in fallback polling
let latestMessageTimestamp: string | null = null;
let pollingTimer: number | null = null;

export async function initChat() {
  const chatMessagesContainer = document.getElementById('chatMessages');
  if (!chatMessagesContainer) {
    console.error('Chat messages container not found');
    return;
  }

  // Fetch initial chat messages
  await fetchInitialMessages();

  // Listen for new messages in real-time - use a unique channel name
  const chatChannel = supabase
    .channel('chat-messages-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ChatMessage' },
      (payload) => {
        console.log('Real-time message received:', payload);
        // Fetch with user join and render
        fetchMessageWithUser(payload.new.id);
      }
    )
    .subscribe((status) => {
      console.log('Chat subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('Chat real-time subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Chat subscription error');
      }
    });

  // Store the chat channel reference
  (window as any).chatChannel = chatChannel;

  // Start lightweight polling fallback to cover missed realtime events
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }
  pollingTimer = window.setInterval(async () => {
    try {
      await fetchNewMessages();
    } catch (e) {
      console.warn('Polling fetch failed:', e);
    }
  }, 4000);

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
            user: data.user as { walletAddress: string; username?: string | null },
        };
        addMessageToChat(message);
    }
}

// Generate a UUID for chat messages
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function sendMessage(userId: string, message: string) {
  if (!message.trim()) {
    return;
  }

  const newId = generateUUID();

  const { error } = await supabase
    .from('ChatMessage')
    .insert([{ 
      id: newId, // Generate UUID on client side
      userId, 
      message 
    }]);

  if (error) {
    console.error('Error sending message:', error);
    addSystemMessage('Failed to send message.');
    return;
  }

  // Optimistic fetch of the just-sent message in case realtime is delayed
  await fetchMessageWithUser(newId);
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

    // Track latest timestamp for polling
    if (messages.length > 0) {
      latestMessageTimestamp = messages[messages.length - 1].createdAt;
    }
  }
}

async function fetchNewMessages() {
  if (!latestMessageTimestamp) return;
  const { data: messages, error } = await supabase
    .from('ChatMessage')
    .select(`
      *,
      user:User (
        walletAddress,
        username
      )
    `)
    .gt('createdAt', latestMessageTimestamp)
    .order('createdAt', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Error fetching new messages:', error);
    return;
  }

  if (messages && messages.length > 0) {
    messages.forEach(message => {
      const chatMessage: ChatMessage = {
        id: message.id,
        userId: message.userId,
        message: message.message,
        createdAt: message.createdAt,
        user: message.user as { walletAddress: string; username?: string | null },
      };
      addMessageToChat(chatMessage);
    });
    latestMessageTimestamp = messages[messages.length - 1].createdAt;
  }
}

function addMessageToChat(message: ChatMessage) {
  // Deduplicate
  if (displayedMessageIds.has(message.id)) {
    return;
  }
  displayedMessageIds.add(message.id);

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

  // Track latest timestamp
  latestMessageTimestamp = message.createdAt || latestMessageTimestamp;

  scrollToBottom();
}

function updateOnlineCount(count: number) {
  console.log('Updating online count to:', count);
  const onlineCountEl = document.getElementById('onlineCount');
  if (onlineCountEl) {
    onlineCountEl.textContent = `${count} online`;
    console.log('Online count updated in UI:', count);
  } else {
    console.error('Online count element not found');
  }
}

// const presenceChannelName = 'online-users';
// let presenceChannel = supabase.channel(presenceChannelName);

export function trackPresence(walletAddress: string) {
    console.log('Starting presence tracking for:', walletAddress);
    
    // Use a simpler presence approach to avoid conflicts
    const userPresenceChannel = supabase.channel(`user-presence-${walletAddress}`)
        .on('presence', { event: 'sync' }, () => {
            try {
                const state = userPresenceChannel.presenceState();
                const count = Object.keys(state).length;
                console.log('Presence sync - online users:', count, state);
                updateOnlineCount(count);
            } catch (error) {
                console.error('Error in presence sync:', error);
            }
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
            try {
                console.log('New users have joined:', newPresences);
                const state = userPresenceChannel.presenceState();
                const count = Object.keys(state).length;
                updateOnlineCount(count);
            } catch (error) {
                console.error('Error in presence join:', error);
            }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            try {
                console.log('Users have left:', leftPresences);
                const state = userPresenceChannel.presenceState();
                const count = Object.keys(state).length;
                updateOnlineCount(count);
            } catch (error) {
                console.error('Error in presence leave:', error);
            }
        })
        .subscribe(async (status) => {
            console.log('Presence subscription status:', status);
            if (status === 'SUBSCRIBED') {
                console.log('Presence tracking active for:', walletAddress);
                try {
                    await userPresenceChannel.track({
                        online_at: new Date().toISOString(),
                        wallet_address: walletAddress,
                        user_id: walletAddress,
                    });
                } catch (error) {
                    console.error('Error tracking presence:', error);
                }
            } else if (status === 'CHANNEL_ERROR') {
                console.error('Presence tracking error for:', walletAddress);
            }
        });
    
    // Store the channel reference for cleanup
    (window as any).userPresenceChannel = userPresenceChannel;
}

export function untrackPresence() {
    console.log('Stopping presence tracking');
    const userPresenceChannel = (window as any).userPresenceChannel;
    if (userPresenceChannel) {
        try {
            userPresenceChannel.unsubscribe();
            (window as any).userPresenceChannel = null;
        } catch (error) {
            console.error('Error unsubscribing from presence:', error);
        }
    }
    // Reset online count to 0
    updateOnlineCount(0);

    // Stop polling
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
}

// Add a function to cleanup all channels when needed
export function cleanupAllChannels() {
    console.log('Cleaning up all channels');
    
    // Cleanup presence channel
    const userPresenceChannel = (window as any).userPresenceChannel;
    if (userPresenceChannel) {
        try {
            userPresenceChannel.unsubscribe();
            (window as any).userPresenceChannel = null;
        } catch (error) {
            console.error('Error cleaning up presence channel:', error);
        }
    }
    
    // Cleanup chat channel
    const chatChannel = (window as any).chatChannel;
    if (chatChannel) {
        try {
            chatChannel.unsubscribe();
            (window as any).chatChannel = null;
        } catch (error) {
            console.error('Error cleaning up chat channel:', error);
        }
    }

    // Stop polling
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
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