import { ethers } from "ethers";
import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import { trackPresence, untrackPresence } from './chat';

// This will hold the authenticated user data globally
export let authData: User | { id: string; balance: number; walletAddress: string; } | null = null;

export const setAuthData = (data: User | { id: string; balance: number; walletAddress: string; } | null) => {
  authData = data;
  updateUI(authData);
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

function updateUI(user: User | { id: string; balance: number; walletAddress: string; } | null) {
  const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
  const testLoginBtn = document.querySelector<HTMLButtonElement>('#testLoginBtn');
  const userInfo = document.querySelector<HTMLDivElement>('#userInfo');
  const userAddress = document.querySelector<HTMLSpanElement>('#userAddress');
  const battlePoints = document.querySelector<HTMLSpanElement>('#battlePoints');

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
  if (typeof window.ethereum !== 'undefined') {
    try {
      connectWalletBtn.textContent = 'Connecting...';
      connectWalletBtn.disabled = true;
      connectWalletBtn.classList.add('loading');

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const address = accounts[0];

      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (response.ok) {
        const { user, session } = await response.json();
        
        if (!user || !session) {
          throw new Error("Login did not return a user and session.");
        }
        
        await supabase.auth.setSession(session);
        setAuthData(user);
        console.log('Wallet connected and session set:', user.email);
        return user;
      } else {
        const errorData = await response.json();
        showError(errorData.error || 'Failed to login to server');
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      if (errorMessage.includes('User rejected')) {
        showError('Connection cancelled by user');
      } else {
        showError(errorMessage);
      }
    } finally {
      connectWalletBtn.textContent = 'Connect Wallet';
      connectWalletBtn.disabled = false;
      connectWalletBtn.classList.remove('loading');
    }
  } else {
    showError('Please install MetaMask to continue');
  }
  return null;
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
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    console.log('Found active Supabase session.');
    setAuthData(session.user);
  } else {
     console.log('No active Supabase session found.');
  }
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

// Dummy functions for now
async function connectWallet(): Promise<{ id: string, walletAddress: string, balance: number } | null> {
  // In a real app, this would use ethers or web3modal
  console.log("Connecting wallet...");
  return null; // Placeholder
}

async function getConnectedWallet(): Promise<{ id: string, walletAddress: string, balance: number } | null> {
  console.log("Checking for connected wallet...");
  return null;
}