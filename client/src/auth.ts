import { ethers } from "ethers";
import { supabase } from './supabase';
import { type User } from "@supabase/supabase-js";
import { trackPresence, untrackPresence } from './chat';
import { eventBus } from './events';
import walletConnector from './utils/walletConnector';

// This will hold the authenticated user data globally
export let authData: User | { id: string; balance: number | string; walletAddress: string; } | null = null;

export const setAuthData = (data: User | { id: string; balance: number | string; walletAddress: string; } | null) => {
  authData = data;
  updateUI(authData);
  eventBus.emit('authChanged', authData); // Emit event
};

const userInfo = document.querySelector<HTMLDivElement>('#userInfo')!;
const userAddressSpan = document.querySelector<HTMLSpanElement>('#userAddress')!;
const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn')!;

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function generateAvatarGradient(address: string): string {
  const hash = address.slice(2, 8);
  const hue1 = parseInt(hash.slice(0, 2), 16) % 360;
  const hue2 = parseInt(hash.slice(2, 4), 16) % 360;
  const hue3 = parseInt(hash.slice(4, 6), 16) % 360;
  return `linear-gradient(45deg, hsl(${hue1}, 70%, 60%), hsl(${hue2}, 70%, 60%), hsl(${hue3}, 70%, 60%))`;
}

function updateUI(user: User | { id: string; balance: number | string; walletAddress: string; } | null) {
  const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
  const testLoginBtn = document.querySelector<HTMLButtonElement>('#testLoginBtn');
  const userInfo = document.querySelector<HTMLDivElement>('#userInfo');
  const userAddress = document.querySelector<HTMLSpanElement>('#userAddress');
  const battlePoints = document.querySelector<HTMLSpanElement>('#battlePoints');
  const networkDisplay = document.querySelector<HTMLSpanElement>('#networkDisplay');

  if (user && connectWalletBtn && userInfo && userAddress && battlePoints && testLoginBtn) {
    connectWalletBtn.style.display = 'none';
    testLoginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    
    const address = 'walletAddress' in user ? user.walletAddress : user.email || '';
    userAddress.textContent = shortenAddress(address);
    
    if ('balance' in user && user.balance !== null && user.balance !== undefined) {
      const balanceValue = parseFloat(user.balance.toString());
      battlePoints.textContent = balanceValue.toFixed(2);
    } else {
      battlePoints.textContent = "0.00";
    }

    // Update network display if wallet is connected
    if (walletConnector.isConnected() && networkDisplay) {
      const chainId = walletConnector.getCurrentChainId();
      networkDisplay.textContent = getNetworkName(chainId || '');
    }

  } else if (connectWalletBtn && userInfo && testLoginBtn) {
    connectWalletBtn.style.display = 'block';
    testLoginBtn.style.display = 'block';
    userInfo.style.display = 'none';
  }
}

function shortenAddress(address: string, chars = 4) {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export async function handleConnectWallet(): Promise<User | null> {
  if (!walletConnector.isMetaMaskInstalled()) {
    showError('Please install MetaMask to continue');
    return null;
  }

  try {
    connectWalletBtn.textContent = 'Connecting...';
    connectWalletBtn.disabled = true;
    connectWalletBtn.classList.add('loading');

    // Use the enhanced wallet connector
    const connection = await walletConnector.connectWallet();
    
    console.log('Wallet connected:', connection.account);
    console.log('Network:', connection.chainId);
    
    // The walletConnector already handles server authentication in its connectWallet method
    // Just update the UI to reflect the successful connection
    const currentAccount = walletConnector.getCurrentAccount();
    if (currentAccount) {
      // Create a user object for UI consistency
      const user = {
        id: currentAccount,
        email: currentAccount,
        walletAddress: currentAccount,
        balance: 0
      };
      setAuthData(user);
      return user as any;
    }
    
    return null;
  } catch (error) {
    console.error('Error connecting to wallet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    if (errorMessage.includes('User rejected')) {
      showError('Connection cancelled by user');
    } else {
      showError(errorMessage);
    }
    return null;
  } finally {
    connectWalletBtn.textContent = 'Connect Wallet';
    connectWalletBtn.disabled = false;
    connectWalletBtn.classList.remove('loading');
  }
}

function showError(message: string) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'status-indicator error';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 5000);
}

export async function checkWalletConnection(): Promise<void> {
  // First check if wallet is already connected
  if (walletConnector.isConnected()) {
    const account = walletConnector.getCurrentAccount();
    const chainId = walletConnector.getCurrentChainId();
    console.log('Found existing wallet connection:', account, 'on network:', chainId);
    
    // Update UI with existing connection
    const user = {
      id: account || '',
      email: account || '',
      walletAddress: account || '',
      balance: 0
    };
    setAuthData(user);
    return;
  }

  // Then check for Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    console.log('Found active Supabase session.');
    setAuthData(session.user);
  } else {
     console.log('No active connection found.');
  }
}

// Setup wallet event listeners
export function setupWalletEventListeners() {
  // Account changed handler
  walletConnector.onAccountChanged = (newAccount: string) => {
    console.log('Account changed to:', newAccount);
    const user = {
      id: newAccount,
      email: newAccount,
      walletAddress: newAccount,
      balance: 0
    };
    setAuthData(user);
    showError(`Switched to account: ${shortenAddress(newAccount)}`);
  };

  // Network changed handler  
  walletConnector.onNetworkChanged = (newChainId: string) => {
    console.log('Network changed to:', newChainId);
    const networkDisplay = document.querySelector<HTMLSpanElement>('#networkDisplay');
    if (networkDisplay) {
      networkDisplay.textContent = getNetworkName(newChainId);
    }
    showError(`Switched to network: ${getNetworkName(newChainId)}`);
  };

  // Disconnection handler
  walletConnector.onDisconnected = () => {
    console.log('Wallet disconnected');
    setAuthData(null);
    showError('Wallet disconnected');
  };
}

// Helper function to get network name
function getNetworkName(chainId: string): string {
  const networks: Record<string, string> = {
    '0x1': 'Ethereum Mainnet',
    '0x89': 'Polygon',
    '0xa4b1': 'Arbitrum One',
    '0x38': 'BSC',
    '0xaa36a7': 'Sepolia Testnet',
    '0x13881': 'Mumbai Testnet'
  };
  return networks[chainId] || `Unknown (${chainId})`;
}

// Centralized auth state listener
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event);
  if (event === 'SIGNED_OUT') {
    setAuthData(null);
  } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    if(session) {
        setAuthData(session.user);
    }
  }
});

